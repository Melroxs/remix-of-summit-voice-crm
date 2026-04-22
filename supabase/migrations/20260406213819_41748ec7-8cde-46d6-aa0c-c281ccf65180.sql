
-- Add import_job_id to contacts to link them to their originating import
ALTER TABLE public.contacts ADD COLUMN import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL;

-- Index for efficient batch lookups
CREATE INDEX idx_contacts_import_job_id ON public.contacts(import_job_id) WHERE import_job_id IS NOT NULL;
