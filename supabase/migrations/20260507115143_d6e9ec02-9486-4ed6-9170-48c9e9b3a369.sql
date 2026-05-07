
-- ============================================================
-- call_sessions: new browser-WebRTC call lifecycle table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  agent_id uuid REFERENCES auth.users(id),
  campaign_id uuid,
  telnyx_call_control_id text UNIQUE,
  telnyx_call_leg_id text,
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('inbound','outbound')),
  from_number text,
  to_number text,
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','ringing','active','on_hold','ended','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  failure_reason text,
  recording_status text DEFAULT 'none'
    CHECK (recording_status IN ('none','recording','processing','available','failed')),
  recording_id text,
  recording_url text,
  recording_download_url text
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_agent ON public.call_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead ON public.call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_campaign ON public.call_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_ccid ON public.call_sessions(telnyx_call_control_id);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents view own call_sessions"
  ON public.call_sessions FOR SELECT
  USING (
    agent_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'team_leader'::app_role)
  );

CREATE POLICY "Agents insert own call_sessions"
  ON public.call_sessions FOR INSERT
  WITH CHECK (
    agent_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Agents update own call_sessions"
  ON public.call_sessions FOR UPDATE
  USING (
    agent_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins delete call_sessions"
  ON public.call_sessions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- call_dispositions: agent-saved outcomes for a call_session
-- ============================================================
CREATE TABLE IF NOT EXISTS public.call_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id uuid REFERENCES public.call_sessions(id) ON DELETE SET NULL,
  lead_id uuid NOT NULL,
  agent_id uuid REFERENCES auth.users(id),
  campaign_id uuid,
  disposition text NOT NULL,
  notes text,
  callback_datetime timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_dispositions_session ON public.call_dispositions(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_lead ON public.call_dispositions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_agent ON public.call_dispositions(agent_id);

ALTER TABLE public.call_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents view own call_dispositions"
  ON public.call_dispositions FOR SELECT
  USING (
    agent_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'team_leader'::app_role)
  );

CREATE POLICY "Agents insert own call_dispositions"
  ON public.call_dispositions FOR INSERT
  WITH CHECK (agent_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete call_dispositions"
  ON public.call_dispositions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- call_recordings: extend existing table to support call_sessions
-- ============================================================
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS call_session_id uuid REFERENCES public.call_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS telnyx_call_control_id text,
  ADD COLUMN IF NOT EXISTS telnyx_call_leg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_telnyx_recording_id
  ON public.call_recordings(telnyx_recording_id)
  WHERE telnyx_recording_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_recordings_session ON public.call_recordings(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_agent ON public.call_recordings(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead ON public.call_recordings(lead_id);
