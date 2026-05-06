import { supabase } from "@/integrations/supabase/client";
import { getTravelTime } from "@/lib/routing";
import type { Technician } from "@/hooks/use-technicians";

export interface RankedSlot {
  technician: Technician;
  start: Date;
  end: Date;
  travelInMin: number | null;
  originLabel: "previous appointment" | "home address" | "none";
  originAddress: string | null;
  prevEnd: Date | null;
}

interface BusyBlock {
  start: Date;
  end: Date;
  address: string | null;
}

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h || 0, m || 0];
}

/**
 * Find ranked technician/slot options for a job.
 * Searches `daysAhead` days starting from `fromDate` (default: now).
 * Returns up to `limit` options sorted by earliest start.
 */
export async function findBestTechnicians(opts: {
  technicians: Technician[];
  leadAddress: string;
  durationMinutes: number;
  requiredSkill?: string | null;
  fromDate?: Date;
  daysAhead?: number;
  limit?: number;
  excludeAppointmentId?: string;
}): Promise<RankedSlot[]> {
  const {
    technicians,
    leadAddress,
    durationMinutes,
    requiredSkill,
    fromDate = new Date(),
    daysAhead = 7,
    limit = 5,
    excludeAppointmentId,
  } = opts;

  const lead = leadAddress.trim();
  if (!lead || durationMinutes <= 0) return [];

  const techs = technicians.filter((t) => {
    if (!t.is_active) return false;
    if (requiredSkill && !t.skills.includes(requiredSkill)) return false;
    return true;
  });
  if (techs.length === 0) return [];

  const rangeStart = new Date(fromDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + daysAhead);

  // Pull all upcoming appointments for these techs in the window
  let q = supabase
    .from("technician_appointments")
    .select("id, technician_id, lead_address, start_time, end_time, status")
    .in("technician_id", techs.map((t) => t.id))
    .gte("start_time", rangeStart.toISOString())
    .lt("start_time", rangeEnd.toISOString())
    .not("status", "in", "(cancelled,no_show)");
  if (excludeAppointmentId) q = q.neq("id", excludeAppointmentId);

  const { data, error } = await q;
  if (error) throw error;

  const byTech = new Map<string, BusyBlock[]>();
  for (const row of data ?? []) {
    const arr = byTech.get(row.technician_id as string) ?? [];
    arr.push({
      start: new Date(row.start_time as string),
      end: new Date(row.end_time as string),
      address: (row.lead_address as string | null) ?? null,
    });
    byTech.set(row.technician_id as string, arr);
  }

  const candidates: Array<Omit<RankedSlot, "travelInMin"> & { travelInMin: number | null }> = [];

  for (const tech of techs) {
    const busy = (byTech.get(tech.id) ?? []).sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    for (let d = 0; d < daysAhead; d++) {
      const day = new Date(rangeStart);
      day.setDate(day.getDate() + d);
      if (!tech.working_days.includes(day.getDay())) continue;

      const [whSH, whSM] = parseHM(tech.working_hours_start);
      const [whEH, whEM] = parseHM(tech.working_hours_end);
      const wStart = new Date(day);
      wStart.setHours(whSH, whSM, 0, 0);
      const wEnd = new Date(day);
      wEnd.setHours(whEH, whEM, 0, 0);

      const dayBusy = busy.filter(
        (b) => b.end > wStart && b.start < wEnd,
      );

      // Build gaps
      type Gap = { start: Date; end: Date; prev: BusyBlock | null };
      const gaps: Gap[] = [];
      let cursor = wStart;
      let prev: BusyBlock | null = null;
      for (const b of dayBusy) {
        if (b.start > cursor) {
          gaps.push({ start: cursor, end: b.start < wEnd ? b.start : wEnd, prev });
        }
        if (b.end > cursor) cursor = b.end;
        prev = b;
      }
      if (cursor < wEnd) gaps.push({ start: cursor, end: wEnd, prev });

      const now = new Date();
      for (const g of gaps) {
        let s = new Date(g.start);
        if (s < now) s = new Date(now);
        // round up to next 15 min
        const mins = s.getMinutes();
        const rounded = Math.ceil(mins / 15) * 15;
        s.setMinutes(rounded, 0, 0);
        if (s.getTime() + durationMinutes * 60000 > g.end.getTime()) continue;

        const e = new Date(s.getTime() + durationMinutes * 60000);

        const originAddress =
          g.prev?.address?.trim() || tech.home_address?.trim() || null;
        const originLabel: RankedSlot["originLabel"] = g.prev?.address
          ? "previous appointment"
          : tech.home_address
            ? "home address"
            : "none";

        candidates.push({
          technician: tech,
          start: s,
          end: e,
          travelInMin: null,
          originLabel,
          originAddress,
          prevEnd: g.prev?.end ?? null,
        });
        // Only need earliest per tech to rank globally
        break;
      }

      // Stop once we have one slot for this tech today; continue only if we want more
      // Keep first available across days for this tech
      if (candidates.some((c) => c.technician.id === tech.id)) break;
    }
  }

  // Compute travel times in parallel
  await Promise.all(
    candidates.map(async (c) => {
      if (c.originAddress) {
        c.travelInMin = await getTravelTime(c.originAddress, lead);
      }
    }),
  );

  // Filter out slots where travel time doesn't fit before start
  const valid = candidates.filter((c) => {
    if (c.travelInMin == null || !c.prevEnd) return true;
    const gapMin = (c.start.getTime() - c.prevEnd.getTime()) / 60000;
    return c.travelInMin <= gapMin;
  });

  valid.sort((a, b) => a.start.getTime() - b.start.getTime());
  return valid.slice(0, limit);
}
