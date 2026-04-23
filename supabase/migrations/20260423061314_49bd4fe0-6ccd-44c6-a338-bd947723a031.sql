-- Tighten INSERT policy on follow_up_tasks to enforce company scoping
DROP POLICY IF EXISTS "Insert follow_up_tasks" ON public.follow_up_tasks;

CREATE POLICY "Insert follow_up_tasks"
ON public.follow_up_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_same_company(company_id)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR auth.uid() = agent_id
  )
);