DROP POLICY IF EXISTS "Manage technicians" ON public.technicians;
CREATE POLICY "Manage technicians" ON public.technicians
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id));

DROP POLICY IF EXISTS "Manage tech appointments" ON public.technician_appointments;
CREATE POLICY "Manage tech appointments" ON public.technician_appointments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_same_company(company_id));