
-- Telephony providers table
CREATE TABLE public.telephony_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'telnyx',
  is_active boolean NOT NULL DEFAULT true,
  default_outbound_number text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telephony_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view providers"
  ON public.telephony_providers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage providers"
  ON public.telephony_providers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_telephony_providers_updated_at
  BEFORE UPDATE ON public.telephony_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AI call summaries table
CREATE TABLE public.ai_call_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  next_action text,
  sentiment text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_call_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View ai_call_summaries"
  ON public.ai_call_summaries FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM call_logs cl WHERE cl.id = ai_call_summaries.call_log_id AND cl.agent_id = auth.uid()
    )
  );

CREATE POLICY "Insert ai_call_summaries"
  ON public.ai_call_summaries FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM call_logs cl WHERE cl.id = ai_call_summaries.call_log_id AND cl.agent_id = auth.uid()
    )
  );

-- Add telephony_provider_id to campaigns
ALTER TABLE public.campaigns ADD COLUMN telephony_provider_id uuid REFERENCES public.telephony_providers(id) ON DELETE SET NULL;

-- Allow agents to insert contacts
DROP POLICY IF EXISTS "Insert contacts" ON public.contacts;
CREATE POLICY "Insert contacts"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'agent'::app_role)
  );

-- Allow agents to delete contacts they can see
DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;
CREATE POLICY "Delete contacts"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'agent'::app_role)
  );

-- Allow agents to update contacts
DROP POLICY IF EXISTS "Update contacts" ON public.contacts;
CREATE POLICY "Update contacts"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'agent'::app_role)
  );
