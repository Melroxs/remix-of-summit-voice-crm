
-- 1. daily_lead_assignments table
CREATE TYPE public.daily_assignment_status AS ENUM (
  'new','assigned','calling','completed','callback','no_answer','voicemail','not_interested','appointment_set','do_not_call'
);

CREATE TABLE public.daily_lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  assigned_by UUID,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  queue_position INTEGER NOT NULL DEFAULT 0,
  status public.daily_assignment_status NOT NULL DEFAULT 'assigned',
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  disposition TEXT,
  call_attempt_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dla_unique_per_day ON public.daily_lead_assignments (campaign_id, contact_id, assigned_date);
CREATE INDEX idx_dla_agent_date ON public.daily_lead_assignments (agent_id, assigned_date, queue_position);
CREATE INDEX idx_dla_status ON public.daily_lead_assignments (status);

ALTER TABLE public.daily_lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents view own daily assignments"
  ON public.daily_lead_assignments FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'team_leader'::app_role));

CREATE POLICY "Agents update own daily assignments"
  ON public.daily_lead_assignments FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Admins manage daily assignments"
  ON public.daily_lead_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER update_dla_updated_at BEFORE UPDATE ON public.daily_lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Augment call_attempts
ALTER TABLE public.call_attempts
  ADD COLUMN IF NOT EXISTS telnyx_call_control_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_call_session_id TEXT,
  ADD COLUMN IF NOT EXISTS from_number TEXT,
  ADD COLUMN IF NOT EXISTS to_number TEXT,
  ADD COLUMN IF NOT EXISTS call_status TEXT,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

CREATE INDEX IF NOT EXISTS idx_call_attempts_control_id ON public.call_attempts (telnyx_call_control_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_session_id ON public.call_attempts (telnyx_call_session_id);

-- 3. RPCs for queue lock/unlock
CREATE OR REPLACE FUNCTION public.lock_queue_assignment(_assignment_id UUID)
RETURNS public.daily_lead_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.daily_lead_assignments;
BEGIN
  UPDATE public.daily_lead_assignments
    SET status = 'calling', locked_at = now(), locked_by = auth.uid()
    WHERE id = _assignment_id
      AND (agent_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
      AND status IN ('new','assigned','no_answer','voicemail','callback')
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Cannot lock assignment'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.complete_queue_assignment(
  _assignment_id UUID, _disposition TEXT, _notes TEXT, _call_attempt_id UUID
) RETURNS public.daily_lead_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.daily_lead_assignments; v_status public.daily_assignment_status;
BEGIN
  v_status := CASE _disposition
    WHEN 'appointment_booked' THEN 'appointment_set'::public.daily_assignment_status
    WHEN 'callback' THEN 'callback'::public.daily_assignment_status
    WHEN 'no_answer' THEN 'no_answer'::public.daily_assignment_status
    WHEN 'voicemail' THEN 'voicemail'::public.daily_assignment_status
    WHEN 'not_interested' THEN 'not_interested'::public.daily_assignment_status
    WHEN 'dnc' THEN 'do_not_call'::public.daily_assignment_status
    ELSE 'completed'::public.daily_assignment_status
  END;
  UPDATE public.daily_lead_assignments
    SET status = v_status, completed_at = now(), disposition = _disposition,
        notes = COALESCE(_notes, notes), call_attempt_id = COALESCE(_call_attempt_id, call_attempt_id),
        locked_at = NULL, locked_by = NULL
    WHERE id = _assignment_id
      AND (agent_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Cannot complete assignment'; END IF;
  RETURN r;
END $$;
