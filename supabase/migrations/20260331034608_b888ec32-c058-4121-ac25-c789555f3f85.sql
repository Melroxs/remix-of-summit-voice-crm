
-- Fix 1: Restrict import_errors SELECT to admins/managers/uploader
DROP POLICY IF EXISTS "Authenticated can view import_errors" ON import_errors;
CREATE POLICY "Authorized users can view import_errors" ON import_errors
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM import_jobs ij
      WHERE ij.id = import_errors.import_job_id
        AND ij.uploaded_by = auth.uid()
    )
  );

-- Fix 2: Replace the broad ALL policy on user_roles with explicit per-operation policies
DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;
CREATE POLICY "Admins can select all roles" ON user_roles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
