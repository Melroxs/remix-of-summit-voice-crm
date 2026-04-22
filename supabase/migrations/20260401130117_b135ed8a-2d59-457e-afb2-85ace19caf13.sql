-- Add new agent status values
ALTER TYPE public.agent_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE public.agent_status ADD VALUE IF NOT EXISTS 'lunch';
ALTER TYPE public.agent_status ADD VALUE IF NOT EXISTS 'tea';
ALTER TYPE public.agent_status ADD VALUE IF NOT EXISTS 'bathroom_break';

-- Add soft-delete and status tracking fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT NULL;

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime on profiles for live agent status
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;