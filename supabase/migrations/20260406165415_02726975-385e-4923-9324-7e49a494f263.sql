
DROP VIEW IF EXISTS public.client_contact_view;
CREATE VIEW public.client_contact_view WITH (security_invoker = true) AS
SELECT
  c.id, c.first_name, c.last_name, c.phone_e164, c.phone_raw,
  c.address, c.city, c.state, c.zip_code, c.county,
  c.lead_status, c.title, c.owner_renter, c.timezone,
  c.created_at, c.updated_at
FROM public.contacts c;
