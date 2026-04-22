/**
 * Number Health + Spam Avoidance System
 * Tracks per-number usage, calculates health status, and implements cooldown logic.
 */

import { supabase } from "@/integrations/supabase/client";

export type NumberHealthStatus = "healthy" | "warm" | "fatigued" | "cooling_down" | "blocked";

export interface NumberHealth {
  phoneNumberId: string;
  phoneNumber: string;
  healthStatus: NumberHealthStatus;
  callsLastHour: number;
  callsToday: number;
  totalCalls: number;
  answerRate: number;
  cooldownUntil: string | null;
  isAvailable: boolean;
}

/**
 * Get or create stats record for a phone number, resetting daily counters if needed.
 */
async function ensureStats(phoneNumberId: string): Promise<any> {
  const { data: existing } = await supabase
    .from("phone_number_stats")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (existing) {
    // Reset daily counters if date changed
    const today = new Date().toISOString().split("T")[0];
    if (existing.last_reset_date !== today) {
      const { data: updated } = await supabase
        .from("phone_number_stats")
        .update({
          calls_today: 0,
          calls_last_hour: 0,
          last_reset_date: today,
          health_status: existing.health_status === "cooling_down" ? "healthy" : existing.health_status,
          cooldown_until: null,
        } as any)
        .eq("id", existing.id)
        .select()
        .single();
      return updated || existing;
    }
    return existing;
  }

  // Create new stats record
  const { data: created } = await supabase
    .from("phone_number_stats")
    .insert({ phone_number_id: phoneNumberId } as any)
    .select()
    .single();
  return created;
}

/**
 * Record a call made with this number and update health metrics.
 */
