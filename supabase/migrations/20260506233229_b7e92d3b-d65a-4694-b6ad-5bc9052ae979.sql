ALTER TABLE public.technician_appointments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_appointments;