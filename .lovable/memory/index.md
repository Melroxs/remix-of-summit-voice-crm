# Memory: index.md
Updated: today

# Project Memory

## Core
CRM + Dialer app. Primary cyan #00E5FF, accent purple. Dark theme throughout. Inter font. Telnyx for voice.
Supabase backend with RLS. Summit Leads logo with mountain/cyan/purple glow aesthetic.
RBAC: admin (full access), agent (dialer+own data), client (read-only portal). Roles in user_roles table.
Multi-tenant: every profile + campaign has company_id; data RLS-scoped by company. Admins bypass.

## Memories
- [CRM schema](mem://features/crm-schema) — Full database schema with contacts, campaigns, call_logs, callbacks, appointments, recordings, import_jobs, dispositions
- [Telnyx integration](mem://features/telnyx) — WebRTC JS SDK for browser calling, TeXML for call control, recording webhooks
- [Phone normalization](mem://features/phone-normalization) — Auto +1 prefix for 10-digit US numbers, E.164 format
- [Dispositions](mem://features/dispositions) — no_answer, voicemail, wrong_number, dnc, not_interested, callback, appointment_booked, have_solar
- [Build phases](mem://features/build-phases) — Phase 1: Telnyx/dialer/dispositions/CSV import. Phase 2: callbacks/appointments/queue rotation. Phase 3: reports/client portal
- [RBAC system](mem://features/rbac) — Three roles (admin/agent/client), AuthProvider context, RoleGuard component, create-user edge function, client_accounts/client_users/campaign_agents tables
- [Multi-tenant companies](mem://features/multi-tenant-companies) — companies table (renamed from client_accounts), company_id on profiles/campaigns, current_company_id() + is_same_company() RLS helpers, sidebar switcher
