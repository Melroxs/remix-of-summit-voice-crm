-- Create health status enum
CREATE TYPE public.number_health_status AS ENUM ('healthy', 'warm', 'fatigued', 'cooling_down', 'blocked');

-- Create priority band enum
CREATE TYPE public.priority_band AS ENUM ('hot', 'warm', 'medium', 'low', 'excluded');

-- Phone number stats table
CREATE TABLE public.phone_number_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id uuid NOT NULL REFERENCES public.campaign_phone_numbers(id) ON DELETE CASCADE,
  total_calls integer NOT NULL DEFAULT 0,
  answered_calls integer NOT NULL DEFAULT 0,
  appointments integer NOT NULL DEFAULT 0,
  calls_last_hour integer NOT NULL DEFAULT 0,
  calls_today integer NOT NULL DEFAULT 0,
  health_status number_health_status NOT NULL DEFAULT 'healthy',
  cooldown_until timestamptz,
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  answer_rate numeric(5,2) DEFAULT 0,
  appointment_rate numeric(5,2) DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone_number_id)
);

ALTER TABLE public.phone_number_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage phone_number_stats"
  ON public.phone_number_stats FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents can view phone_number_stats"
  ON public.phone_number_stats FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaign_phone_numbers cpn
    WHERE cpn.id = phone_number_stats.phone_number_id
    AND is_agent_on_campaign(auth.uid(), cpn.campaign_id)
  ));

-- Add columns to campaign_phone_numbers
ALTER TABLE public.campaign_phone_numbers
  ADD COLUMN IF NOT EXISTS max_calls_per_hour integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS max_calls_per_day integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS area_code text;

-- Add columns to campaign_contacts
ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS priority_band priority_band NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS score_reason text;

-- Add columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS rotation_strategy text NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS local_presence_enabled boolean NOT NULL DEFAULT false;