export async function recordCallForNumber(
  phoneNumberId: string,
  wasAnswered: boolean,
  wasAppointment: boolean,
  maxPerHour: number = 15,
  maxPerDay: number = 100,
  cooldownMinutes: number = 30
): Promise<void> {
  const stats = await ensureStats(phoneNumberId);
  if (!stats) return;

  const newTotalCalls = (stats.total_calls || 0) + 1;
  const newAnswered = (stats.answered_calls || 0) + (wasAnswered ? 1 : 0);
  const newAppointments = (stats.appointments || 0) + (wasAppointment ? 1 : 0);
  const newCallsHour = (stats.calls_last_hour || 0) + 1;
  const newCallsToday = (stats.calls_today || 0) + 1;

  const answerRate = newTotalCalls > 0 ? (newAnswered / newTotalCalls) * 100 : 0;
  const appointmentRate = newTotalCalls > 0 ? (newAppointments / newTotalCalls) * 100 : 0;

  // Calculate health status
  let healthStatus: NumberHealthStatus = "healthy";
  let cooldownUntil: string | null = null;

  if (newCallsHour >= maxPerHour || newCallsToday >= maxPerDay) {
    healthStatus = "cooling_down";
    cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
  } else if (newCallsHour >= maxPerHour * 0.8 || newCallsToday >= maxPerDay * 0.8) {
    healthStatus = "fatigued";
  } else if (newCallsHour >= maxPerHour * 0.5 || newCallsToday >= maxPerDay * 0.5) {
    healthStatus = "warm";
  }

  // Low answer rate = deprioritize
  if (newTotalCalls > 20 && answerRate < 5) {
    healthStatus = "blocked";
  }

  await supabase
    .from("phone_number_stats")
    .update({
      total_calls: newTotalCalls,
      answered_calls: newAnswered,
      appointments: newAppointments,
      calls_last_hour: newCallsHour,
      calls_today: newCallsToday,
      answer_rate: Math.round(answerRate * 100) / 100,
      appointment_rate: Math.round(appointmentRate * 100) / 100,
      health_status: healthStatus,
      cooldown_until: cooldownUntil,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", stats.id);
}

/**
 * Check if a number is currently available for calling.
 */
export async function isNumberAvailable(phoneNumberId: string): Promise<boolean> {
  const stats = await ensureStats(phoneNumberId);
  if (!stats) return false;

  if (stats.health_status === "blocked") return false;
  if (stats.health_status === "cooling_down") {
    if (stats.cooldown_until && new Date(stats.cooldown_until) > new Date()) {
      return false;
    }
    // Cooldown expired, reset
    await supabase
      .from("phone_number_stats")
      .update({ health_status: "healthy", cooldown_until: null } as any)
      .eq("id", stats.id);
  }
  return true;
}

/**
 * Select the best number from a campaign's pool using health-based rotation.
 * Prefers healthy > warm > fatigued, skips cooling_down and blocked.
 * Supports local presence matching when enabled.
 */
export async function selectBestNumber(
  campaignId: string,
  leadAreaCode?: string | null,
  localPresence: boolean = false,
  strategy: string = "round_robin"
): Promise<{ id: string; phone_number: string } | null> {
  // Get all active numbers for this campaign
  const { data: numbers } = await supabase
    .from("campaign_phone_numbers")
    .select("id, phone_number, area_code, rotation_order, max_calls_per_hour, max_calls_per_day")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .order("rotation_order", { ascending: true });

  if (!numbers || numbers.length === 0) return null;

  // Get stats for all numbers
  const numberIds = numbers.map((n) => n.id);
  const { data: allStats } = await supabase
    .from("phone_number_stats")
    .select("*")
    .in("phone_number_id", numberIds);

  const statsMap = new Map((allStats || []).map((s: any) => [s.phone_number_id, s]));

  // Filter available numbers
  const available = numbers.filter((n) => {
    const s = statsMap.get(n.id);
    if (!s) return true; // no stats = healthy
    if (s.health_status === "blocked" || s.health_status === "cooling_down") {
      // Check if cooldown expired
      if (s.health_status === "cooling_down" && s.cooldown_until) {
        return new Date(s.cooldown_until) <= new Date();
      }
      return false;
    }
    return true;
  });

  if (available.length === 0) return null;

  // Local presence: prefer matching area code
  if (localPresence && leadAreaCode) {
    const localMatch = available.filter((n) => {
      const nArea = (n as any).area_code || n.phone_number.replace(/^\+1/, "").substring(0, 3);
      return nArea === leadAreaCode;
    });
    if (localMatch.length > 0) {
      return selectFromPool(localMatch, statsMap, strategy);
    }
  }

  return selectFromPool(available, statsMap, strategy);
}

function selectFromPool(
  pool: any[],
  statsMap: Map<string, any>,
  strategy: string
): { id: string; phone_number: string } {
  if (strategy === "random") {
    const idx = Math.floor(Math.random() * pool.length);
    return { id: pool[idx].id, phone_number: pool[idx].phone_number };
  }

  if (strategy === "health_based") {
    // Sort by health: healthy first, then warm, then fatigued
    const healthOrder: Record<string, number> = { healthy: 0, warm: 1, fatigued: 2 };
    pool.sort((a, b) => {
      const aHealth = statsMap.get(a.id)?.health_status || "healthy";
      const bHealth = statsMap.get(b.id)?.health_status || "healthy";
      return (healthOrder[aHealth] ?? 3) - (healthOrder[bHealth] ?? 3);
    });
    return { id: pool[0].id, phone_number: pool[0].phone_number };
  }

  // Default: round_robin by rotation_order (first in list)
  return { id: pool[0].id, phone_number: pool[0].phone_number };
}

/**
 * Get health dashboard data for all numbers in a campaign.
 */
export async function getCampaignNumberHealth(campaignId: string): Promise<NumberHealth[]> {
  const { data: numbers } = await supabase
    .from("campaign_phone_numbers")
    .select("id, phone_number")
    .eq("campaign_id", campaignId)
    .order("rotation_order");

  if (!numbers || numbers.length === 0) return [];

  const numberIds = numbers.map((n) => n.id);
  const { data: allStats } = await supabase
    .from("phone_number_stats")
    .select("*")
    .in("phone_number_id", numberIds);

  const statsMap = new Map((allStats || []).map((s: any) => [s.phone_number_id, s]));

  return numbers.map((n) => {
    const s = statsMap.get(n.id);
    const now = new Date();
    const isCooling = s?.health_status === "cooling_down" && s?.cooldown_until && new Date(s.cooldown_until) > now;

    return {
      phoneNumberId: n.id,
      phoneNumber: n.phone_number,
      healthStatus: (s?.health_status as NumberHealthStatus) || "healthy",
      callsLastHour: s?.calls_last_hour || 0,
      callsToday: s?.calls_today || 0,
      totalCalls: s?.total_calls || 0,
      answerRate: s?.answer_rate || 0,
      cooldownUntil: s?.cooldown_until || null,
      isAvailable: !isCooling && s?.health_status !== "blocked",
    };
  });
}
