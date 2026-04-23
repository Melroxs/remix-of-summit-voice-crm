
-- =========================================================
-- 1. RENAMES (preserve data)
-- =========================================================
ALTER TABLE public.call_logs RENAME TO call_attempts;
ALTER TABLE public.recordings RENAME TO call_recordings;
ALTER TABLE public.recording_transcripts RENAME TO call_transcripts;
ALTER TABLE public.import_jobs RENAME TO lead_imports;
ALTER TABLE public.import_errors RENAME TO lead_import_rows;
ALTER TABLE public.ai_call_summaries RENAME TO ai_summaries;
ALTER TABLE public.qa_scores RENAME TO qa_reviews;
ALTER TABLE public.training_simulations RENAME TO training_assets;
ALTER TABLE public.agent_feedback RENAME TO notes;

-- Rename FK columns to match new table names
ALTER TABLE public.call_recordings RENAME COLUMN call_log_id TO call_attempt_id;
ALTER TABLE public.call_attempts RENAME COLUMN recording_id TO call_recording_id;
ALTER TABLE public.call_transcripts RENAME COLUMN recording_id TO call_recording_id;
ALTER TABLE public.lead_import_rows RENAME COLUMN import_job_id TO lead_import_id;
ALTER TABLE public.contacts RENAME COLUMN import_job_id TO lead_import_id;
ALTER TABLE public.ai_summaries RENAME COLUMN call_log_id TO call_attempt_id;
ALTER TABLE public.qa_reviews RENAME COLUMN call_log_id TO call_attempt_id;
ALTER TABLE public.notes RENAME COLUMN call_log_id TO call_attempt_id;
ALTER TABLE public.call_monitoring_sessions RENAME COLUMN call_log_id TO call_attempt_id;

-- =========================================================
-- 2. ENUMS
-- =========================================================
CREATE TYPE public.phone_type AS ENUM ('mobile', 'home', 'work', 'other');
CREATE TYPE public.dnc_source AS ENUM ('agent', 'consumer_request', 'federal_dnc', 'litigator', 'imported');
CREATE TYPE public.note_type AS ENUM ('call_note', 'contact_note', 'agent_feedback', 'qa_note', 'system');
CREATE TYPE public.urgency_level AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.call_event_type AS ENUM (
  'initiated','ringing','answered','no_answer','voicemail','busy','failed',
  'hangup_local','hangup_remote','dtmf','recording_started','recording_completed','transferred'
);
CREATE TYPE public.call_outcome AS ENUM (
  'pending','connected','no_answer','voicemail','busy','wrong_number','dnc_request',
  'not_interested','callback_scheduled','appointment_booked','already_customer','failed'
);
CREATE TYPE public.dial_session_status AS ENUM ('active','paused','ended');

-- =========================================================
-- 3. SPLIT campaign_phone_numbers → caller_ids + campaign_caller_ids
-- =========================================================
CREATE TABLE public.caller_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  area_code text,
  provider text NOT NULL DEFAULT 'telnyx',
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  max_calls_per_hour int NOT NULL DEFAULT 15,
  max_calls_per_day int NOT NULL DEFAULT 100,
  cooldown_minutes int NOT NULL DEFAULT 30,
  health_status public.number_health_status NOT NULL DEFAULT 'healthy',
  total_calls int NOT NULL DEFAULT 0,
  answered_calls int NOT NULL DEFAULT 0,
  appointments int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone_e164)
);

CREATE TABLE public.campaign_caller_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES public.caller_ids(id) ON DELETE CASCADE,
  rotation_order int NOT NULL DEFAULT 0,
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, caller_id)
);

-- Migrate existing data
INSERT INTO public.caller_ids (company_id, phone_e164, area_code, provider, is_active, max_calls_per_hour, max_calls_per_day, cooldown_minutes, last_used_at, created_at)
SELECT
  COALESCE(c.company_id, (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)),
  cpn.phone_number,
  cpn.area_code,
  cpn.provider,
  cpn.is_active,
  cpn.max_calls_per_hour,
  cpn.max_calls_per_day,
  cpn.cooldown_minutes,
  cpn.last_used_at,
  cpn.created_at
FROM public.campaign_phone_numbers cpn
JOIN public.campaigns c ON c.id = cpn.campaign_id
ON CONFLICT (company_id, phone_e164) DO NOTHING;

INSERT INTO public.campaign_caller_ids (campaign_id, caller_id, rotation_order, priority)
SELECT cpn.campaign_id, ci.id, cpn.rotation_order, cpn.priority
FROM public.campaign_phone_numbers cpn
JOIN public.campaigns c ON c.id = cpn.campaign_id
JOIN public.caller_ids ci ON ci.phone_e164 = cpn.phone_number
  AND ci.company_id = COALESCE(c.company_id, (SELECT id FROM public.companies ORDER BY created_at LIMIT 1))
