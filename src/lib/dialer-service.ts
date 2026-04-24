/**
 * Frontend façade for the server-side dialer backend.
 * Wraps RPCs and edge functions so components don't reach into Supabase directly.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NextLead {
  contact_id: string;
  campaign_contact_id: string;
  first_name: string;
  last_name: string;
  phone_e164: string | null;
  state: string | null;
  city: string | null;
  zip_code: string | null;
  attempts: number;
  priority_band: "high" | "medium" | "low";
  priority_score: number;
}

export type Disposition =
  | "appointment_booked"
  | "dnc"
  | "wrong_number"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "not_interested"
  | "callback"
  | "connected"
  | "already_customer";

/** Canonical set of dispositions accepted by the server-side complete_dial_attempt RPC. */
export const VALID_DISPOSITIONS: readonly Disposition[] = [
  "appointment_booked",
  "dnc",
  "wrong_number",
  "voicemail",
  "no_answer",
  "busy",
  "not_interested",
  "callback",
  "connected",
  "already_customer",
] as const;

/** Dispositions that require a callback timestamp. */
const CALLBACK_REQUIRED: ReadonlySet<Disposition> = new Set(["callback"]);

export class DialerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DialerValidationError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DialerValidationError(`${field} is required`);
  }
  if (!UUID_RE.test(value)) {
    throw new DialerValidationError(`${field} is not a valid id`);
  }
}

/**
 * Validate inputs before completing a dial attempt.
 * Throws DialerValidationError for any client-detectable problem so we never
 * round-trip an invalid request to the server.
 */
export function validateCompleteDialAttempt(
  callAttemptId: unknown,
  disposition: unknown,
  opts: { notes?: string; callbackAt?: Date } = {},
): asserts disposition is Disposition {
  assertUuid(callAttemptId, "call_attempt_id");

  if (typeof disposition !== "string" || !disposition.trim()) {
    throw new DialerValidationError("Disposition is required");
  }
  if (!VALID_DISPOSITIONS.includes(disposition as Disposition)) {
    throw new DialerValidationError(`Invalid disposition: ${disposition}`);
  }

  if (CALLBACK_REQUIRED.has(disposition as Disposition)) {
    if (!(opts.callbackAt instanceof Date) || isNaN(opts.callbackAt.getTime())) {
      throw new DialerValidationError("Callback disposition requires a callback date/time");
    }
    if (opts.callbackAt.getTime() <= Date.now()) {
      throw new DialerValidationError("Callback time must be in the future");
    }
  }

  if (opts.notes !== undefined && typeof opts.notes !== "string") {
    throw new DialerValidationError("Notes must be text");
  }
  if (typeof opts.notes === "string" && opts.notes.length > 5000) {
    throw new DialerValidationError("Notes must be under 5000 characters");
  }
}

/** Validate inputs before originating an outbound call. */
export function validateCreateOutboundCall(args: {
  campaignId: unknown;
  contactId: unknown;
  agentId?: unknown;
  fromNumber?: unknown;
}): void {
  assertUuid(args.campaignId, "campaign_id");
  assertUuid(args.contactId, "contact_id");
  if (args.agentId !== undefined && args.agentId !== null) {
    assertUuid(args.agentId, "agent_id");
  }
  if (args.fromNumber !== undefined && args.fromNumber !== null) {
    if (typeof args.fromNumber !== "string" || !/^\+[1-9]\d{6,14}$/.test(args.fromNumber)) {
      throw new DialerValidationError("from_number must be E.164 format");
    }
  }
}

/** Power dialer: pull the next eligible lead for the current agent on a campaign. */
export async function getNextLead(campaignId: string): Promise<NextLead | null> {
  assertUuid(campaignId, "campaign_id");
  const { data, error } = await supabase.functions.invoke("power-dialer-next", {
    body: { campaign_id: campaignId },
  });
  if (error) throw error;
  return data?.contact ?? null;
}

/** Apply disposition to a finished call. */
export async function completeDialAttempt(
  callAttemptId: string,
  disposition: Disposition,
  opts: { notes?: string; callbackAt?: Date } = {},
): Promise<void> {
  validateCompleteDialAttempt(callAttemptId, disposition, opts);
  const { error } = await supabase.rpc("complete_dial_attempt", {
    _call_attempt_id: callAttemptId,
    _disposition: disposition,
    _notes: opts.notes ?? null,
    _callback_at: opts.callbackAt ? opts.callbackAt.toISOString() : null,
  });
  if (error) throw error;
}

/** Server-side outbound call origination (used by predictive mode). */
export async function createOutboundCall(args: {
  campaignId: string;
  contactId: string;
  agentId?: string;
  fromNumber?: string;
}): Promise<{ call_attempt_id: string; telnyx_call_control_id: string; from: string; to: string }> {
  validateCreateOutboundCall(args);
  const { data, error } = await supabase.functions.invoke("telnyx-create-call", {
    body: {
      campaign_id: args.campaignId,
      contact_id: args.contactId,
      agent_id: args.agentId,
      from_number: args.fromNumber,
    },
  });
  if (error) throw error;
  return data;
}

/** Manually tick the predictive engine for a campaign. (Normally cron-driven.) */
export async function tickPredictiveEngine(campaignId: string) {
  assertUuid(campaignId, "campaign_id");
  const { data, error } = await supabase.functions.invoke("predictive-dialer-engine", {
    body: { campaign_id: campaignId },
  });
  if (error) throw error;
  return data as {
    placed: number;
    target: number;
    available_agents: number;
    active_calls: number;
    pacing_ratio: number;
  };
}