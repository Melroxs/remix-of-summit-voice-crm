---
name: multi-tenant-companies
description: Multi-tenant scoping via companies table (renamed from client_accounts), profiles.company_id, RLS helpers
type: feature
---
client_accounts table renamed to `companies` (back-compat view kept). Every profile and campaign has `company_id`. New default company "Summit Leads" backfilled.

Helpers:
- `current_company_id()` - returns signed-in user's company
- `is_same_company(uuid)` - admins always pass; others must match current_company_id
- `contact_in_user_company(uuid)` - via campaign_contacts → campaigns

RLS scoped by company on: campaigns, contacts, campaign_contacts, call_logs, appointments, callbacks, recordings, qa_scores, agent_feedback, training_simulations, campaign_phone_numbers, campaign_scripts, import_jobs. Admins bypass company filter (super-admin).

Trigger `sync_campaign_company_id` auto-fills campaigns.company_id from client_account_id or signed-in user's profile.

Frontend: useAuth() exposes `company`, `companies`, `activeCompanyId`, `setActiveCompanyId`. Admins see a switcher in sidebar; others see static badge. Active company persisted in localStorage (admins only).
