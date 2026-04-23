/**
 * Lead Priority Scoring System
 * Calculates priority scores (0-100) and bands for campaign contacts.
 */

import { supabase } from "@/integrations/supabase/client";

export type PriorityBand = "hot" | "warm" | "medium" | "low" | "excluded";

export interface LeadScore {
  score: number;
  band: PriorityBand;
  reason: string;
}

// Terminal dispositions that exclude from queue
const EXCLUDED_DISPOSITIONS = ["dnc", "wrong_number", "have_solar", "appointment_booked"];

/**
 * Calculate priority score for a campaign contact.
 */
export async function calculateLeadScore(
  contactId: string,
  campaignId: string
): Promise<LeadScore> {
  // Fetch data in parallel
  const [callLogsRes, callbacksRes, appointmentsRes, contactRes] = await Promise.all([
    supabase
      .from("call_attempts")
      .select("disposition, duration_seconds, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("callbacks")
      .select("callback_at, status, priority")
      .eq("contact_id", contactId)
      .eq("status", "pending"),
    supabase
      .from("appointments")
      .select("status")
      .eq("contact_id", contactId),
    supabase
      .from("contacts")
      .select("owner_renter, credit_rating, home_value, household_income, lead_status")
      .eq("id", contactId)
      .single(),
  ]);

  const calls = callLogsRes.data || [];
  const pendingCallbacks = callbacksRes.data || [];
  const appointments = appointmentsRes.data || [];
  const contact = contactRes.data;

  // Check exclusions first
  const lastDisposition = calls[0]?.disposition;
  if (lastDisposition && EXCLUDED_DISPOSITIONS.includes(lastDisposition)) {
    return { score: 0, band: "excluded", reason: `Excluded: ${lastDisposition}` };
  }
  if (contact?.lead_status === "dead" || contact?.lead_status === "converted") {
    return { score: 0, band: "excluded", reason: `Lead status: ${contact.lead_status}` };
  }

  let score = 50; // baseline
  const reasons: string[] = [];

  // Pending callbacks = highest priority boost
  if (pendingCallbacks.length > 0) {
    const now = new Date();
    const overdue = pendingCallbacks.some((cb) => new Date(cb.callback_at) <= now);
    if (overdue) {
      score += 40;
      reasons.push("Overdue callback");
    } else {
      score += 30;
      reasons.push("Pending callback");
    }
    // Extra for high priority callbacks
    const highPri = pendingCallbacks.some((cb) => (cb.priority || 0) >= 5);
    if (highPri) { score += 5; reasons.push("High priority"); }
  }

  // Prior answered calls (engagement signal)
  const answeredCalls = calls.filter((c) => c.duration_seconds && c.duration_seconds > 10);
  if (answeredCalls.length > 0) {
    score += Math.min(answeredCalls.length * 5, 15);
    reasons.push(`${answeredCalls.length} answered calls`);
  }

  // Homeowner bonus
  if (contact?.owner_renter?.toLowerCase() === "owner") {
    score += 5;
    reasons.push("Homeowner");
  }

  // Credit rating
  if (contact?.credit_rating) {
    const cr = contact.credit_rating.toLowerCase();
    if (cr === "excellent" || cr === "good" || cr.includes("7") || cr.includes("8")) {
      score += 5;
      reasons.push("Good credit");
    }
  }

  // Income / home value signals
  if (contact?.household_income) {
    const income = parseInt(contact.household_income.replace(/\D/g, ""));
    if (income > 75000) { score += 3; reasons.push("Higher income"); }
  }
  if (contact?.home_value) {
    const hv = parseInt(contact.home_value.replace(/\D/g, ""));
    if (hv > 200000) { score += 3; reasons.push("Higher home value"); }
  }

  // Attempt penalty
  const attemptCount = calls.length;
  if (attemptCount >= 3) {
    score -= Math.min(attemptCount * 3, 15);
    reasons.push(`${attemptCount} attempts`);
  }

  // Recency boost: if last call was recent (engagement)
  if (calls[0]) {
    const daysSince = (Date.now() - new Date(calls[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) { score += 5; reasons.push("Recent activity"); }
    else if (daysSince > 14) { score -= 5; reasons.push("Stale lead"); }
  }

  // No prior contact is neutral (keep at baseline)
  if (calls.length === 0 && pendingCallbacks.length === 0) {
    reasons.push("New lead");
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // Determine band
  let band: PriorityBand;
  if (score >= 80) band = "hot";
  else if (score >= 60) band = "warm";
  else if (score >= 40) band = "medium";
  else band = "low";

  return { score, band, reason: reasons.join("; ") || "Baseline" };
}

/**
 * Score all pending contacts in a campaign and update their records.
 */
export async function rescoreCampaignContacts(campaignId: string): Promise<void> {
  const { data: contacts } = await supabase
    .from("campaign_contacts")
    .select("id, contact_id")
    .eq("campaign_id", campaignId)
    .in("dial_status", ["pending", "dialing"]);

  if (!contacts || contacts.length === 0) return;

  // Score in batches of 10 to avoid overwhelming
  for (let i = 0; i < contacts.length; i += 10) {
    const batch = contacts.slice(i, i + 10);
    await Promise.all(
      batch.map(async (cc) => {
        const result = await calculateLeadScore(cc.contact_id, campaignId);
        await supabase
          .from("campaign_contacts")
          .update({
            priority_score: result.score,
            priority_band: result.band as any,
            score_reason: result.reason,
          } as any)
          .eq("id", cc.id);
      })
    );
  }
}

/**
 * Score a single contact and update their campaign_contacts record.
 */
export async function rescoreSingleContact(
  campaignContactId: string,
  contactId: string,
  campaignId: string
): Promise<LeadScore> {
  const result = await calculateLeadScore(contactId, campaignId);
  await supabase
    .from("campaign_contacts")
    .update({
      priority_score: result.score,
      priority_band: result.band as any,
      score_reason: result.reason,
    } as any)
    .eq("id", campaignContactId);
  return result;
}
