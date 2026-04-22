
-- Performance indexes for campaign_contacts queue queries
CREATE INDEX IF NOT EXISTS idx_cc_queue_lookup 
  ON public.campaign_contacts (campaign_id, dial_status, next_eligible_at NULLS FIRST, priority_score DESC, attempts ASC, created_at ASC)
  WHERE dial_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cc_campaign_status
  ON public.campaign_contacts (campaign_id, dial_status);

CREATE INDEX IF NOT EXISTS idx_cc_next_eligible
  ON public.campaign_contacts (campaign_id, next_eligible_at)
  WHERE dial_status = 'pending';

-- Index for callbacks queue count
CREATE INDEX IF NOT EXISTS idx_callbacks_campaign_status
  ON public.callbacks (campaign_id, status)
  WHERE status = 'pending';

-- Index for contact phone lookup (manual dial matching)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_e164
  ON public.contacts (phone_e164)
  WHERE phone_e164 IS NOT NULL;
