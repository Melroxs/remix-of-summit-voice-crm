/**
 * Pure helpers for the appointment follow-up scheduling rules
 * (mirrors the create_appointment_follow_ups DB trigger so we
 * can unit-test the math the same way the trigger applies it).
 */

export interface FollowUpInput {
  appointmentAt: Date;
  hasCloser: boolean;
  /** Defaults to "now" — overridable for deterministic tests. */
  nowMs?: number;
}

export type FollowUpType =
  | "send_appointment_details"
  | "reminder_24h"
  | "confirmation_call"
  | "closer_handoff"
  | "post_appointment_followup";

export interface ScheduledFollowUp {
  type: FollowUpType;
  due_at: Date;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export function planFollowUps({ appointmentAt, hasCloser, nowMs }: FollowUpInput): ScheduledFollowUp[] {
  const now = nowMs ?? Date.now();
  const apptMs = appointmentAt.getTime();
  const out: ScheduledFollowUp[] = [];

  // Send details right away
  out.push({ type: "send_appointment_details", due_at: new Date(now + 15 * MIN) });

  // 24h reminder if appointment is more than 25h away
  if (apptMs > now + 25 * HOUR) {
    out.push({ type: "reminder_24h", due_at: new Date(apptMs - 24 * HOUR) });
  }

  // 2h confirmation call if appointment is more than 3h away
  if (apptMs > now + 3 * HOUR) {
    out.push({ type: "confirmation_call", due_at: new Date(apptMs - 2 * HOUR) });
  }

  if (hasCloser) {
    out.push({ type: "closer_handoff", due_at: new Date(now + 30 * MIN) });
  }

  out.push({ type: "post_appointment_followup", due_at: new Date(apptMs + 4 * HOUR) });
  return out;
}