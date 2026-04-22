
-- Restrict telephony_providers SELECT to admin-only (removes manager access to config/credentials)
DROP POLICY IF EXISTS "Admins and managers can view providers" ON public.telephony_providers;
CREATE POLICY "Admins can view providers"
  ON public.telephony_providers
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
