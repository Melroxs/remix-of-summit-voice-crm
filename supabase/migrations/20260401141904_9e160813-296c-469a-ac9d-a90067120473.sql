-- Remove the duplicate UPDATE policy that lacks WITH CHECK
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;