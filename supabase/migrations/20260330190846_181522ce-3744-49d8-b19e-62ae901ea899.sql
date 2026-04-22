
-- Tighten recordings insert: only agents inserting own or admin
DROP POLICY IF EXISTS "Authenticated can insert recordings" ON public.recordings;
CREATE POLICY "Insert recordings" ON public.recordings FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM call_logs cl WHERE cl.id = call_log_id AND cl.agent_id = auth.uid()
  )
);

-- Tighten import_errors insert: only admins/managers
DROP POLICY IF EXISTS "Authenticated can insert import_errors" ON public.import_errors;
CREATE POLICY "Insert import_errors" ON public.import_errors FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
