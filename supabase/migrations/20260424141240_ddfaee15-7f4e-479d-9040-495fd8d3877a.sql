-- ============================================================
-- Power / Predictive dialer server-side RPCs
-- Built on top of the existing schema (campaign_contacts, call_attempts, campaign_agents).
-- No destructive changes.
-- ============================================================

-- Helpful indexes for the queue picker
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_queue_pick
  ON public.campaign_contacts (campaign_id, dial_status, next_eligible_at, priority_band, priority_score);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_agent_lock
  ON public.campaign_contacts (assigned_agent_id, dial_status);

CREATE INDEX IF NOT EXISTS idx_call_attempts_agent_started
  ON public.call_attempts (agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_attempts_telnyx_call_id
  ON public.call_attempts (telnyx_call_id);

-- ------------------------------------------------------------
-- get_next_lead_for_agent
-- Atomically locks the next dialable contact for an agent.
-- Returns the contact row + campaign_contact metadata.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_lead_for_agent(
  _agent_id uuid,
  _campaign_id uuid
)
RETURNS TABLE (
  contact_id uuid,
  campaign_contact_id uuid,
  first_name text,
  last_name text,
  phone_e164 text,
  state text,
  city text,
  zip_code text,
  attempts integer,
  priority_band public.priority_band,
  priority_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_attempts integer;
  v_picked record;
BEGIN
  -- Authorization: caller must be the agent themselves OR an admin/manager
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _agent_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to pull leads for another agent';
  END IF;

  -- Agent must be on the campaign
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_agents
    WHERE user_id = _agent_id AND campaign_id = _campaign_id
  ) THEN
    RAISE EXCEPTION 'Agent is not assigned to this campaign';
  END IF;

  SELECT COALESCE(max_attempts, 5) INTO v_max_attempts
  FROM public.campaigns WHERE id = _campaign_id;

  -- Step 1: Find an eligible contact in the current round
  SELECT cc.id AS cc_id, cc.contact_id AS c_id, cc.attempts, cc.priority_band, cc.priority_score
    INTO v_picked
  FROM public.campaign_contacts cc
  JOIN public.contacts c ON c.id = cc.contact_id
  WHERE cc.campaign_id = _campaign_id
    AND cc.dial_status = 'pending'
    AND COALESCE(cc.attempts, 0) < v_max_attempts
    AND (cc.next_eligible_at IS NULL OR cc.next_eligible_at <= now())
    AND (c.locked_to_agent_id IS NULL OR c.locked_to_agent_id = _agent_id)
    AND public.is_contact_dialable(c.id, _campaign_id)
  ORDER BY
    CASE cc.priority_band WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
    COALESCE(cc.priority_score, 0) DESC,
    cc.created_at ASC
  FOR UPDATE OF cc SKIP LOCKED
  LIMIT 1;

  -- Step 2: If nothing pending, recycle 'completed' rows back to pending (next round)
  IF v_picked IS NULL THEN
    UPDATE public.campaign_contacts
       SET dial_status = 'pending',
           next_eligible_at = NULL
     WHERE campaign_id = _campaign_id
       AND dial_status = 'completed'
       AND COALESCE(attempts, 0) < v_max_attempts;

    SELECT cc.id AS cc_id, cc.contact_id AS c_id, cc.attempts, cc.priority_band, cc.priority_score
      INTO v_picked
    FROM public.campaign_contacts cc
    JOIN public.contacts c ON c.id = cc.contact_id
    WHERE cc.campaign_id = _campaign_id
      AND cc.dial_status = 'pending'
      AND COALESCE(cc.attempts, 0) < v_max_attempts
      AND (c.locked_to_agent_id IS NULL OR c.locked_to_agent_id = _agent_id)
      AND public.is_contact_dialable(c.id, _campaign_id)
    ORDER BY
      CASE cc.priority_band WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      COALESCE(cc.priority_score, 0) DESC,
      cc.created_at ASC
    FOR UPDATE OF cc SKIP LOCKED
    LIMIT 1;
  END IF;

  IF v_picked IS NULL THEN
    RETURN;
  END IF;

  -- Step 3: Lock the campaign_contact to this agent
  UPDATE public.campaign_contacts
     SET dial_status = 'dialing',
         assigned_agent_id = _agent_id,
         last_called_at = now()
   WHERE id = v_picked.cc_id;

  -- Step 4: Return the contact row
  RETURN QUERY
  SELECT
    c.id,
    v_picked.cc_id,
    c.first_name,
    c.last_name,
    c.phone_e164,
    c.state,
    c.city,
    c.zip_code,
    COALESCE(v_picked.attempts, 0),
    v_picked.priority_band,
    v_picked.priority_score
  FROM public.contacts c
  WHERE c.id = v_picked.c_id;
END;
$$;

-- ------------------------------------------------------------
-- complete_dial_attempt
-- Apply disposition after a call ends.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_dial_attempt(
  _call_attempt_id uuid,
  _disposition text,
  _notes text DEFAULT NULL,
  _callback_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.call_attempts%ROWTYPE;
  v_retry_seconds integer := 0;
  v_next_eligible timestamptz;
  v_new_dial_status public.dial_status;
  v_new_outcome public.call_outcome;
  v_new_lead_status public.lead_status;
BEGIN
  SELECT * INTO v_call FROM public.call_attempts WHERE id = _call_attempt_id;
  IF v_call.id IS NULL THEN
    RAISE EXCEPTION 'Call attempt not found';
  END IF;

  -- Authorization
  IF auth.uid() IS NOT NULL
     AND v_call.agent_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to disposition this call';
  END IF;

  -- Look up campaign retry delays
  SELECT
    CASE _disposition
      WHEN 'voicemail' THEN COALESCE(retry_delay_voicemail, 600)
      WHEN 'no_answer' THEN COALESCE(retry_delay_no_answer, 300)
      WHEN 'busy' THEN COALESCE(retry_delay_no_answer, 300)
      WHEN 'not_interested' THEN COALESCE(retry_delay_no_answer, 300) * 4
      ELSE 0
    END
  INTO v_retry_seconds
  FROM public.campaigns WHERE id = v_call.campaign_id;

  -- Map disposition -> outcome / dial_status / lead_status
  CASE _disposition
    WHEN 'appointment_booked' THEN
      v_new_outcome := 'appointment_booked';
      v_new_dial_status := 'completed';
      v_new_lead_status := 'qualified';
    WHEN 'dnc' THEN
      v_new_outcome := 'dnc_request';
      v_new_dial_status := 'suppressed';
      v_new_lead_status := 'do_not_call';
    WHEN 'wrong_number' THEN
      v_new_outcome := 'wrong_number';
      v_new_dial_status := 'suppressed';
      v_new_lead_status := 'unqualified';
    WHEN 'voicemail' THEN
      v_new_outcome := 'voicemail';
      v_new_dial_status := 'pending';
      v_new_lead_status := 'contacted';
    WHEN 'no_answer' THEN
      v_new_outcome := 'no_answer';
      v_new_dial_status := 'pending';
      v_new_lead_status := 'contacted';
    WHEN 'busy' THEN
      v_new_outcome := 'busy';
      v_new_dial_status := 'pending';
      v_new_lead_status := 'contacted';
    WHEN 'not_interested' THEN
      v_new_outcome := 'not_interested';
      v_new_dial_status := 'completed';
      v_new_lead_status := 'unqualified';
    WHEN 'callback' THEN
      v_new_outcome := 'callback_scheduled';
      v_new_dial_status := 'pending';
      v_new_lead_status := 'contacted';
    WHEN 'connected' THEN
      v_new_outcome := 'connected';
      v_new_dial_status := 'completed';
      v_new_lead_status := 'contacted';
    WHEN 'already_customer' THEN
      v_new_outcome := 'already_customer';
      v_new_dial_status := 'suppressed';
      v_new_lead_status := 'qualified';
    ELSE
      v_new_outcome := 'failed';
      v_new_dial_status := 'pending';
      v_new_lead_status := NULL;
  END CASE;

  v_next_eligible := CASE
    WHEN _disposition = 'callback' AND _callback_at IS NOT NULL THEN _callback_at
    WHEN v_retry_seconds > 0 THEN now() + make_interval(secs => v_retry_seconds)
    ELSE NULL
  END;

  -- Update call_attempts
  UPDATE public.call_attempts
     SET disposition = _disposition,
         outcome = v_new_outcome,
         notes = COALESCE(_notes, notes),
         ended_at = COALESCE(ended_at, now())
   WHERE id = _call_attempt_id;

  -- Update campaign_contacts: increment attempts, release lock, schedule retry
  IF v_call.campaign_id IS NOT NULL AND v_call.contact_id IS NOT NULL THEN
    UPDATE public.campaign_contacts
       SET dial_status = v_new_dial_status,
           attempts = COALESCE(attempts, 0) + 1,
           assigned_agent_id = NULL,
           next_eligible_at = v_next_eligible,
           callback_at = CASE WHEN _disposition = 'callback' THEN _callback_at ELSE callback_at END,
           last_called_at = now()
     WHERE campaign_id = v_call.campaign_id
       AND contact_id = v_call.contact_id;
  END IF;

  -- Update lead status on contact
  IF v_new_lead_status IS NOT NULL AND v_call.contact_id IS NOT NULL THEN
    UPDATE public.contacts
       SET lead_status = v_new_lead_status,
           updated_at = now()
     WHERE id = v_call.contact_id;
  END IF;

  -- Insert callback row if scheduled
  IF _disposition = 'callback' AND _callback_at IS NOT NULL AND v_call.contact_id IS NOT NULL THEN
    INSERT INTO public.callbacks (contact_id, agent_id, campaign_id, callback_at, notes, status)
    VALUES (v_call.contact_id, v_call.agent_id, v_call.campaign_id, _callback_at, _notes, 'pending');
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- record_call_event (used by webhook)
-- Updates call_attempts based on Telnyx events and appends to call_events.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_call_event(
  _telnyx_call_id text,
  _event_type public.call_event_type,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_attempt_id uuid;
  v_started_at timestamptz;
BEGIN
  SELECT id, started_at
    INTO v_call_attempt_id, v_started_at
  FROM public.call_attempts
  WHERE telnyx_call_id = _telnyx_call_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_call_attempt_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.call_events (call_attempt_id, event_type, payload)
  VALUES (v_call_attempt_id, _event_type, _payload);

  -- Mirror key state changes onto call_attempts
  IF _event_type = 'answered' THEN
    UPDATE public.call_attempts
       SET started_at = COALESCE(started_at, now())
     WHERE id = v_call_attempt_id;
  ELSIF _event_type IN ('hangup_local', 'hangup_remote') THEN
    UPDATE public.call_attempts
       SET ended_at = COALESCE(ended_at, now()),
           duration_seconds = COALESCE(
             duration_seconds,
             GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_started_at, now())))::integer)
           )
     WHERE id = v_call_attempt_id;
  ELSIF _event_type = 'no_answer' THEN
    UPDATE public.call_attempts
       SET outcome = 'no_answer',
           ended_at = COALESCE(ended_at, now())
     WHERE id = v_call_attempt_id;
  ELSIF _event_type = 'voicemail' THEN
    UPDATE public.call_attempts
       SET outcome = 'voicemail'
     WHERE id = v_call_attempt_id;
  ELSIF _event_type = 'busy' THEN
    UPDATE public.call_attempts
       SET outcome = 'busy',
           ended_at = COALESCE(ended_at, now())
     WHERE id = v_call_attempt_id;
  ELSIF _event_type = 'failed' THEN
    UPDATE public.call_attempts
       SET outcome = 'failed',
           ended_at = COALESCE(ended_at, now())
     WHERE id = v_call_attempt_id;
  END IF;

  RETURN v_call_attempt_id;
END;
$$;

-- Grants (authenticated callers can invoke; service role uses RPC via webhook)
GRANT EXECUTE ON FUNCTION public.get_next_lead_for_agent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_dial_attempt(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_call_event(text, public.call_event_type, jsonb) TO service_role;