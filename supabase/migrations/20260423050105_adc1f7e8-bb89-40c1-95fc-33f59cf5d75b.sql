
-- Add appointment_type to appointments (on-site or virtual)
DO $$ BEGIN
  CREATE TYPE public.appointment_type AS ENUM ('on_site_inspection', 'virtual_consultation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type public.appointment_type NOT NULL DEFAULT 'on_site_inspection',
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS booked_from_call_id uuid;

CREATE INDEX IF NOT EXISTS idx_appointments_at ON public.appointments (appointment_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (status);
CREATE INDEX IF NOT EXISTS idx_appointments_agent ON public.appointments (agent_id);

-- ROOFING QUALIFICATION TABLE
CREATE TABLE IF NOT EXISTS public.lead_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  call_attempt_id uuid,
  campaign_id uuid,
  agent_id uuid,
  company_id uuid,
  homeowner_status text,            -- owner / renter / decision_maker_other
  property_address text,
  roofing_issue text,                -- leak / storm_damage / aging / missing_shingles / other
  job_scope text,                    -- repair / replacement / unsure
  urgency public.urgency_level NOT NULL DEFAULT 'medium',
  insurance_involved boolean,
  insurance_status text,             -- claim_filed / approved / not_filed / no_insurance
  buying_intent text,                -- hot / warm / cold / not_interested
  timeline text,                     -- asap / 1_3_months / 3_6_months / 6_plus_months / unknown
  closer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_qual_contact ON public.lead_qualifications (contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_qual_call ON public.lead_qualifications (call_attempt_id);
CREATE INDEX IF NOT EXISTS idx_lead_qual_company ON public.lead_qualifications (company_id);

ALTER TABLE public.lead_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View lead_qualifications" ON public.lead_qualifications
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NULL OR is_same_company(company_id))
  );

CREATE POLICY "Insert lead_qualifications" ON public.lead_qualifications
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR auth.uid() = agent_id
  );

CREATE POLICY "Update lead_qualifications" ON public.lead_qualifications
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR auth.uid() = agent_id
  );

CREATE POLICY "Delete lead_qualifications" ON public.lead_qualifications
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_lead_qual_updated
  BEFORE UPDATE ON public.lead_qualifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-fill company_id from contact
CREATE OR REPLACE FUNCTION public.lead_qual_set_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.contacts WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_lead_qual_company
  BEFORE INSERT ON public.lead_qualifications
  FOR EACH ROW EXECUTE FUNCTION public.lead_qual_set_company();

-- FOLLOW-UP TASKS TABLE
DO $$ BEGIN
  CREATE TYPE public.follow_up_task_type AS ENUM (
    'confirmation_call',
    'reminder_24h',
    'send_appointment_details',
    'closer_handoff',
    'post_appointment_followup',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.follow_up_task_status AS ENUM ('pending','completed','skipped','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  appointment_id uuid,
  campaign_id uuid,
  agent_id uuid,
  assigned_to uuid,
  company_id uuid,
  task_type public.follow_up_task_type NOT NULL DEFAULT 'custom',
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  status public.follow_up_task_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_due ON public.follow_up_tasks (due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_appt ON public.follow_up_tasks (appointment_id);
CREATE INDEX IF NOT EXISTS idx_followup_assigned ON public.follow_up_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_followup_company ON public.follow_up_tasks (company_id);

ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View follow_up_tasks" ON public.follow_up_tasks
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NULL OR is_same_company(company_id))
  );

CREATE POLICY "Insert follow_up_tasks" ON public.follow_up_tasks
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR auth.uid() = agent_id
  );

CREATE POLICY "Update follow_up_tasks" ON public.follow_up_tasks
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR auth.uid() = assigned_to
    OR auth.uid() = agent_id
  );

CREATE POLICY "Delete follow_up_tasks" ON public.follow_up_tasks
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-create follow-up tasks when an appointment is booked
CREATE OR REPLACE FUNCTION public.create_appointment_follow_ups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM public.contacts WHERE id = NEW.contact_id;

  -- Send appointment details (immediately)
  INSERT INTO public.follow_up_tasks
    (contact_id, appointment_id, campaign_id, agent_id, assigned_to, company_id, task_type, title, description, due_at)
  VALUES
    (NEW.contact_id, NEW.id, NEW.campaign_id, NEW.agent_id, NEW.agent_id, v_company_id,
     'send_appointment_details', 'Send appointment confirmation',
     'Email/text appointment details to homeowner', now() + interval '15 minutes');

  -- 24h reminder
  IF NEW.appointment_at > now() + interval '25 hours' THEN
    INSERT INTO public.follow_up_tasks
      (contact_id, appointment_id, campaign_id, agent_id, assigned_to, company_id, task_type, title, description, due_at)
    VALUES
      (NEW.contact_id, NEW.id, NEW.campaign_id, NEW.agent_id, NEW.agent_id, v_company_id,
       'reminder_24h', 'Send 24-hour reminder',
       'Reminder text/call before the appointment', NEW.appointment_at - interval '24 hours');
  END IF;

  -- Confirmation call (2h before)
  IF NEW.appointment_at > now() + interval '3 hours' THEN
    INSERT INTO public.follow_up_tasks
      (contact_id, appointment_id, campaign_id, agent_id, assigned_to, company_id, task_type, title, description, due_at)
    VALUES
      (NEW.contact_id, NEW.id, NEW.campaign_id, NEW.agent_id, NEW.agent_id, v_company_id,
       'confirmation_call', 'Confirmation call',
       'Confirm homeowner is still available', NEW.appointment_at - interval '2 hours');
  END IF;

  -- Closer handoff (if a closer is assigned)
  IF NEW.closer_user_id IS NOT NULL THEN
    INSERT INTO public.follow_up_tasks
      (contact_id, appointment_id, campaign_id, agent_id, assigned_to, company_id, task_type, title, description, due_at)
    VALUES
      (NEW.contact_id, NEW.id, NEW.campaign_id, NEW.agent_id, NEW.closer_user_id, v_company_id,
       'closer_handoff', 'Closer handoff',
       COALESCE(NEW.handoff_notes, 'Review lead and prepare for the appointment'), now() + interval '30 minutes');
  END IF;

  -- Post-appointment follow-up
  INSERT INTO public.follow_up_tasks
    (contact_id, appointment_id, campaign_id, agent_id, assigned_to, company_id, task_type, title, description, due_at)
  VALUES
    (NEW.contact_id, NEW.id, NEW.campaign_id, NEW.agent_id, NEW.agent_id, v_company_id,
     'post_appointment_followup', 'Post-appointment follow-up',
     'Check in after the appointment', NEW.appointment_at + interval '4 hours');

  RETURN NEW;
END $$;

CREATE TRIGGER trg_appointment_followups
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.create_appointment_follow_ups();

-- AI Summary: add lead quality score + recommended action
ALTER TABLE public.ai_summaries
  ADD COLUMN IF NOT EXISTS lead_quality_score integer CHECK (lead_quality_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS recommended_action text;
