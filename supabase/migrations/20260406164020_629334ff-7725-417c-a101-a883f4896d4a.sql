
-- 1. Fix telephony_providers: restrict SELECT to admins/managers only (removes config exposure)
DROP POLICY IF EXISTS "Anyone authenticated can view providers" ON public.telephony_providers;
CREATE POLICY "Admins and managers can view providers"
  ON public.telephony_providers
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 2. Fix user_roles: add restrictive policy to block non-admin UPDATE
-- The existing "Only admins can update roles" permissive policy only lets admins through,
-- but to be extra safe, add a WITH CHECK on the existing policy replacement
DROP POLICY IF EXISTS "Only admins can update roles" ON public.user_roles;
CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Fix campaign_agents: add manager visibility
CREATE POLICY "Managers can view campaign_agents"
  ON public.campaign_agents
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));
