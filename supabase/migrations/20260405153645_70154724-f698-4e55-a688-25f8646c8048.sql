
-- Campaign phone number pool
CREATE TABLE public.campaign_phone_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'telnyx',
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  rotation_order INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage campaign_phone_numbers"
  ON public.campaign_phone_numbers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents on campaign can view phone numbers"
  ON public.campaign_phone_numbers FOR SELECT
  TO authenticated
  USING (is_agent_on_campaign(auth.uid(), campaign_id));

CREATE INDEX idx_cpn_campaign ON public.campaign_phone_numbers(campaign_id);

-- Add tracking columns to call_logs
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS outbound_number_used TEXT,
  ADD COLUMN IF NOT EXISTS provider_used TEXT,
  ADD COLUMN IF NOT EXISTS dial_mode_used TEXT;
