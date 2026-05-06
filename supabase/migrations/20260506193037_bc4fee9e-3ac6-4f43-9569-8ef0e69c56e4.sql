-- Technicians table
CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  home_address text,
  phone text,
  email text,
  skills text[] NOT NULL DEFAULT '{}',
  working_hours_start time NOT NULL DEFAULT '08:00',
  working_hours_end time NOT NULL DEFAULT '17:00',
  working_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_technicians_company ON public.technicians(company_id);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View technicians" ON public.technicians
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id));

CREATE POLICY "Manage technicians" ON public.technicians
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.is_same_company(company_id) AND (
      public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'team_leader'::app_role)
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.is_same_company(company_id) AND (
      public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'team_leader'::app_role)
    ))
  );

CREATE TRIGGER trg_technicians_updated_at
  BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Technician appointment status enum
CREATE TYPE public.technician_appointment_status AS ENUM
  ('scheduled', 'en_route', 'on_site', 'completed', 'cancelled', 'no_show');

-- Technician appointments table
CREATE TABLE public.technician_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  contact_id uuid,
  campaign_id uuid,
  appointment_id uuid,
  lead_address text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  required_skill text,
  status public.technician_appointment_status NOT NULL DEFAULT 'scheduled',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tech_appts_company ON public.technician_appointments(company_id);
CREATE INDEX idx_tech_appts_technician ON public.technician_appointments(technician_id, start_time);
CREATE INDEX idx_tech_appts_start ON public.technician_appointments(start_time);

ALTER TABLE public.technician_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View tech appointments" ON public.technician_appointments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id));

CREATE POLICY "Manage tech appointments" ON public.technician_appointments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.is_same_company(company_id) AND (
      public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'team_leader'::app_role)
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.is_same_company(company_id) AND (
      public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'team_leader'::app_role)
    ))
  );

CREATE TRIGGER trg_tech_appts_updated_at
  BEFORE UPDATE ON public.technician_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: end > start, no overlap per technician
CREATE OR REPLACE FUNCTION public.validate_technician_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.technician_appointments t
    WHERE t.technician_id = NEW.technician_id
      AND t.id <> NEW.id
      AND t.status NOT IN ('cancelled', 'no_show')
      AND tstzrange(t.start_time, t.end_time, '[)')
          && tstzrange(NEW.start_time, NEW.end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'Technician already has an appointment overlapping this time';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tech_appts_validate
  BEFORE INSERT OR UPDATE ON public.technician_appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_technician_appointment();