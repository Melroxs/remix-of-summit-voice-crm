-- Restrict dial_sessions SELECT for admin/manager/team_leader to same company
DROP POLICY IF EXISTS "Admins view all dial_sessions" ON public.dial_sessions;

CREATE POLICY "Privileged view dial_sessions in company"
ON public.dial_sessions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'team_leader'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = dial_sessions.agent_id
        AND p.company_id = public.current_company_id()
    )
  )
);