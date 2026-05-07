## Telnyx Dialer Full Rebuild — Plan

This plan implements the uploaded spec while reconciling overlap with what's already in the project. Existing UI is preserved; only calling logic is replaced.

### Important conflicts to be aware of

The project already has a lot of what the spec asks for, under different names:


| Spec wants                     | Already exists                                                                                                                  | Decision                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `call_sessions`                | `call_attempts` (richer, with events, outcomes, RPCs `complete_dial_attempt`)                                                   | **Create new `call_sessions**` as spec dictates ("redo from scratch"). Old table left untouched so other features (reports, predictive engine) keep working. |
| `call_dispositions`            | dispositions live on `call_attempts.disposition` + `complete_dial_attempt` RPC                                                  | **Create new `call_dispositions**` table.                                                                                                                    |
| `call_recordings`              | recordings tracked on `call_attempts` + Recordings page                                                                         | **Create new `call_recordings**` table.                                                                                                                      |
| `daily_lead_assignments`       | already exists with richer schema (`disposition`, `call_attempt_id`, RPCs `lock_queue_assignment`, `complete_queue_assignment`) | **Reuse existing**. Add only missing columns from spec if any (status enum already broader).                                                                 |
| `telnyx-token` edge function   | exists                                                                                                                          | **Replace** with spec version (per-agent SIP credential lookup).                                                                                             |
| `telnyx-webhook` edge function | exists, writes to `call_attempts`                                                                                               | **Extend** (don't replace) so it also updates new `call_sessions`/`call_recordings`. Keeps existing dialer working.                                          |
| `agent_telephony_credentials`  | does not exist                                                                                                                  | **Create** as specified.                                                                                                                                     |
| `roles`                        | spec uses `profiles.role`; project uses `user_roles` table + `has_role()`                                                       | **Adapt RLS** to use `has_role(auth.uid(),'admin')` etc. instead of `profiles.role`.                                                                         |


### Part 1 — Migrations

Single migration creating:

- `agent_telephony_credentials` (per spec) + RLS using `has_role`.
- `call_sessions` (per spec) + RLS using `has_role` (admin/team_leader/manager).
- `call_recordings` (per spec) + RLS.
- `call_dispositions` (per spec) + RLS.
- Skip recreating `daily_lead_assignments` (already present); add any missing columns only if needed.

### Part 2 — Edge functions

- `telnyx-token`: **replace** existing with spec version (agent-scoped credential lookup, returns `login_token` + `sip_username`).
- `dialer-start-session`: **new**, locks assignment + creates `call_sessions` row.
- `dialer-save-disposition`: **new**, writes `call_dispositions`, marks session ended, completes assignment.
- `dialer-release-lock`: **new**, releases lock + marks session failed.
- `telnyx-webhook`: **extend** existing — keep current logic for `call_attempts`, add new branches for `call_sessions` updates (`call.initiated`/`answered`/`hangup`) and `call_recordings` upsert on `recording.saved`.

### Part 3 — Frontend hook

- New `src/hooks/useTelnyxWebRTC.ts` exactly as specified, using `@telnyx/webrtc`.
- Install `@telnyx/webrtc` package.

### Part 4 — Dialer page

- Rebuild `src/pages/Dialer.tsx` calling logic per spec while preserving existing UI scaffolding (sidebar, layout). Replace inner call panel with new flow:
  - load today's `daily_lead_assignments` queue
  - `useTelnyxWebRTC` for connect/call/hangup/mute/hold
  - call → `dialer-start-session` → `makeCall`
  - on Telnyx hangup event → require disposition
  - save → `dialer-save-disposition` → next lead enabled
- Add `RecordingPlayer` component (export from a shared location, e.g. `src/components/dialer/RecordingPlayer.tsx`, re-exported from Dialer for spec compatibility).

### Part 5 — Recordings page

- Rewrite `src/pages/Recordings.tsx` to query the new `call_recordings` table joined with `call_sessions`, leads/contacts, and agents.
- Search box; filters scaffolded; uses `RecordingPlayer`.
- Note: project's "leads" are stored in `contacts`. Will join on `contacts` (aliased `leads:lead_id`) and resolve agent name via `profiles`.

### Part 6 — Bug fixes

Sweep `src/pages/Dialer.tsx`, `src/hooks/use-dialer-queue.ts`, `src/lib/telephony-service.ts`, `src/hooks/use-telnyx.ts`:

- Remove any `setInterval`/`setTimeout` auto-dial loops.
- Remove "last dialed lead" fallback selection.
- Remove fake call-state auto-advance timers.
- Disable Call button unless `callStatus ∈ {idle,ready,ended}`.
- Block Next Lead until `dispositionRequired === false`.
- Ensure `callStatus = 'ended'` only on Telnyx event or user action.

### Part 7 — Security checklist

- `TELNYX_API_KEY` only used in edge functions (already true).
- New tables RLS-enabled; agent-scoped policies use `has_role`.
- Webhook uses `SUPABASE_SERVICE_ROLE_KEY`.
- `RecordingPlayer` uses DB `recording_url` only.

### Part 8 — Dependencies

- `bun add @telnyx/webrtc`.

### Open questions / risks

1. **Per-agent Telnyx credentials**: `telnyx-token` edge function (spec version) requires each agent to have a row in `agent_telephony_credentials` with a `telnyx_credential_id`. Today the project uses one shared SIP user from secrets. After this migration, **no agent can place calls until credentials are provisioned**. Provisioning UI is not in scope of this prompt — admins will need to insert rows manually or we add a follow-up task.
2. **Old dialer surface area**: `complete_dial_attempt` RPC, `call_attempts`, predictive engine, power-dialer-next, AI summary, audit, reports all key off `call_attempts`. By creating a parallel `call_sessions` system, those will not see new calls. The spec explicitly says "redo from scratch" — accepting that these old surfaces will only show legacy data going forward.
3. Recordings page rewrite means existing filter logic / pagination is lost; replaced with the simpler spec version.

### Files to add/edit

**Add:** `supabase/migrations/<ts>_telnyx_dialer_rebuild.sql`, `supabase/functions/dialer-start-session/index.ts`, `supabase/functions/dialer-save-disposition/index.ts`, `supabase/functions/dialer-release-lock/index.ts`, `src/hooks/useTelnyxWebRTC.ts`, `src/components/dialer/RecordingPlayer.tsx`.

**Replace:** `supabase/functions/telnyx-token/index.ts`, `src/pages/Dialer.tsx`, `src/pages/Recordings.tsx`.

**Edit:** `supabase/functions/telnyx-webhook/index.ts` (additive), `package.json` (add `@telnyx/webrtc`), and any file containing auto-dial/auto-state logic flagged in Part 6.

Approved with the following decisions on the open questions:

**1. Per-agent Telnyx credentials:** For now, fall back to the shared SIP credential stored in Supabase secrets (`TELNYX_SIP_USERNAME`, `TELNYX_CREDENTIAL_ID`) if no row exists in `agent_telephony_credentials` for the agent. This keeps calls working immediately. Do not block all agents — only use per-agent credentials if a row exists, otherwise use the shared fallback secret.

**2. Parallel call_sessions vs call_attempts:** Accepted. New `call_sessions` runs in parallel. Do NOT touch `call_attempts`, `complete_dial_attempt`, the predictive engine, power-dialer-next, AI summary, or any reports. Those remain on `call_attempts` as legacy. The new Dialer page and Recordings page use only `call_sessions` and `call_recordings`.

**3. Recordings page:** Accepted — replace with the spec version. The existing filter/pagination logic can be rebuilt in a follow-up. Priority is working playback and download.

**One additional requirement:** In the `telnyx-webhook` extension, make sure the matching logic finds the correct `call_sessions` row by `telnyx_call_control_id`. Do not attempt to match via `call_attempts` for the new recording upsert path.