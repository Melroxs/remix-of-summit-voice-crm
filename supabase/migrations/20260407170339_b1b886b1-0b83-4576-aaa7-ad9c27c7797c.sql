
-- Add next_eligible_at to campaign_contacts for retry scheduling
ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS next_eligible_at timestamptz DEFAULT NULL;

-- Add index for efficient queue queries
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_queue
  ON public.campaign_contacts (campaign_id, dial_status, next_eligible_at, priority_score DESC, attempts ASC, created_at ASC)
  WHERE dial_status = 'pending';
