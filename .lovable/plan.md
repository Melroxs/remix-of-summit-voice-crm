
# Team Leader / Supervisor Module

## Phase 1: Database & Role Setup
1. **Add `team_leader` to `app_role` enum**
2. **Create `qa_scores` table** — stores per-call QA ratings (7 categories, 1-5 each), notes, feedback, scored_by
3. **Create `agent_feedback` table** — coaching notes from team leaders to agents
4. **Update RLS policies** — team leaders can view agents/calls in their assigned campaigns, score calls, leave feedback
5. **Enable realtime** on `profiles` table for live status updates

## Phase 2: Live Team Dashboard
- New page `/team-dashboard` with RoleGuard for `team_leader` + `admin`
- Real-time agent status grid (online/on_call/paused/wrap_up/offline)
- Today's metrics: total calls, calls/hour, connection rate, appointments, callbacks, avg duration
- Per-agent row: status, calls today, appointments, conversion rate, last call time
- Realtime subscription on `profiles` for status changes

## Phase 3: Live Call Monitoring UI
- "Live Calls" panel showing active calls (from `call_logs` where `ended_at IS NULL`)
- Listen / Whisper / Barge buttons per call
- **Important caveat**: Actual listen/whisper/barge requires Telnyx Conference API or Twilio Conference — I'll build the UI + edge function scaffolding that calls the Telnyx API to add a supervisor leg. Full functionality depends on Telnyx account having conference/supervision features enabled.

## Phase 4: QA Scoring System
- QA scoring form accessible from call records and recordings
- 7 categories with 1-5 ratings
- Auto-calculated total score
- QA Dashboard: avg scores per agent, trends, top/bottom performers

## Phase 5: Agent Performance Dashboard
- Per-agent stats: calls, answer rate, appointments, conversion, QA score, avg duration
- Filterable by campaign and date range

## Phase 6: Coaching & Feedback
- Team leaders can leave feedback per call or per agent
- Agents can view their own feedback and QA scores
- Coaching history timeline

## Phase 7: Navigation & Permissions
- Add sidebar items for team_leader role
- Update `create-user` edge function to support team_leader role
- Update UserManagement to assign team_leader role

## Pages Created
- `/team-dashboard` — Live team monitoring
- `/qa-scoring` — QA dashboard + scoring interface
- `/agent-performance` — Performance metrics

## Technical Notes
- Listen/Whisper/Barge: Will create edge function that uses Telnyx Call Control API (`conference` commands). Requires active Telnyx conference support on the account.
- Realtime: Will use Supabase Realtime on profiles + call_logs for live updates.
- All data protected by RLS — team leaders see only campaigns they're assigned to.
