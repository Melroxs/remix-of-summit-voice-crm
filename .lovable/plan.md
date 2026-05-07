## Goal

Keep the existing Dialer UI exactly as-is. Tear out and rebuild the Telnyx WebRTC backend layer and supporting backend logic so calling, daily queue, dispositions, and recordings all work end-to-end.

## What stays untouched

- `src/pages/Dialer.tsx` UI structure, layout, panels, modals
- `src/components/dialer/*` (LeadCard, DispositionPanel, DialPad, AudioControls, DtmfPad, WrapUpModal, CallbackModal, AppointmentModal, RetryCountdown, ContactActivityTimeline, QualificationForm)
- `src/pages/Recordings.tsx` UI shell (data source rewired)
- All non-dialer pages, sidebar, auth, RBAC, technician/client portals

## What gets deleted (call-placement plumbing only)

Edge functions:
- `supabase/functions/power-dialer-next`
- `supabase/functions/predictive-dialer-engine`
- `supabase/functions/telnyx-create-call` (server-side originate replaced by WebRTC)
- `supabase/functions/get-recording-url` (replaced by new signed-URL fn)

Frontend hooks/state:
- `src/hooks/use-telnyx.ts` — fully rewritten
- `src/hooks/use-dialer-queue.ts` — fully rewritten against new daily-queue RPCs
- Auto-dial / power-dial timer logic inside `Dialer.tsx` is removed. The Power Dial card is replaced with a simpler "Start Dialing / Next Lead" flow per spec (UI components themselves stay; only behavior changes).

## What gets rebuilt

### 1. Database (new migration)

New tables:
- `agent_telephony_credentials` — per-agent Telnyx SIP sub-credential metadata. The actual SIP password lives in Vault/secret per agent or is generated on demand by edge fn; only references stored.
- `call_sessions` — replaces `call_attempts` going forward (keep `call_attempts` table for history; new code writes only to `call_sessions`).

Updated tables:
- `daily_lead_assignments` already exists — add `phone_e164` snapshot + index on `(agent_id, assigned_date, status)`.
- `call_recordings` — add `call_session_id`, `download_url`, `available_at`, `status` columns.

New RPCs (security definer):
- `get_or_create_today_queue(_agent_id, _campaign_id)` — pulls/creates today's queue from eligible campaign_contacts the agent is assigned to.
- `lock_next_assignment(_agent_id, _campaign_id)` — atomic lock of next eligible assignment.
- `complete_assignment(_assignment_id, _disposition, _notes, _callback_at, _call_session_id)` — saves disposition + advances queue.
- `release_assignment_lock(_assignment_id)` — releases on call failure.

RLS: agent sees own assignments, sessions, recordings; admin sees all; team_leader sees their team; client sees own campaigns (read).

### 2. Edge functions (rebuilt / new)

- `telnyx-token` — rewritten. Verifies JWT, looks up `agent_telephony_credentials`, mints a Telnyx WebRTC `login_token` via Telnyx v2 API, returns short-lived token only. Never returns API key or SIP password.
- `telnyx-webhook` — rewritten. Verifies Telnyx Ed25519 signature using `TELNYX_WEBHOOK_SECRET`. Handles `call.initiated`, `call.answered`, `call.hangup`, `call.recording.saved`. Updates `call_sessions` + creates/updates `call_recordings`. Idempotent on `telnyx_call_control_id` + `telnyx_recording_id`.
- `telnyx-recording-url` (new) — returns a signed playback/download URL for a given `call_recording_id`, gated by RLS-equivalent role check.
- `dialer-start-call` (new, optional thin wrapper) — creates a `call_sessions` row before/at WebRTC dial so webhook can match by `telnyx_call_control_id` once known.

### 3. Frontend `use-telnyx.ts` (clean rewrite)

- Single `TelnyxRTC` client per agent session.
- States exposed: `initializing | ready | ringing | active | muted | held | ended | failed | error`.
- API: `makeCall(toE164, fromE164, metadata)`, `hangup`, `mute`, `unmute`, `hold`, `unhold`, `sendDTMF`.
- All transitions driven by SDK events (`telnyx.notification` with `call.state`), no termination timers.
- On `call.created`, posts `telnyx_call_control_id` to `call_sessions` row keyed by client-generated session id.

### 4. Frontend `use-dialer-queue.ts` (rewrite)

- `loadTodayQueue()` → calls `get_or_create_today_queue` RPC, returns assignment list.
- `lockNext()` → calls `lock_next_assignment`, returns the locked lead.
- `dispose(disposition, notes, callbackAt, callSessionId)` → calls `complete_assignment`.
- `releaseLock()` for cancelled calls.
- No auto-recycle, no auto-dial timers.

### 5. Dialer page wiring (minimal)

- Replace queue/telnyx hook calls with new APIs (same prop shapes where possible to avoid UI churn).
- Remove the old `autoDialPendingRef` / power-dial auto-trigger `useEffect` blocks. Keep the Power Dial card visually but rebind to a simple "Start Dialing" that loads the first lead — agent always clicks Call/Next manually per spec.
- Add Telnyx call-state badge values mapped to new states (UI element already present).

### 6. Recordings page

- Rewire query to read from `call_recordings` joined with `call_sessions`, contacts, campaigns, profiles.
- Playback uses HTML5 `<audio>` with src from `telnyx-recording-url` edge fn (signed).
- Download button uses same signed URL with `download` attribute.
- Same component is embedded under the LeadCard in Dialer and inside contact profile / `ContactActivityTimeline`.

## Technical details

- Telnyx WebRTC SDK already at 2.26.4.
- Token mint endpoint: `POST https://api.telnyx.com/v2/telephony_credentials/{id}/token` using `TELNYX_API_KEY`.
- One `agent_telephony_credentials` row per agent; admin provisions it via existing User Management page (small form addition is OUT of scope here — admin can seed via SQL initially; UI add-on can be a follow-up).
- Webhook signature verified with Ed25519 public key (`TELNYX_WEBHOOK_SECRET` is the public key from Telnyx portal).
- Caller-ID local-presence rotation reuses existing `caller_ids` + `campaign_caller_ids` tables and `useCampaignPhones` hook (kept).
- All new edge functions use `verify_jwt = false` default and validate JWT in code via `getClaims()`, except `telnyx-webhook` which is public + signature-verified.

## Out of scope (call out to user)

- Admin UI to provision per-agent Telnyx sub-credentials — initial provisioning will be SQL/manual; UI can follow.
- Migrating historical `call_attempts` rows into `call_sessions` — old data stays readable in old table; new calls go to new table.
- AI summary / training simulation flows — untouched.

## Order of execution

1. Migration (new tables + RPCs + RLS).
2. Edge functions: `telnyx-token`, `telnyx-webhook`, `telnyx-recording-url`.
3. Delete old edge functions.
4. Rewrite `use-telnyx.ts` and `use-dialer-queue.ts`.
5. Rewire `Dialer.tsx` (behavior only, no UI changes).
6. Rewire `Recordings.tsx` data source.
7. Smoke-test via curl on edge functions and a test call.
