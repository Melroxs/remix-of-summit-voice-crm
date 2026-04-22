
-- Fix: Restrict import_jobs SELECT to owner/admins/managers
DROP POLICY IF EXISTS "Authenticated can view import_jobs" ON import_jobs;
CREATE POLICY "Scoped view import_jobs" ON import_jobs
  FOR SELECT TO authenticated
  USING (
    auth.uid() = uploaded_by
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );
