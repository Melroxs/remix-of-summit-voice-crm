-- Add 'quote' status to job_card_status enum
ALTER TYPE job_card_status ADD VALUE IF NOT EXISTS 'quote';

-- Add disposition + quote details columns
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS sale_disposition text,
  ADD COLUMN IF NOT EXISTS quote_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS advanced_at timestamptz,
  ADD COLUMN IF NOT EXISTS advanced_by uuid;

-- Constrain disposition values
DO $$ BEGIN
  ALTER TABLE public.job_cards
    ADD CONSTRAINT job_cards_sale_disposition_check
    CHECK (sale_disposition IS NULL OR sale_disposition IN ('no_sale','roof_replacement','solar_installation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;