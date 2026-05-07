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
 * Build all valid time slots on a given working day for one technician
 * where the new job (durationMinutes at leadAddress) can fit, accounting for
 * travel time from the previous location AND travel time to the next
 * appointment's location.
 */
async function buildDayValidSlots(
  tech: Technician,
  dayBusy: BusyBlock[],
  wStart: Date,
  wEnd: Date,
  leadAddress: string,
  durationMinutes: number,
): Promise<
  Array<{
    start: Date;
    end: Date;
    prevEnd: Date | null;
    prevAddress: string | null;
    travelInMin: number | null;
  }>
> {
  const out: Array<{
    start: Date;
    end: Date;
    prevEnd: Date | null;
    prevAddress: string | null;
    travelInMin: number | null;
  }> = [];

  const now = new Date();
  let prevEndTime: Date = wStart;
  let prevLocation: string | null = tech.home_address?.trim() || null;
  let prevEndRef: Date | null = null;

  const sorted = [...dayBusy].sort((a, b) => a.start.getTime() - b.start.getTime());

  // Try the gap before each existing appointment
  for (const appt of sorted) {
    const travelToNew = prevLocation
      ? await getTravelTime(prevLocation, leadAddress)
      : 0;
    const travelToNext = appt.address
      ? await getTravelTime(leadAddress, appt.address)
      : 0;

    let earliestStart = new Date(
      prevEndTime.getTime() + (travelToNew ?? 0) * 60000,
    );
    if (earliestStart < now) earliestStart = new Date(now);
    // round up to next 15 min
    const mins = earliestStart.getMinutes();
    earliestStart.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);

    const latestEnd = new Date(
      appt.start.getTime() - (travelToNext ?? 0) * 60000,
    );
    const possibleEnd = new Date(
      earliestStart.getTime() + durationMinutes * 60000,
    );

    if (
      earliestStart >= wStart &&
      possibleEnd <= latestEnd &&
      possibleEnd <= wEnd
    ) {
      out.push({
        start: earliestStart,
        end: possibleEnd,
        prevEnd: prevEndRef,
        prevAddress: prevLocation,
        travelInMin: travelToNew,
      });
    }

    prevEndTime = appt.end;
    prevLocation = appt.address?.trim() || prevLocation;
    prevEndRef = appt.end;
  }

  // Slot after the last appointment (or full day if none)
  const travelToNew = prevLocation
    ? await getTravelTime(prevLocation, leadAddress)
    : 0;
  let earliestStart = new Date(
    prevEndTime.getTime() + (travelToNew ?? 0) * 60000,
  );
  if (earliestStart < now) earliestStart = new Date(now);
  const mins = earliestStart.getMinutes();
  earliestStart.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);
  const possibleEnd = new Date(
    earliestStart.getTime() + durationMinutes * 60000,
  );
  if (earliestStart >= wStart && possibleEnd <= wEnd) {
    out.push({
      start: earliestStart,
      end: possibleEnd,
      prevEnd: prevEndRef,
      prevAddress: prevLocation,
      travelInMin: travelToNew,
    });
  }

  return out;
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

  const candidates: RankedSlot[] = [];

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

      const dayBusy = busy.filter((b) => b.end > wStart && b.start < wEnd);

      const valid = await buildDayValidSlots(
        tech,
        dayBusy,
        wStart,
        wEnd,
        lead,
        durationMinutes,
      );

      if (valid.length > 0) {
        const first = valid[0];
        candidates.push({
          technician: tech,
          start: first.start,
          end: first.end,
          travelInMin: first.travelInMin,
          originLabel: first.prevEnd
            ? "previous appointment"
            : tech.home_address
              ? "home address"
              : "none",
          originAddress: first.prevAddress,
          prevEnd: first.prevEnd,
        });
        break; // first available day for this tech
      }
    }
  }

  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
  return candidates.slice(0, limit);
}
