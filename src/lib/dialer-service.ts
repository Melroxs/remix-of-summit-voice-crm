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

/** Power dialer: pull the next eligible lead for the current agent on a campaign. */
export async function getNextLead(campaignId: string): Promise<NextLead | null> {
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