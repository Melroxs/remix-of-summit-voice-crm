---
name: Team Leader Module
description: Supervisor tools — live dashboard, QA scoring, call monitoring, agent feedback, performance tracking
type: feature
---

## Team Leader Role
- `team_leader` added to `app_role` enum
- Assigned to campaigns via `campaign_agents` table (same as agents)
- Can view all profiles, call_logs, recordings in their campaigns
- Can score calls (qa_scores table) and leave feedback (agent_feedback table)
- Cannot access telephony secrets or system settings

## Pages
- `/team-dashboard` — Real-time agent status grid, today's metrics, live calls panel
- `/qa-dashboard` — QA rankings, recent scored calls, per-agent averages
- `/agent-performance` — Per-agent KPIs: calls, answer rate, appointments, conversion, avg duration, QA score
- `/my-feedback` — Agent-facing view of received feedback and QA scores

## Database Tables
- `qa_scores` — 7 category scores (1-5), auto-calculated total, notes/strengths/improvement
- `agent_feedback` — coaching/praise/improvement/general messages, acknowledgment flag

## Live Call Monitoring
- LiveCallsPanel shows active calls (ended_at IS NULL)
- Listen/Whisper/Barge buttons (requires Telnyx Conference API)
- Real-time updates via Supabase Realtime on call_logs and profiles

## Realtime
- profiles, call_logs, qa_scores tables added to supabase_realtime publication
