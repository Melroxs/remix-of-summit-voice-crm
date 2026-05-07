-- Technicians: view own record
CREATE POLICY "Technicians view own record"
ON public.technicians
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND has_role(auth.uid(), 'technician'::app_role));

-- Technicians: view own appointments
CREATE POLICY "Technicians view own appointments"
ON public.technician_appointments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = technician_appointments.technician_id
      AND t.user_id = auth.uid()
  )
);

-- Technicians: update status of own appointments (e.g. en_route, on_site, completed)
CREATE POLICY "Technicians update own appointments"
ON public.technician_appointments
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = technician_appointments.technician_id
      AND t.user_id = auth.uid()
  )
);
