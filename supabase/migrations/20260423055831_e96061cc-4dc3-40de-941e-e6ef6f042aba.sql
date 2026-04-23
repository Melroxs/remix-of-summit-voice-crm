-- Backfill any null company_id on follow_up_tasks from related contact
UPDATE public.follow_up_tasks ft
SET company_id = c.company_id
FROM public.contacts c
WHERE ft.contact_id = c.id
  AND ft.company_id IS NULL
  AND c.company_id IS NOT NULL;

-- Make company_id NOT NULL going forward
ALTER TABLE public.follow_up_tasks
  ALTER COLUMN company_id SET NOT NULL;

-- Tighten SELECT policy: drop the NULL-bypass branch
DROP POLICY IF EXISTS "View follow_up_tasks" ON public.follow_up_tasks;

CREATE POLICY "View follow_up_tasks"
ON public.follow_up_tasks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_same_company(company_id)
);