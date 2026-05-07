ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision,
  ADD COLUMN IF NOT EXISTS service_areas text[] NOT NULL DEFAULT '{}'::text[];