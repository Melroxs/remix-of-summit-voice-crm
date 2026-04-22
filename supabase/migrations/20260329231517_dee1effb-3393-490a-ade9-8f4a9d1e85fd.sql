
-- Create enum types
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'dead');
CREATE TYPE public.dial_status AS ENUM ('pending', 'dialing', 'completed', 'skipped', 'failed');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE public.agent_status AS ENUM ('available', 'on_call', 'wrap_up', 'paused', 'offline');
CREATE TYPE public.appointment_status AS ENUM ('booked', 'confirmed', 'rescheduled', 'completed', 'no_show', 'replaced');
CREATE TYPE public.callback_status AS ENUM ('pending', 'completed', 'missed', 'cancelled');
CREATE TYPE public.import_status AS ENUM ('uploading', 'mapping', 'processing', 'completed', 'failed');
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'agent');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  agent_status agent_status DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status campaign_status DEFAULT 'draft',
  dial_mode TEXT DEFAULT 'preview',
  queue_strategy TEXT DEFAULT 'round_robin',
  max_concurrent_agents INT DEFAULT 10,
  wrap_up_seconds INT DEFAULT 15,
  min_wait_seconds INT DEFAULT 5,
  retry_delay_no_answer INT DEFAULT 300,
  retry_delay_voicemail INT DEFAULT 600,
  max_attempts INT DEFAULT 5,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  county TEXT,
  phone_raw TEXT,
  phone_e164 TEXT,
  owner_renter TEXT,
  credit_rating TEXT,
  home_value TEXT,
  household_income TEXT,
  cool_notes TEXT,
  lead_status lead_status DEFAULT 'new',
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign contacts (assignment/queue)
CREATE TABLE public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_agent_id UUID REFERENCES auth.users(id),
  dial_status dial_status DEFAULT 'pending',
  last_called_at TIMESTAMPTZ,
  attempts INT DEFAULT 0,
  callback_at TIMESTAMPTZ,
  priority_score INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

-- Dispositions
CREATE TABLE public.dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  requires_callback_datetime BOOLEAN DEFAULT false,
  requires_appointment_modal BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Call logs
CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id),
  agent_id UUID REFERENCES auth.users(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  telnyx_call_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  disposition TEXT,
  notes TEXT,
  recording_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Callbacks
CREATE TABLE public.callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  callback_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  priority INT DEFAULT 0,
  status callback_status DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  appointment_at TIMESTAMPTZ NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  status appointment_status DEFAULT 'booked',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recordings
CREATE TABLE public.recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE CASCADE,
  telnyx_recording_id TEXT,
  recording_url TEXT,
  duration_seconds INT,
  format TEXT DEFAULT 'mp3',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Import jobs
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  total_rows INT DEFAULT 0,
  processed_rows INT DEFAULT 0,
  successful_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status import_status DEFAULT 'uploading',
  column_mapping JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Import errors
CREATE TABLE public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_number INT,
  error_message TEXT,
  raw_payload JSONB
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can view contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can view campaign_contacts" ON public.campaign_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert campaign_contacts" ON public.campaign_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update campaign_contacts" ON public.campaign_contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Anyone can view dispositions" ON public.dispositions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can view call_logs" ON public.call_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can create call_logs" ON public.call_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Authenticated can view callbacks" ON public.callbacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can insert callbacks" ON public.callbacks FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Agents can update own callbacks" ON public.callbacks FOR UPDATE TO authenticated USING (auth.uid() = agent_id);

CREATE POLICY "Authenticated can view appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Agents can update own appointments" ON public.appointments FOR UPDATE TO authenticated USING (auth.uid() = agent_id);

CREATE POLICY "Authenticated can view recordings" ON public.recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert recordings" ON public.recordings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can view import_jobs" ON public.import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create import_jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Users can update own import_jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (auth.uid() = uploaded_by);

CREATE POLICY "Authenticated can view import_errors" ON public.import_errors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert import_errors" ON public.import_errors FOR INSERT TO authenticated WITH CHECK (true);

-- Seed default dispositions
INSERT INTO public.dispositions (label, code, requires_callback_datetime, requires_appointment_modal, sort_order) VALUES
  ('No Answer', 'no_answer', false, false, 1),
  ('Voicemail', 'voicemail', false, false, 2),
  ('Wrong Number', 'wrong_number', false, false, 3),
  ('DNC', 'dnc', false, false, 4),
  ('Not Interested', 'not_interested', false, false, 5),
  ('Call Back', 'callback', true, false, 6),
  ('Appointment Booked', 'appointment_booked', false, true, 7),
  ('Have Solar', 'have_solar', false, false, 8);

-- Indexes for performance
CREATE INDEX idx_contacts_phone_e164 ON public.contacts(phone_e164);
CREATE INDEX idx_contacts_lead_status ON public.contacts(lead_status);
CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_agent ON public.campaign_contacts(assigned_agent_id);
CREATE INDEX idx_campaign_contacts_dial_status ON public.campaign_contacts(dial_status);
CREATE INDEX idx_call_logs_contact ON public.call_logs(contact_id);
CREATE INDEX idx_call_logs_agent ON public.call_logs(agent_id);
CREATE INDEX idx_callbacks_agent_status ON public.callbacks(agent_id, status);
CREATE INDEX idx_callbacks_callback_at ON public.callbacks(callback_at);
CREATE INDEX idx_appointments_agent ON public.appointments(agent_id);
CREATE INDEX idx_appointments_status ON public.appointments(status);
