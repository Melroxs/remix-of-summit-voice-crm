ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS call_source text NOT NULL DEFAULT 'queue',
  ADD COLUMN IF NOT EXISTS manual_dialed_number text,
  ADD COLUMN IF NOT EXISTS manual_dialed_e164 text;