ON CONFLICT (campaign_id, caller_id) DO NOTHING;

-- Migrate phone_number_stats into caller_ids columns
UPDATE public.caller_ids ci SET
  total_calls = COALESCE(s.total_calls, 0),
  answered_calls = COALESCE(s.answered_calls, 0),
  appointments = COALESCE(s.appointments, 0),
  health_status = COALESCE(s.health_status, 'healthy'::public.number_health_status),
  cooldown_until = s.cooldown_until
FROM public.phone_number_stats s
JOIN public.campaign_phone_numbers cpn ON cpn.id = s.phone_number_id
WHERE ci.phone_e164 = cpn.phone_number;

-- Drop old tables
DROP TABLE public.phone_number_stats;
DROP TABLE public.campaign_phone_numbers;

-- =========================================================
-- 4. NEW TABLE: contact_phone_numbers (multi-phone per contact)
-- =========================================================
CREATE TABLE public.contact_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_raw text,
  phone_e164 text NOT NULL,
  phone_type public.phone_type NOT NULL DEFAULT 'mobile',
  is_primary boolean NOT NULL DEFAULT false,
  is_dnc boolean NOT NULL DEFAULT false,
  is_wrong_number boolean NOT NULL DEFAULT false,
  is_voicemail_only boolean NOT NULL DEFAULT false,
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone_e164)
);

-- Backfill from existing contacts.phone_e164
INSERT INTO public.contact_phone_numbers (contact_id, company_id, phone_raw, phone_e164, is_primary)
SELECT
  c.id,
  COALESCE(
    (SELECT cmp.company_id FROM public.campaign_contacts cc JOIN public.campaigns cmp ON cmp.id = cc.campaign_id WHERE cc.contact_id = c.id LIMIT 1),
    (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
  ),
  c.phone_raw,
  c.phone_e164,
  true
FROM public.contacts c
WHERE c.phone_e164 IS NOT NULL
ON CONFLICT (company_id, phone_e164) DO NOTHING;

-- =========================================================
-- 5. NEW TABLE: dial_sessions
-- =========================================================
CREATE TABLE public.dial_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  status public.dial_session_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  paused_seconds int NOT NULL DEFAULT 0,
  total_attempts int NOT NULL DEFAULT 0,
  total_connects int NOT NULL DEFAULT 0,
  total_appointments int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link call_attempts to dial_sessions
ALTER TABLE public.call_attempts ADD COLUMN dial_session_id uuid REFERENCES public.dial_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.call_attempts ADD COLUMN attempt_number int NOT NULL DEFAULT 1;
ALTER TABLE public.call_attempts ADD COLUMN outcome public.call_outcome NOT NULL DEFAULT 'pending';

-- =========================================================
-- 6. NEW TABLE: call_events (append-only stream)
-- =========================================================
CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_attempt_id uuid NOT NULL REFERENCES public.call_attempts(id) ON DELETE CASCADE,
  event_type public.call_event_type NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 7. NEW TABLE: dnc_entries
-- =========================================================
CREATE TABLE public.dnc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  source public.dnc_source NOT NULL DEFAULT 'consumer_request',
  reason text,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone_e164)
);

-- =========================================================
-- 8. NEW TABLE: daily_reports
-- =========================================================
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  agent_id uuid,
  report_date date NOT NULL,
  total_attempts int NOT NULL DEFAULT 0,
  total_connects int NOT NULL DEFAULT 0,
  total_voicemails int NOT NULL DEFAULT 0,
  total_appointments int NOT NULL DEFAULT 0,
  total_callbacks int NOT NULL DEFAULT 0,
  total_dnc int NOT NULL DEFAULT 0,
  total_wrong_numbers int NOT NULL DEFAULT 0,
  talk_time_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, campaign_id, agent_id, report_date)
);

-- =========================================================
-- 9. NEW TABLE: client_notifications
-- =========================================================
CREATE TABLE public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_account_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 10. EXTEND appointments
-- =========================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS urgency public.urgency_level NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS closer_user_id uuid,
  ADD COLUMN IF NOT EXISTS handoff_notes text,
  ADD COLUMN IF NOT EXISTS contact_phone_id uuid REFERENCES public.contact_phone_numbers(id) ON DELETE SET NULL;

