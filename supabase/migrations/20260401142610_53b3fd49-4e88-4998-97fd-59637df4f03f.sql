-- 1. Fix import_jobs INSERT policy: restrict to admin/manager
DROP POLICY IF EXISTS "Users can create import_jobs" ON public.import_jobs;
CREATE POLICY "Admins and managers can create import_jobs"
  ON public.import_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

-- 2. Fix import_jobs UPDATE policy: restrict to admin/manager who owns the job
DROP POLICY IF EXISTS "Users can update own import_jobs" ON public.import_jobs;
CREATE POLICY "Owner admins/managers can update import_jobs"
  ON public.import_jobs FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = uploaded_by
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

-- 3. Prevent campaign_id from being changed after creation
CREATE OR REPLACE FUNCTION public.prevent_import_job_campaign_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
    RAISE EXCEPTION 'Cannot change campaign_id after import job creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_import_job_campaign_change_trigger
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_import_job_campaign_change();