# Full Dialer Rebuild — Telnyx WebRTC

This is a large rebuild. I'll keep all existing Summit Leads branding, sidebar, dark UI, cyan accents, role system, campaigns, and unrelated pages untouched. Only the systems below change.

## Scope (in order)

### 1. Secrets & Backend Foundation
- Prompt to confirm/add Telnyx secrets: `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID` (WebRTC Credential Connection ID), `TELNYX_OUTBOUND_VOICE_PROFILE_ID` (already set), `TELNYX_SIP_USERNAME`/`TELNYX_SIP_PASSWORD` (already set), `TELNYX_WEBHOOK_SECRET` (already set), `TELNYX_DEFAULT_FROM_NUMBER`.
- New edge function `generate-telnyx-token` — auth-protected, mints a short-lived Telnyx on-demand credential token via Telnyx REST API; returns `{ login_token }` only. Never returns SIP password.
- Rewrite `telnyx-webhook` to verify Ed25519 signature with `TELNYX_WEBHOOK_SECRET` and handle: `call.initiated`, `call.ringing`, `call.answered`, `call.hangup`, `call.recording.saved`. Persists state to `call_attempts` and `call_recordings`.

### 2. Database
Migration adds:
- `daily_lead_assignments` table (campaign_id, contact_id, agent_id, assigned_by, assigned_date, queue_position, status, locked_at, locked_by, completed_at) with RLS: agents see own; admins/managers all.
- `call_attempts` — verify columns: `telnyx_call_control_id`, `telnyx_call_session_id`, `from_number`, `to_number`, `call_status`, `started_at`, `answered_at`, `ended_at`, `recording_url`, `error_message`. Add any missing.
- Unique index `(contact_id, assigned_date)` to prevent dup assignments.
- RPC `lock_next_queue_lead(agent_id)` and `complete_queue_lead(assignment_id, disposition, notes)` for atomic lock/unlock.

### 3. Frontend Telnyx Client (rebuild)
- Install `@telnyx/webrtc`.
- New `src/lib/telnyx-client.ts` — singleton wrapper: init with token, login, ready/reconnect/error events, mic permission, makeCall/hangup/mute/unmute, cleanup on unmount.
- New `src/hooks/use-telnyx-rtc.ts` — exposes connection state, current call state, controls. Replaces old `use-telnyx.ts`.
- Delete old broken dialer logic: `src/hooks/use-telnyx.ts`, `src/components/dialer/AudioControls.tsx` (replaced), fake-call code paths in `Dialer.tsx`.

### 4. Pages — Admin Daily Lead Assignment
- `/admin/daily-lead-assignment` — campaign select, agent multi-select, leads-per-agent input, preview table, confirm. Pulls unassigned leads (no row in `daily_lead_assignments` for today), distributes evenly, inserts rows.

### 5. Pages — Agent Calling Queue
- `/agent/my-calling-queue` — today's assigned leads for `auth.uid()`, ordered by `queue_position`. First lead unlocked; rest greyed/locked. Start Dialing → Call (real Telnyx) → live state (connecting/ringing/active/ended) → require disposition + notes → Save & Unlock Next.

### 6. Dialer Dashboard
- Rebuild `src/pages/Dialer.tsx` to use new Telnyx client, show real states only. Real timer starts on `answered`. Buttons: Call / Hangup / Mute / Save Disposition / Save & Unlock Next. Inline latest recording playback after call ends.

### 7. Recordings
- `src/pages/Recordings.tsx` — list rows from `call_recordings` joined with `call_attempts` + contact + agent + campaign. Inline `<audio>` player with play/pause, download, search, filters (agent, campaign, date, disposition, duration, phone).

### 8. Contacts Filters
- Add advanced filter drawer to `src/pages/Contacts.tsx`: campaign, status, owner/agent, city, state, zip, county, area code, upload batch, created date, last called, disposition, appointment status, assigned/unassigned, owner/renter, credit rating, home value, household income.

### 9. Imports Batch Delete
- `src/pages/Imports.tsx` — multi-select batches, bulk delete modal with two options: (A) delete upload record only, (B) delete upload record + imported contacts. Show affected contact count first. Preserves `call_attempts` unless explicitly confirmed.

### 10. Diagnostics
- `/admin/dialer-diagnostics` — checks: secrets present (server-side), Telnyx connected, mic granted, queue assigned, outbound number set, test-call button, webhook events received in last hour, recording received, call/disposition save flow.

### 11. Cleanup
- Delete fake/mock dial behavior, unused telephony env code, old softphone bits in `Dialer.tsx`, `AudioControls.tsx`, `use-telnyx.ts`, `telnyx-config.ts` legacy paths.

## Non-Goals (untouched)
Branding, sidebar, theme, campaigns CRUD, technician system, client portal, team dashboard, QA, training hub, follow-ups, callbacks page, appointments page, auth pages.

## Risks / Notes
- Telnyx on-demand-credentials API requires a Credential Connection in your Telnyx portal. I'll need `TELNYX_CONNECTION_ID` (the Credential Connection ID, not Voice API app).
- This is ~15 file changes + 1 migration + 2 edge functions. I'll work in sequence and verify build after each major step.

## Confirm to proceed
Reply "go" and I'll start with secrets prompt + migration.
