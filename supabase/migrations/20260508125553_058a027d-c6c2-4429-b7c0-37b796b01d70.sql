-- 1) ai_summaries: scope managers to same company via call_attempts -> campaigns
DROP POLICY IF EXISTS "View ai_call_summaries" ON public.ai_summaries;
CREATE POLICY "View ai_call_summaries"
ON public.ai_summaries
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.call_attempts cl
    WHERE cl.id = ai_summaries.call_attempt_id
      AND cl.agent_id = auth.uid()
  )
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.call_attempts cl
      JOIN public.campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = ai_summaries.call_attempt_id
        AND is_same_company(c.company_id)
    )
  )
);

-- 2) call_transcripts: scope managers/team_leaders to same company
DROP POLICY IF EXISTS "View recording_transcripts" ON public.call_transcripts;
CREATE POLICY "View recording_transcripts"
ON public.call_transcripts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.call_recordings r
    JOIN public.call_attempts cl ON cl.id = r.call_attempt_id
    WHERE r.id = call_transcripts.call_recording_id
      AND cl.agent_id = auth.uid()
  )
  OR (
    (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.call_recordings r
      JOIN public.call_attempts cl ON cl.id = r.call_attempt_id
      JOIN public.campaigns c ON c.id = cl.campaign_id
      WHERE r.id = call_transcripts.call_recording_id
        AND is_same_company(c.company_id)
    )
  )
);

-- 3) call_monitoring_sessions: scope team_leaders to same company via campaign_id (or call_attempts -> campaign)
DROP POLICY IF EXISTS "View monitoring sessions" ON public.call_monitoring_sessions;
CREATE POLICY "View monitoring sessions"
ON public.call_monitoring_sessions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'team_leader'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE (
        c.id = call_monitoring_sessions.campaign_id
        OR c.id = (
          SELECT campaign_id FROM public.call_attempts
          WHERE id = call_monitoring_sessions.call_attempt_id
        )
      )
        AND is_same_company(c.company_id)
    )
  )
);

-- 4) dialer_logs: scope managers to same company via campaign_id
DROP POLICY IF EXISTS "Admins and managers view dialer_logs" ON public.dialer_logs;
CREATE POLICY "Admins and managers view dialer_logs"
ON public.dialer_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      campaign_id IS NULL  -- legacy rows; only admins effectively see them via the OR above
      OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = dialer_logs.campaign_id
          AND is_same_company(c.company_id)
      )
    )
    AND campaign_id IS NOT NULL
  )
);

-- 5) companies: allow same-company employees to read their own company record
DROP POLICY IF EXISTS "Employees can view own company" ON public.companies;
CREATE POLICY "Employees can view own company"
ON public.companies
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR id = current_company_id()
);

-- 6) contacts: extend contact_in_user_company to also accept direct contacts.company_id
CREATE OR REPLACE FUNCTION public.contact_in_user_company(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = _contact_id
        AND c.company_id IS NOT NULL
        AND is_same_company(c.company_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_contacts cc
      JOIN public.campaigns c ON c.id = cc.campaign_id
      WHERE cc.contact_id = _contact_id
        AND c.company_id = current_company_id()
    );
$$;

-- 7) Realtime topic authorization: scope managers to same-company resources
CREATE OR REPLACE FUNCTION public.can_subscribe_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_is_admin boolean;
  v_is_manager boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  v_is_admin := has_role(v_user, 'admin'::app_role);
  v_is_manager := has_role(v_user, 'manager'::app_role);

  -- Admins can subscribe to anything internal
  IF v_is_admin THEN
    RETURN true;
  END IF;

  -- technician_appointments:<id> -> assigned technician, or same-company manager
  IF _topic LIKE 'technician_appointments:%' THEN
    BEGIN
      v_id := substring(_topic from 'technician_appointments:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF EXISTS (
      SELECT 1 FROM public.technician_appointments ta
      JOIN public.technicians t ON t.id = ta.technician_id
      WHERE ta.id = v_id AND t.user_id = v_user
    ) THEN
      RETURN true;
    END IF;
    IF v_is_manager THEN
      RETURN EXISTS (
        SELECT 1 FROM public.technician_appointments ta
        JOIN public.technicians t ON t.id = ta.technician_id
        WHERE ta.id = v_id
          AND is_same_company(t.company_id)
      );
    END IF;
    RETURN false;
  END IF;

  -- technician:<technician_id> -> the technician themselves, or same-company manager
  IF _topic LIKE 'technician:%' THEN
    BEGIN
      v_id := substring(_topic from 'technician:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = v_id AND t.user_id = v_user
    ) THEN
      RETURN true;
    END IF;
    IF v_is_manager THEN
      RETURN EXISTS (
        SELECT 1 FROM public.technicians t
        WHERE t.id = v_id
          AND is_same_company(t.company_id)
      );
    END IF;
    RETURN false;
  END IF;

  -- user:<uid> -> only that user
  IF _topic LIKE 'user:%' THEN
    BEGIN
      v_id := substring(_topic from 'user:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN v_id = v_user;
  END IF;

  -- Default deny
  RETURN false;
END;
$$;