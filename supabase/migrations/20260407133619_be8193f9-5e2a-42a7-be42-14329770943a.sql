ALTER TABLE public.ai_call_summaries
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS call_outcome_summary text,
  ADD COLUMN IF NOT EXISTS suggested_next_action text,
  ADD COLUMN IF NOT EXISTS summary_source text NOT NULL DEFAULT 'fallback',
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS error_message text;
