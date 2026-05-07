-- Per-agent Telnyx WebRTC credentials (admin-provisioned)
CREATE TABLE IF NOT EXISTS public.agent_telephony_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE,
  telnyx_credential_id text,
  telnyx_sip_username text,
  encrypted_telnyx_sip_password text,
  connection_id text,
  outbound_voice_profile_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_telephony_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent_telephony_credentials"
  ON public.agent_telephony_credentials FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents view own agent_telephony_credentials"
  ON public.agent_telephony_credentials FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

CREATE TRIGGER trg_atc_updated_at
  BEFORE UPDATE ON public.agent_telephony_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure call_recordings has helpful columns for the rebuilt webhook
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS download_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS available_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_call_recordings_attempt
  ON public.call_recordings (call_attempt_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_telnyx_id
  ON public.call_recordings (telnyx_recording_id)
  WHERE telnyx_recording_id IS NOT NULL;

-- Daily queue helper indexes
CREATE INDEX IF NOT EXISTS idx_daily_assignments_agent_date
  ON public.daily_lead_assignments (agent_id, assigned_date, status);

-- Lock-next assignment RPC for the agent's daily queue
CREATE OR REPLACE FUNCTION public.lock_next_daily_assignment(_agent_id uuid, _campaign_id uuid DEFAULT NULL)
RETURNS public.daily_lead_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.daily_lead_assignments;
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _agent_id
     AND NOT public.has_role(auth.uid(),'admin'::app_role)
     AND NOT public.has_role(auth.uid(),'manager'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.daily_lead_assignments d
     SET status = 'calling', locked_at = now(), locked_by = auth.uid()
   WHERE d.id = (
     SELECT id FROM public.daily_lead_assignments
      WHERE agent_id = _agent_id
        AND assigned_date = CURRENT_DATE
        AND status IN ('new','assigned','no_answer','voicemail','callback')
        AND (_campaign_id IS NULL OR campaign_id = _campaign_id)
        AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
      ORDER BY queue_position ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
   RETURNING * INTO r;
  RETURN r;
END $$;

GRANT EXECUTE ON FUNCTION public.lock_next_daily_assignment(uuid, uuid) TO authenticated;