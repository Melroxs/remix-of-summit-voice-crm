import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Lead {
  address: string;
  requiredSkill?: string | null;
  companyId?: string | null;
}

interface Tech {
  id: string;
  company_id: string;
  name: string;
  home_address: string | null;
  skills: string[];
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  is_active: boolean;
}

interface Busy {
  technician_id: string;
  start: Date;
  end: Date;
  address: string | null;
}

const geoCache = new Map<string, { lat: number; lon: number } | null>();
const routeCache = new Map<string, number | null>();

async function geocode(addr: string) {
  const k = addr.trim().toLowerCase();
  if (!k) return null;
  if (geoCache.has(k)) return geoCache.get(k)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
      { headers: { Accept: "application/json", "User-Agent": "summit-leads-scheduler" } },
    );
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const hit = Array.isArray(d) && d[0]
      ? { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) }
      : null;
    geoCache.set(k, hit);
    return hit;
  } catch {
    geoCache.set(k, null);
    return null;
  }
}

async function getTravelTime(from: string | null, to: string): Promise<number | null> {
  if (!from?.trim() || !to?.trim()) return null;
  const k = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;
  if (routeCache.has(k)) return routeCache.get(k)!;
  const [a, b] = await Promise.all([geocode(from), geocode(to)]);
  if (!a || !b) {
    routeCache.set(k, null);
    return null;
  }
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    );
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const sec = d?.routes?.[0]?.duration;
    if (typeof sec !== "number") return null;
    const m = Math.round(sec / 60);
    routeCache.set(k, m);
    return m;
  } catch {
    return null;
  }
}

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h || 0, m || 0];
}

async function buildAvailableSlots(
  tech: Tech,
  appts: Busy[],
  leadAddress: string,
  durationMinutes: number,
  daysAhead: number,
): Promise<Array<{ start: Date; end: Date; travelInMin: number | null; prevAddress: string | null }>> {
  const slots: Array<{ start: Date; end: Date; travelInMin: number | null; prevAddress: string | null }> = [];
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedAll = [...appts].sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(today);
    day.setDate(day.getDate() + d);
    if (!tech.working_days.includes(day.getDay())) continue;

    const [sh, sm] = parseHM(tech.working_hours_start);
    const [eh, em] = parseHM(tech.working_hours_end);
    const wStart = new Date(day);
    wStart.setHours(sh, sm, 0, 0);
    const wEnd = new Date(day);
    wEnd.setHours(eh, em, 0, 0);

    const dayAppts = sortedAll.filter((a) => a.end > wStart && a.start < wEnd);

    let prevEnd = wStart;
    let prevLoc: string | null = tech.home_address?.trim() || null;

    for (const appt of dayAppts) {
      const travelToNew = await getTravelTime(prevLoc, leadAddress);
      const travelToNext = appt.address ? await getTravelTime(leadAddress, appt.address) : 0;
      let earliestStart = new Date(prevEnd.getTime() + (travelToNew ?? 0) * 60000);
      if (earliestStart < now) earliestStart = new Date(now);
      earliestStart.setMinutes(Math.ceil(earliestStart.getMinutes() / 15) * 15, 0, 0);
      const latestEnd = new Date(appt.start.getTime() - (travelToNext ?? 0) * 60000);
      const possibleEnd = new Date(earliestStart.getTime() + durationMinutes * 60000);
      if (earliestStart >= wStart && possibleEnd <= latestEnd && possibleEnd <= wEnd) {
        slots.push({ start: earliestStart, end: possibleEnd, travelInMin: travelToNew, prevAddress: prevLoc });
      }
      prevEnd = appt.end;
      prevLoc = appt.address?.trim() || prevLoc;
    }

    const travelToNew = await getTravelTime(prevLoc, leadAddress);
    let earliestStart = new Date(prevEnd.getTime() + (travelToNew ?? 0) * 60000);
    if (earliestStart < now) earliestStart = new Date(now);
    earliestStart.setMinutes(Math.ceil(earliestStart.getMinutes() / 15) * 15, 0, 0);
    const possibleEnd = new Date(earliestStart.getTime() + durationMinutes * 60000);
    if (earliestStart >= wStart && possibleEnd <= wEnd) {
      slots.push({ start: earliestStart, end: possibleEnd, travelInMin: travelToNew, prevAddress: prevLoc });
    }
  }

  return slots;
}

async function findBestTechnician(
  technicians: Tech[],
  appointments: Busy[],
  lead: Lead,
  durationMinutes: number,
  daysAhead: number,
) {
  let best: { technician: Tech; start: Date; end: Date; travelInMin: number | null; prevAddress: string | null } | null = null;

  for (const tech of technicians) {
    if (!tech.is_active) continue;
    if (lead.requiredSkill && !tech.skills.includes(lead.requiredSkill)) continue;
    const techAppts = appointments.filter((a) => a.technician_id === tech.id);
    const slots = await buildAvailableSlots(tech, techAppts, lead.address, durationMinutes, daysAhead);
    if (slots.length === 0) continue;
    const earliest = slots[0];
    if (!best || earliest.start < best.start) {
      best = { technician: tech, ...earliest };
    }
  }

  return best;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role check: only internal staff may invoke the scheduler
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const allowed = new Set(["admin", "manager", "team_leader", "agent"]);
    if (!(roles ?? []).some((r: { role: string }) => allowed.has(r.role))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lead = body.lead as Lead | undefined;
    const duration = Number(body.duration);
    const daysAhead = Math.min(Math.max(Number(body.daysAhead) || 7, 1), 30);

    if (!lead?.address || !duration || duration <= 0) {
      return new Response(JSON.stringify({ error: "lead.address and duration required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate address length and characters before forwarding to external APIs
    if (typeof lead.address !== "string" || lead.address.length > 300 ||
        !/^[\w\s,.'#\-/()]+$/.test(lead.address)) {
      return new Response(JSON.stringify({ error: "Invalid address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: techs, error: tErr } = await supabase
      .from("technicians")
      .select("id, company_id, name, home_address, skills, working_hours_start, working_hours_end, working_days, is_active")
      .eq("is_active", true);
    if (tErr) throw tErr;

    const techIds = (techs ?? []).map((t) => t.id);
    if (techIds.length === 0) {
      return new Response(JSON.stringify({ message: "No available slots" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + daysAhead);

    const { data: apptRows, error: aErr } = await supabase
      .from("technician_appointments")
      .select("technician_id, lead_address, start_time, end_time, status")
      .in("technician_id", techIds)
      .gte("start_time", rangeStart.toISOString())
      .lt("start_time", rangeEnd.toISOString())
      .not("status", "in", "(cancelled,no_show)");
    if (aErr) throw aErr;

    const appointments: Busy[] = (apptRows ?? []).map((r) => ({
      technician_id: r.technician_id as string,
      start: new Date(r.start_time as string),
      end: new Date(r.end_time as string),
      address: (r.lead_address as string | null) ?? null,
    }));

    const result = await findBestTechnician(techs as Tech[], appointments, lead, duration, daysAhead);

    if (!result) {
      return new Response(JSON.stringify({ message: "No available slots" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        technician: {
          id: result.technician.id,
          name: result.technician.name,
          home_address: result.technician.home_address,
          skills: result.technician.skills,
        },
        slot: {
          start: result.start.toISOString(),
          end: result.end.toISOString(),
        },
        travelInMin: result.travelInMin,
        originAddress: result.prevAddress,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});