# Summit Outbound Sales OS

A multi-tenant outbound sales operating system for roofing teams: lead intake,
browser dialer (Telnyx WebRTC), qualification + appointment booking, QA scoring,
team coaching, client portal, and reporting. Built on React 18 + Vite + Tailwind
with Lovable Cloud (Supabase) for backend, RLS, and edge functions.

## Local development

Prereqs: Node 20+, [Bun](https://bun.sh) or npm.

```bash
bun install            # or: npm install
bun run dev            # or: npm run dev   → http://localhost:8080
bun run test           # vitest unit tests
bun run lint
bun run build          # production bundle
```

The Supabase client and types are auto-generated — do **not** edit
`src/integrations/supabase/{client,types}.ts` or anything under
`supabase/migrations/`. Add schema changes through the Lovable migration tool.

### Environment variables

Copy `.env.example` for documentation. The `.env` file itself is managed by
Lovable Cloud — connecting Cloud to a project injects the four `VITE_*`
variables automatically. Edge-function secrets (Telnyx, Lovable AI, service
role) live in **Cloud → Secrets** and are never bundled into the frontend.

## Deployment

Frontend changes ship via the Lovable **Publish** dialog. Edge functions and
SQL migrations deploy automatically on save. After publishing once, a custom
domain can be attached in **Project Settings → Domains**.

## Architecture overview

- `src/pages/*` — top-level routes, role-gated by `RoleGuard`
- `src/hooks/*` — reusable react-query/Supabase hooks (auth, dialer queue,
  contacts, appointments, telephony, reports, audit log)
- `src/lib/*` — pure helpers (phone normalization, queue rules, follow-up
  planner, CSV import, validation, audit logger, lead scoring)
- `src/components/*` — feature components grouped by surface
- `supabase/functions/*` — Deno edge functions (telephony, AI summaries,
  recordings, user management)

Pure logic that drives the dialer (`src/lib/queue-rules.ts`,
`src/lib/follow-ups.ts`, `src/lib/phone.ts`, `src/lib/validation.ts`) is
covered by Vitest in `src/test/`.

## Audit logging

High-signal product actions (logins, bulk deletes, role changes, campaign
publishes, dispositions, etc.) are written to `public.audit_events` via the
SECURITY DEFINER `log_audit_event` RPC. Use `logEvent()` from
`src/lib/audit.ts` from the client; admins can read the full stream and
managers see their own company.

## Roles

`admin · manager · team_leader · agent · client` — defined in `app_role`.
Role-checking always goes through the `has_role()` SQL function and the
`useAuth().hasRole(...)` helper. Never store role flags on the profile row.
