import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Predictive dialer tick. Run on a schedule (e.g. cron every 5s) per active campaign.
 *
 * Logic:
 *   available_agents      = agents on this campaign with status='available'
 *   active_outbound_calls = call_attempts (campaign) with outcome='pending' and ended_at IS NULL
 *   target_active_calls   = ceil(available_agents * pacing_ratio)
 *   calls_to_place        = target_active_calls - active_outbound_calls
 *
 * Adaptive pacing:
 *   abandon_rate > 0.03  → pacing_ratio -= 0.25  (min 1.0)
 *   abandon_rate < 0.01 AND connect_rate < 0.20  → pacing_ratio += 0.10  (max 3.0)
 *
 * Body: { campaign_id }
 * Returns: { placed, target, available_agents, active_calls, pacing_ratio }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const campaignId: string | undefined = body.campaign_id;
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    // Load campaign
    const { data: campaign, error: cErr } = await admin
      .from("campaigns")
      .select("id, dial_mode, status, max_concurrent_agents")
      .eq("id", campaignId)
      .maybeSingle();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);
    if (campaign.status !== "active" || campaign.dial_mode !== "predictive") {
      return json({ skipped: "Campaign not active/predictive" });
    }

    // Pacing ratio is stored on the campaign record extension (use a soft default).
    // We cap by max_concurrent_agents to avoid runaway dialing.
    const pacingRatio = clamp(Number((campaign as any).pacing_ratio ?? 1.5), 1.0, 3.0);

    // Available agents on this campaign
    const { data: agents } = await admin
      .from("campaign_agents")
      .select("user_id, profiles!inner(agent_status)")
      .eq("campaign_id", campaignId);
    const availableAgents = (agents || []).filter(
      (a: any) => ["available", "ready"].includes(a.profiles?.agent_status),
    ).length;

    // Active outbound calls
    const { count: activeCalls } = await admin
      .from("call_attempts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("outcome", "pending")
      .is("ended_at", null);

    const target = Math.ceil(availableAgents * pacingRatio);
    const callsToPlace = Math.max(0, target - (activeCalls ?? 0));

    // Adaptive pacing — sample the last hour
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("call_attempts")
      .select("outcome, agent_id")
      .eq("campaign_id", campaignId)
      .gte("created_at", since);
    const total = recent?.length ?? 0;
    const answered = (recent || []).filter((r: any) =>
      ["connected", "appointment_booked", "callback_scheduled", "not_interested"].includes(r.outcome),
    ).length;
    const abandoned = (recent || []).filter(
      (r: any) => r.outcome === "failed" && !r.agent_id,
    ).length;
    const connectRate = total > 0 ? answered / total : 0;
    const abandonRate = answered > 0 ? abandoned / answered : 0;

    let nextPacing = pacingRatio;
    if (abandonRate > 0.03) nextPacing = clamp(pacingRatio - 0.25, 1.0, 3.0);
    else if (abandonRate < 0.01 && connectRate < 0.2) nextPacing = clamp(pacingRatio + 0.1, 1.0, 3.0);

    if (nextPacing !== pacingRatio) {
      await admin
        .from("campaigns")
        .update({ pacing_ratio: nextPacing } as any)
        .eq("id", campaignId);
    }

    if (availableAgents === 0 || callsToPlace === 0) {
      return json({
        placed: 0,
        target,
        available_agents: availableAgents,
        active_calls: activeCalls ?? 0,
        pacing_ratio: nextPacing,
      });
    }

    // Place calls. Pull a lead for each available agent in turn.
    const eligibleAgents = (agents || [])
      .filter((a: any) => ["available", "ready"].includes(a.profiles?.agent_status))
      .map((a: any) => a.user_id as string);

    let placed = 0;
    for (let i = 0; i < callsToPlace && i < eligibleAgents.length; i++) {
      const agentId = eligibleAgents[i];
      const { data: lead, error: leadErr } = await admin.rpc("get_next_lead_for_agent", {
        _agent_id: agentId,
        _campaign_id: campaignId,
      });
      if (leadErr || !lead || (Array.isArray(lead) && lead.length === 0)) continue;
      const contact = Array.isArray(lead) ? lead[0] : lead;

      // Fire telnyx-create-call internally
      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/telnyx-create-call`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            campaign_id: campaignId,
            contact_id: contact.contact_id,
            agent_id: agentId,
          }),
        },
      );
      if (res.ok) placed++;
      else console.warn("[predictive] origination failed:", await res.text());
    }

    return json({
      placed,
      target,
      available_agents: availableAgents,
      active_calls: activeCalls ?? 0,
      pacing_ratio: nextPacing,
      connect_rate: connectRate,
      abandon_rate: abandonRate,
    });
  } catch (e) {
    console.error("[predictive-dialer-engine] error:", e);
    return json({ error: String(e) }, 500);
  }
});

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}