-- =========================================================
-- 11. EXTEND ai_summaries
-- =========================================================
ALTER TABLE public.ai_summaries
  ADD COLUMN IF NOT EXISTS quality_score int CHECK (quality_score IS NULL OR (quality_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS next_step_recommendation text;

-- =========================================================
-- 12. OWNERSHIP LOCK on contacts
-- =========================================================
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS locked_to_agent_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill contacts.company_id from campaigns
UPDATE public.contacts c SET company_id = (
  SELECT cmp.company_id FROM public.campaign_contacts cc
  JOIN public.campaigns cmp ON cmp.id = cc.campaign_id
  WHERE cc.contact_id = c.id LIMIT 1
)
WHERE company_id IS NULL;

UPDATE public.contacts SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

-- =========================================================
-- 13. BUSINESS-RULE FUNCTIONS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_contact_dialable(_contact_id uuid, _campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ctx AS (
    SELECT c.id, c.company_id, c.locked_to_agent_id, cc.attempts,
      COALESCE(cmp.max_attempts, 3) AS max_attempts
    FROM public.contacts c
    LEFT JOIN public.campaign_contacts cc ON cc.contact_id = c.id AND cc.campaign_id = _campaign_id
    LEFT JOIN public.campaigns cmp ON cmp.id = _campaign_id
    WHERE c.id = _contact_id
  )
  SELECT EXISTS (
    SELECT 1 FROM ctx
    WHERE attempts < max_attempts
      AND NOT EXISTS (
        SELECT 1 FROM public.dnc_entries dnc
        JOIN public.contact_phone_numbers cp ON cp.phone_e164 = dnc.phone_e164
        WHERE cp.contact_id = ctx.id
          AND (dnc.company_id IS NULL OR dnc.company_id = ctx.company_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.contact_phone_numbers cp
        WHERE cp.contact_id = ctx.id
          AND (cp.is_dnc OR cp.is_wrong_number)
      )
  );
$$;

-- Lock contact to agent on connected outcome
CREATE OR REPLACE FUNCTION public.lock_contact_on_connect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.outcome IN ('connected','appointment_booked','callback_scheduled')
     AND OLD.outcome != NEW.outcome
     AND NEW.contact_id IS NOT NULL
     AND NEW.agent_id IS NOT NULL THEN
    UPDATE public.contacts
       SET locked_to_agent_id = NEW.agent_id, locked_at = now()
     WHERE id = NEW.contact_id AND locked_to_agent_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_contact_on_connect ON public.call_attempts;
CREATE TRIGGER trg_lock_contact_on_connect
AFTER UPDATE ON public.call_attempts
FOR EACH ROW EXECUTE FUNCTION public.lock_contact_on_connect();

-- Auto-mark wrong number / dnc on phone when disposition matches
CREATE OR REPLACE FUNCTION public.flag_phone_from_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.outcome = 'wrong_number' AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.contact_phone_numbers
       SET is_wrong_number = true
     WHERE contact_id = NEW.contact_id
       AND phone_e164 = COALESCE(
         (SELECT phone_e164 FROM public.contact_phone_numbers WHERE contact_id = NEW.contact_id AND is_primary LIMIT 1),
         (SELECT phone_e164 FROM public.contacts WHERE id = NEW.contact_id)
       );
  ELSIF NEW.outcome = 'dnc_request' AND NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.dnc_entries (company_id, phone_e164, source, reason, added_by)
    SELECT c.company_id, c.phone_e164, 'consumer_request', 'Marked DNC during call', NEW.agent_id
    FROM public.contacts c WHERE c.id = NEW.contact_id AND c.phone_e164 IS NOT NULL
    ON CONFLICT (company_id, phone_e164) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_phone_from_outcome ON public.call_attempts;
CREATE TRIGGER trg_flag_phone_from_outcome
AFTER UPDATE ON public.call_attempts
FOR EACH ROW EXECUTE FUNCTION public.flag_phone_from_outcome();

-- =========================================================
-- 14. INDEXES (queue performance)
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_queue
  ON public.campaign_contacts (campaign_id, dial_status, priority_band, next_eligible_at)
  WHERE dial_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_call_attempts_contact ON public.call_attempts (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_attempts_agent ON public.call_attempts (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_attempts_campaign ON public.call_attempts (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_events_attempt ON public.call_events (call_attempt_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_contact_phone_numbers_e164 ON public.contact_phone_numbers (phone_e164);
CREATE INDEX IF NOT EXISTS idx_contact_phone_numbers_contact ON public.contact_phone_numbers (contact_id);
CREATE INDEX IF NOT EXISTS idx_dnc_entries_phone ON public.dnc_entries (phone_e164);
CREATE INDEX IF NOT EXISTS idx_dial_sessions_agent_status ON public.dial_sessions (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_caller_ids_company_active ON public.caller_ids (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_campaign_caller_ids_campaign ON public.campaign_caller_ids (campaign_id, rotation_order);
CREATE INDEX IF NOT EXISTS idx_daily_reports_lookup ON public.daily_reports (company_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_notifications_unread ON public.client_notifications (company_id, is_read, created_at DESC);

-- =========================================================
-- 15. ENABLE RLS on new tables
-- =========================================================
ALTER TABLE public.caller_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_caller_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dial_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- caller_ids: admin/manager manage; agents on a campaign can view assigned numbers
CREATE POLICY "Admins manage caller_ids" ON public.caller_ids FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role) AND is_same_company(company_id))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND is_same_company(company_id));
CREATE POLICY "Same-company view caller_ids" ON public.caller_ids FOR SELECT
  USING (is_same_company(company_id));

CREATE POLICY "Admins manage campaign_caller_ids" ON public.campaign_caller_ids FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Agents view campaign_caller_ids" ON public.campaign_caller_ids FOR SELECT
  USING (is_agent_on_campaign(auth.uid(), campaign_id));

-- contact_phone_numbers
CREATE POLICY "View contact_phone_numbers" ON public.contact_phone_numbers FOR SELECT
  USING (is_same_company(company_id));
CREATE POLICY "Insert contact_phone_numbers" ON public.contact_phone_numbers FOR INSERT
  WITH CHECK (is_same_company(company_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'agent'::app_role)));
CREATE POLICY "Update contact_phone_numbers" ON public.contact_phone_numbers FOR UPDATE
  USING (is_same_company(company_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'agent'::app_role)));
CREATE POLICY "Delete contact_phone_numbers" ON public.contact_phone_numbers FOR DELETE
  USING (has_role(auth.uid(),'admin'::app_role));

-- dial_sessions: agent owns own; admin/manager view all
CREATE POLICY "Agents own dial_sessions" ON public.dial_sessions FOR ALL
  USING (auth.uid() = agent_id) WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Admins view all dial_sessions" ON public.dial_sessions FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'team_leader'::app_role));

-- call_events: visible if user can see the parent attempt
CREATE POLICY "View call_events" ON public.call_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.call_attempts ca
    WHERE ca.id = call_events.call_attempt_id
      AND (has_role(auth.uid(),'admin'::app_role) OR ca.agent_id = auth.uid()
           OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'team_leader'::app_role))
  ));
CREATE POLICY "Insert call_events" ON public.call_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.call_attempts ca
    WHERE ca.id = call_events.call_attempt_id
      AND (ca.agent_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
  ));

-- dnc_entries: company-scoped or global (company_id IS NULL = global)
CREATE POLICY "View dnc" ON public.dnc_entries FOR SELECT
  USING (company_id IS NULL OR is_same_company(company_id));
CREATE POLICY "Insert dnc" ON public.dnc_entries FOR INSERT
  WITH CHECK (company_id IS NULL OR is_same_company(company_id));
CREATE POLICY "Admins manage dnc" ON public.dnc_entries FOR DELETE
  USING (has_role(auth.uid(),'admin'::app_role));

-- daily_reports: company-scoped read; system inserts via service role
CREATE POLICY "View daily_reports" ON public.daily_reports FOR SELECT
  USING (is_same_company(company_id));

-- client_notifications: clients see their company's; admins see all
CREATE POLICY "View client_notifications" ON public.client_notifications FOR SELECT
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'client'::app_role) AND client_account_id IN (SELECT get_user_client_account_ids(auth.uid())))
    OR is_same_company(company_id)
  );
CREATE POLICY "Update client_notifications" ON public.client_notifications FOR UPDATE
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'client'::app_role) AND client_account_id IN (SELECT get_user_client_account_ids(auth.uid())))
  );

-- =========================================================
-- 16. Update existing helper that referenced renamed columns
-- =========================================================
-- restrict_campaign_contacts_update remains valid (no column refs broken)
-- contact_in_user_company remains valid

-- Update the trigger function that prevented import_jobs.campaign_id changes (renamed)
DROP TRIGGER IF EXISTS prevent_campaign_change ON public.lead_imports;
CREATE OR REPLACE FUNCTION public.prevent_lead_import_campaign_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
    RAISE EXCEPTION 'Cannot change campaign_id after lead import creation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_prevent_lead_import_campaign_change
BEFORE UPDATE ON public.lead_imports
FOR EACH ROW EXECUTE FUNCTION public.prevent_lead_import_campaign_change();
