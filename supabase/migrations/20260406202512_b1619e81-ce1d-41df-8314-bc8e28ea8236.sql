
CREATE TABLE public.call_monitoring_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id uuid NOT NULL,
  supervisor_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  campaign_id uuid,
  provider_type text NOT NULL DEFAULT 'telnyx',
  provider_call_id text,
  provider_conference_id text,
  monitoring_mode text NOT NULL CHECK (monitoring_mode IN ('listen', 'whisper', 'barge')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_monitoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and TLs can insert monitoring sessions" ON public.call_monitoring_sessions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = supervisor_id
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
);

CREATE POLICY "View monitoring sessions" ON public.call_monitoring_sessions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'team_leader'::app_role)
);

CREATE POLICY "Update monitoring sessions" ON public.call_monitoring_sessions
FOR UPDATE TO authenticated
USING (
  supervisor_id = auth.uid()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
);

CREATE POLICY "Admins can delete monitoring sessions" ON public.call_monitoring_sessions
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups of active sessions
CREATE INDEX idx_monitoring_active ON public.call_monitoring_sessions(call_log_id, status) WHERE status = 'active';
