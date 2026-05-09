ALTER TYPE client_status ADD VALUE IF NOT EXISTS 'inactive';
ALTER TABLE public.job_cards ADD COLUMN IF NOT EXISTS quote_disposition text CHECK (quote_disposition IN ('approved','declined')) NULL;
ALTER TABLE public.job_cards ADD COLUMN IF NOT EXISTS parent_job_card_id uuid NULL REFERENCES public.job_cards(id) ON DELETE SET NULL;