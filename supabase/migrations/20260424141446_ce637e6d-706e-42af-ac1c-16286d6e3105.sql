ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS pacing_ratio numeric NOT NULL DEFAULT 1.5
    CHECK (pacing_ratio >= 1.0 AND pacing_ratio <= 3.0);