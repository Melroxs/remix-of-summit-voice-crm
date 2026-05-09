
-- ===== Enums =====
CREATE TYPE public.client_status AS ENUM ('active', 'closed', 'archived');
CREATE TYPE public.job_card_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

-- ===== Clients =====
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_from_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  email text,
  phone_e164 text,
  address text,
  city text,
  state text,
  zip_code text,
  source text,
  status public.client_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);
CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_clients_contact ON public.clients(contact_id);

-- ===== Job Cards =====
CREATE SEQUENCE IF NOT EXISTS public.job_card_seq;

CREATE TABLE public.job_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number text NOT NULL UNIQUE DEFAULT ('JC-' || lpad(nextval('public.job_card_seq')::text, 5, '0')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  job_type text,
  urgency text,
  status public.job_card_status NOT NULL DEFAULT 'open',
  scheduled_at timestamptz,
  completed_at timestamptz,
  sale_amount numeric(12,2),
  notes text,
  address text,
  city text,
  state text,
  zip_code text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_cards_client ON public.job_cards(client_id);
CREATE INDEX idx_job_cards_company ON public.job_cards(company_id);
CREATE INDEX idx_job_cards_appt ON public.job_cards(appointment_id);

-- ===== Client Notes =====
CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  job_card_id uuid REFERENCES public.job_cards(id) ON DELETE SET NULL,
  company_id uuid,
  author_id uuid,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_notes_client ON public.client_notes(client_id);
CREATE INDEX idx_client_notes_jobcard ON public.client_notes(job_card_id);

-- ===== Client Photos =====
CREATE TABLE public.client_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  job_card_id uuid REFERENCES public.job_cards(id) ON DELETE SET NULL,
  company_id uuid,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  caption text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_photos_client ON public.client_photos(client_id);
CREATE INDEX idx_client_photos_jobcard ON public.client_photos(job_card_id);

-- ===== updated_at triggers =====
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_job_cards_updated_at
  BEFORE UPDATE ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RLS =====
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;

-- clients
CREATE POLICY "view clients in company" ON public.clients FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "insert clients in company" ON public.clients FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "update clients in company" ON public.clients FOR UPDATE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "delete clients admin/manager" ON public.clients FOR DELETE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

-- job_cards
CREATE POLICY "view job_cards in company" ON public.job_cards FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "insert job_cards in company" ON public.job_cards FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "update job_cards in company" ON public.job_cards FOR UPDATE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "delete job_cards admin/manager" ON public.job_cards FOR DELETE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

-- client_notes
CREATE POLICY "view notes in company" ON public.client_notes FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "insert notes in company" ON public.client_notes FOR INSERT
  TO authenticated WITH CHECK ((has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id)) AND author_id = auth.uid());
CREATE POLICY "update own notes" ON public.client_notes FOR UPDATE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR author_id = auth.uid());
CREATE POLICY "delete notes admin/author" ON public.client_notes FOR DELETE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR author_id = auth.uid());

-- client_photos
CREATE POLICY "view photos in company" ON public.client_photos FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id));
CREATE POLICY "insert photos in company" ON public.client_photos FOR INSERT
  TO authenticated WITH CHECK ((has_role(auth.uid(),'admin'::app_role) OR is_same_company(company_id)) AND uploaded_by = auth.uid());
CREATE POLICY "update own photos" ON public.client_photos FOR UPDATE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR uploaded_by = auth.uid());
CREATE POLICY "delete photos admin/uploader" ON public.client_photos FOR DELETE
  TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR uploaded_by = auth.uid());

-- ===== Auto-create client + job_card on appointment booking =====
CREATE OR REPLACE FUNCTION public.appointment_to_job_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_company_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
BEGIN
  SELECT c.company_id, c.first_name, c.last_name, c.email, c.phone_e164
    INTO v_company_id, v_first_name, v_last_name, v_email, v_phone
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  -- Upsert client
  INSERT INTO public.clients (
    company_id, contact_id, created_from_appointment_id,
    first_name, last_name, email, phone_e164,
    address, city, state, zip_code, source, created_by
  ) VALUES (
    v_company_id, NEW.contact_id, NEW.id,
    v_first_name, v_last_name, v_email, v_phone,
    NEW.address, NEW.city, NEW.state, NEW.zip_code, 'appointment', NEW.agent_id
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    address = COALESCE(EXCLUDED.address, public.clients.address),
    city = COALESCE(EXCLUDED.city, public.clients.city),
    state = COALESCE(EXCLUDED.state, public.clients.state),
    zip_code = COALESCE(EXCLUDED.zip_code, public.clients.zip_code),
    updated_at = now()
  RETURNING id INTO v_client_id;

  -- Create job card
  INSERT INTO public.job_cards (
    client_id, company_id, appointment_id, contact_id,
    job_type, urgency, status, scheduled_at,
    address, city, state, zip_code, created_by
  ) VALUES (
    v_client_id, v_company_id, NEW.id, NEW.contact_id,
    NEW.job_type, NEW.urgency::text, 'open', NEW.appointment_at,
    NEW.address, NEW.city, NEW.state, NEW.zip_code, NEW.agent_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_to_job_card
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointment_to_job_card();

-- ===== Storage bucket =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "view client photos in company" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'client-photos' AND (
      has_role(auth.uid(),'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.client_photos p WHERE p.storage_path = name AND is_same_company(p.company_id))
    )
  );

CREATE POLICY "upload client photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'client-photos' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "delete client photos" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'client-photos' AND (
      has_role(auth.uid(),'admin'::app_role) OR owner = auth.uid()
    )
  );
