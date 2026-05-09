CREATE OR REPLACE FUNCTION public.tech_appointment_to_job_card()
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
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.company_id, c.first_name, c.last_name, c.email, c.phone_e164
    INTO v_company_id, v_first_name, v_last_name, v_email, v_phone
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  IF v_company_id IS NULL THEN
    v_company_id := NEW.company_id;
  END IF;

  INSERT INTO public.clients (
    company_id, contact_id,
    first_name, last_name, email, phone_e164,
    address, source, created_by
  ) VALUES (
    v_company_id, NEW.contact_id,
    v_first_name, v_last_name, v_email, v_phone,
    NEW.lead_address, 'technician_appointment', NEW.created_by
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    address = COALESCE(EXCLUDED.address, public.clients.address),
    updated_at = now()
  RETURNING id INTO v_client_id;

  IF v_client_id IS NULL THEN
    SELECT id INTO v_client_id FROM public.clients WHERE contact_id = NEW.contact_id LIMIT 1;
  END IF;

  INSERT INTO public.job_cards (
    client_id, company_id, contact_id,
    job_type, status, scheduled_at,
    address, created_by, notes
  ) VALUES (
    v_client_id, v_company_id, NEW.contact_id,
    NEW.required_skill, 'open', NEW.start_time,
    NEW.lead_address, NEW.created_by, NEW.notes
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tech_appointment_to_job_card ON public.technician_appointments;
CREATE TRIGGER trg_tech_appointment_to_job_card
  AFTER INSERT ON public.technician_appointments
  FOR EACH ROW EXECUTE FUNCTION public.tech_appointment_to_job_card();