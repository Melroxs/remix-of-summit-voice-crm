
-- Remove legacy config column - credentials belong in private_config only
ALTER TABLE public.telephony_providers DROP COLUMN IF EXISTS config;

-- Create a safe view that never exposes private_config
CREATE OR REPLACE VIEW public.telephony_providers_safe
WITH (security_invoker = true)
AS SELECT id, name, provider_type, is_active, default_outbound_number, public_config, created_at, updated_at
FROM public.telephony_providers;
