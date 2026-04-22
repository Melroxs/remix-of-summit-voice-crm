
-- QA Scores table
CREATE TABLE public.qa_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  scored_by uuid NOT NULL,
  campaign_id uuid,
  opening_score smallint NOT NULL DEFAULT 0 CHECK (opening_score BETWEEN 0 AND 5),
  script_adherence_score smallint NOT NULL DEFAULT 0 CHECK (script_adherence_score BETWEEN 0 AND 5),
  qualification_score smallint NOT NULL DEFAULT 0 CHECK (qualification_score BETWEEN 0 AND 5),
  objection_handling_score smallint NOT NULL DEFAULT 0 CHECK (objection_handling_score BETWEEN 0 AND 5),
  communication_score smallint NOT NULL DEFAULT 0 CHECK (communication_score BETWEEN 0 AND 5),
  compliance_score smallint NOT NULL DEFAULT 0 CHECK (compliance_score BETWEEN 0 AND 5),
  closing_score smallint NOT NULL DEFAULT 0 CHECK (closing_score BETWEEN 0 AND 5),
  total_score numeric GENERATED ALWAYS AS (
    (opening_score + script_adherence_score + qualification_score + objection_handling_score + communication_score + compliance_score + closing_score)::numeric / 7.0
  ) STORED,
  notes text,
  strengths text,
  improvement_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TL and admins can insert qa_scores" ON public.qa_scores
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = scored_by
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
);

CREATE POLICY "View qa_scores" ON public.qa_scores
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
  OR agent_id = auth.uid()
);

CREATE POLICY "Update qa_scores" ON public.qa_scores
FOR UPDATE TO authenticated
USING (
  scored_by = auth.uid()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
);

CREATE POLICY "Delete qa_scores" ON public.qa_scores
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Agent Feedback table
CREATE TABLE public.agent_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL,
  feedback_by uuid NOT NULL,
  call_log_id uuid,
  campaign_id uuid,
  feedback_type text NOT NULL DEFAULT 'general' CHECK (feedback_type IN ('coaching', 'praise', 'improvement', 'general')),
  message text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TL and admins can insert feedback" ON public.agent_feedback
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = feedback_by
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
);

CREATE POLICY "View agent_feedback" ON public.agent_feedback
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
  OR agent_id = auth.uid()
);

CREATE POLICY "Agents can acknowledge own feedback" ON public.agent_feedback
FOR UPDATE TO authenticated
USING (agent_id = auth.uid());

CREATE POLICY "Admins can delete feedback" ON public.agent_feedback
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update profile visibility for team_leaders
DROP POLICY IF EXISTS "Profile visibility" ON public.profiles;
CREATE POLICY "Profile visibility" ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
);

-- Update call_logs visibility for team_leaders
DROP POLICY IF EXISTS "View call_logs" ON public.call_logs;
CREATE POLICY "View call_logs" ON public.call_logs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR agent_id = auth.uid()
  OR (has_role(auth.uid(), 'team_leader'::app_role) AND (campaign_id IS NULL OR is_agent_on_campaign(auth.uid(), campaign_id)))
  OR (has_role(auth.uid(), 'client'::app_role) AND campaign_id IN (
    SELECT c.id FROM campaigns c WHERE c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
  ))
);

-- Update recordings visibility for team_leaders
DROP POLICY IF EXISTS "View recordings" ON public.recordings;
CREATE POLICY "View recordings" ON public.recordings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
  OR EXISTS (SELECT 1 FROM call_logs cl WHERE cl.id = recordings.call_log_id AND cl.agent_id = auth.uid())
);

-- Update campaigns visibility
DROP POLICY IF EXISTS "View campaigns" ON public.campaigns;
CREATE POLICY "View campaigns" ON public.campaigns
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR is_agent_on_campaign(auth.uid(), id)
  OR (has_role(auth.uid(), 'client'::app_role) AND client_account_id IN (SELECT get_user_client_account_ids(auth.uid())))
);

-- Update campaign_agents visibility for team_leaders
DROP POLICY IF EXISTS "Managers can view campaign_agents" ON public.campaign_agents;
CREATE POLICY "Managers and TLs can view campaign_agents" ON public.campaign_agents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
);

-- Enable realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_scores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
