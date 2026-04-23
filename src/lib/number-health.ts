/**
 * Number Health + Spam Avoidance System
 * Now consolidated on `caller_ids` (which holds both number config + stats)
 * and `campaign_caller_ids` (which links numbers to campaigns).
 */

import { supabase } from "@/integrations/supabase/client";

export type NumberHealthStatus = "healthy" | "warm" | "fatigued" | "cooling_down" | "blocked";

export interface NumberHealth {
  phoneNumberId: string;
  phoneNumber: string;
  healthStatus: NumberHealthStatus;
  callsToday: number;
  totalCalls: number;
  answerRate: number;
  cooldownUntil: string | null;
  isAvailable: boolean;
}

/** Compute health from current counters + caps. */
function computeHealth(
  callsToday: number,
  maxPerDay: number,
  totalCalls: number,
  answeredCalls: number,
  cooldownUntil: string | null
): { health: NumberHealthStatus; cooldownUntil: string | null } {
  if (cooldownUntil && new Date(cooldownUntil) > new Date()) {
    return { health: "cooling_down", cooldownUntil };
  }
  const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;
  if (totalCalls > 20 && answerRate < 5) return { health: "blocked", cooldownUntil: null };
  if (callsToday >= maxPerDay) return { health: "cooling_down", cooldownUntil };
  if (callsToday >= maxPerDay * 0.8) return { health: "fatigued", cooldownUntil: null };
  if (callsToday >= maxPerDay * 0.5) return { health: "warm", cooldownUntil: null };
  return { health: "healthy", cooldownUntil: null };
}

/** Record a call made with this number and update health metrics. */
export async function recordCallForNumber(
  callerId: string,
  wasAnswered: boolean,
  wasAppointment: boolean,
  _maxPerHour: number = 15,
  maxPerDay: number = 100,
  cooldownMinutes: number = 30
): Promise<void> {
  const { data: row } = await supabase
    .from("caller_ids")
    .select("total_calls, answered_calls, appointments, cooldown_until, max_calls_per_day")
    .eq("id", callerId)
    .maybeSingle();
  if (!row) return;

  const newTotal = (row.total_calls || 0) + 1;
  const newAnswered = (row.answered_calls || 0) + (wasAnswered ? 1 : 0);
  const newAppointments = (row.appointments || 0) + (wasAppointment ? 1 : 0);
  // calls_today is approximated by tracking via daily reset; for now we treat total as proxy
  // and rely on max_calls_per_day to flip cooldown.
  const cap = row.max_calls_per_day ?? maxPerDay;
  const cooldownUntil = newTotal % cap === 0
    ? new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString()
    : row.cooldown_until;

  const { health, cooldownUntil: nextCooldown } = computeHealth(
    newTotal % cap,
    cap,
    newTotal,
    newAnswered,
    cooldownUntil
  );

  await supabase
    .from("caller_ids")
    .update({
      total_calls: newTotal,
      answered_calls: newAnswered,
      appointments: newAppointments,
      health_status: health,
      cooldown_until: nextCooldown,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", callerId);
}

/** Check if a number is currently available for calling. */
export async function isNumberAvailable(callerId: string): Promise<boolean> {
  const { data: row } = await supabase
    .from("caller_ids")
    .select("health_status, cooldown_until, is_active")
    .eq("id", callerId)
    .maybeSingle();
  if (!row || !row.is_active) return false;
  if (row.health_status === "blocked") return false;
  if (row.health_status === "cooling_down" && row.cooldown_until && new Date(row.cooldown_until) > new Date()) {
    return false;
  }
  return true;
}

/** Select the best number from a campaign's pool using health-based rotation. */
export async function selectBestNumber(
  campaignId: string,
  leadAreaCode?: string | null,
  localPresence: boolean = false,
  strategy: string = "round_robin"
): Promise<{ id: string; phone_number: string } | null> {
  const { data: links } = await supabase
    .from("campaign_caller_ids")
    .select("rotation_order, caller_ids(id, phone_e164, area_code, is_active, health_status, cooldown_until, max_calls_per_day, total_calls, answered_calls)")
    .eq("campaign_id", campaignId)
    .order("rotation_order", { ascending: true });

  if (!links || links.length === 0) return null;

  type CallerRow = {
    id: string;
    phone_e164: string;
    area_code: string | null;
    is_active: boolean;
    health_status: NumberHealthStatus;
    cooldown_until: string | null;
    max_calls_per_day: number;
    total_calls: number;
    answered_calls: number;
  };

  const numbers: CallerRow[] = links
    .map((l: any) => l.caller_ids as CallerRow)
    .filter((n): n is CallerRow => !!n && n.is_active);

  // Filter available
  const now = new Date();
  const available = numbers.filter((n) => {
    if (n.health_status === "blocked") return false;
    if (n.health_status === "cooling_down" && n.cooldown_until && new Date(n.cooldown_until) > now) return false;
    return true;
  });

  if (available.length === 0) return null;

  // Local presence: prefer matching area code
  if (localPresence && leadAreaCode) {
    const localMatch = available.filter((n) => {
      const nArea = n.area_code || n.phone_e164.replace(/^\+1/, "").substring(0, 3);
      return nArea === leadAreaCode;
    });
    if (localMatch.length > 0) {
      return selectFromPool(localMatch, strategy);
    }
  }

  return selectFromPool(available, strategy);
}

function selectFromPool(
  pool: Array<{ id: string; phone_e164: string; health_status: NumberHealthStatus }>,
  strategy: string
): { id: string; phone_number: string } {
  if (strategy === "random") {
    const idx = Math.floor(Math.random() * pool.length);
    return { id: pool[idx].id, phone_number: pool[idx].phone_e164 };
  }
  if (strategy === "health_based") {
    const order: Record<string, number> = { healthy: 0, warm: 1, fatigued: 2 };
    pool.sort((a, b) => (order[a.health_status] ?? 3) - (order[b.health_status] ?? 3));
    return { id: pool[0].id, phone_number: pool[0].phone_e164 };
  }
  return { id: pool[0].id, phone_number: pool[0].phone_e164 };
}

/** Get health dashboard data for all numbers in a campaign. */
export async function getCampaignNumberHealth(campaignId: string): Promise<NumberHealth[]> {
  const { data: links } = await supabase
    .from("campaign_caller_ids")
    .select("caller_ids(id, phone_e164, health_status, total_calls, answered_calls, cooldown_until, max_calls_per_day, is_active)")
    .eq("campaign_id", campaignId);

  if (!links || links.length === 0) return [];

  const now = new Date();
  return links
    .map((l: any) => l.caller_ids)
    .filter(Boolean)
    .map((n: any) => {
      const cooling = n.health_status === "cooling_down" && n.cooldown_until && new Date(n.cooldown_until) > now;
      const answerRate = n.total_calls > 0 ? Math.round((n.answered_calls / n.total_calls) * 10000) / 100 : 0;
      return {
        phoneNumberId: n.id,
        phoneNumber: n.phone_e164,
        healthStatus: (n.health_status as NumberHealthStatus) || "healthy",
        callsToday: 0,
        totalCalls: n.total_calls || 0,
        answerRate,
        cooldownUntil: n.cooldown_until,
        isAvailable: n.is_active && !cooling && n.health_status !== "blocked",
      };
    });
}
