
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON public.contacts (lead_source) WHERE lead_source IS NOT NULL;
