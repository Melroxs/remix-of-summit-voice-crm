/**
 * Pure functions describing dialer queue behavior.
 * Extracted so they can be unit-tested without mocking Supabase.
 */

/** Dispositions that permanently remove a lead from the queue. */
export const TERMINAL_DISPOSITIONS = [
  "wrong_number",
  "dnc",
  "not_interested",
  "appointment_booked",
  "have_solar",
] as const;

/** Dispositions that defer the lead via a retry delay. */
export const RETRY_DISPOSITIONS = ["no_answer", "voicemail", "busy"] as const;

export type DispositionKind = "terminal" | "callback" | "retry" | "contact";

export function classifyDisposition(code: string): DispositionKind {
  if ((TERMINAL_DISPOSITIONS as readonly string[]).includes(code)) return "terminal";
  if (code === "callback") return "callback";
  if ((RETRY_DISPOSITIONS as readonly string[]).includes(code)) return "retry";
  return "contact";
}

export interface RetrySettings {
  retry_delay_no_answer: number;
  retry_delay_voicemail: number;
  max_attempts: number;
}

export interface NextStateInput {
  disposition: string;
  newAttempts: number;
  settings: RetrySettings;
  /** When the disposition is recorded — defaults to Date.now(). */
  nowMs?: number;
}

export interface NextStateResult {
  /** Final dial_status to write back. */
  dial_status: "pending" | "completed";
  /** ISO timestamp when the lead becomes eligible again, null if no retry scheduled. */
  next_eligible_at: string | null;
  /** Whether the lead is finished (terminal, callback, or maxed-out retry). */
  isFinal: boolean;
}

export function computeNextState({
  disposition,
  newAttempts,
  settings,
  nowMs = Date.now(),
}: NextStateInput): NextStateResult {
  const kind = classifyDisposition(disposition);

  if (kind === "terminal") {
    return { dial_status: "completed", next_eligible_at: null, isFinal: true };
  }
  if (kind === "callback") {
    return { dial_status: "completed", next_eligible_at: null, isFinal: true };
  }
  if (kind === "retry") {
    if (newAttempts >= settings.max_attempts) {
      return { dial_status: "completed", next_eligible_at: null, isFinal: true };
    }
    const delay =
      disposition === "voicemail" ? settings.retry_delay_voicemail : settings.retry_delay_no_answer;
    return {
      dial_status: "pending",
      next_eligible_at: new Date(nowMs + delay * 1000).toISOString(),
      isFinal: false,
    };
  }
  // generic contact disposition leaves the lead in queue with no delay
  return { dial_status: "pending", next_eligible_at: null, isFinal: false };
}

/** Map a disposition code to the resulting contacts.lead_status value. */
export function mapLeadStatus(disposition: string): "new" | "contacted" | "qualified" | "dead" {
  const map: Record<string, "new" | "contacted" | "qualified" | "dead"> = {
    appointment_booked: "qualified",
    not_interested: "dead",
    dnc: "dead",
    wrong_number: "dead",
    have_solar: "dead",
  };
  return map[disposition] || "contacted";
}