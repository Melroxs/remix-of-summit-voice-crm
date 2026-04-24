import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Server-side outbound origination for predictive dialing.
 * For browser power-dialing, the WebRTC client originates directly.
 *
 * Body: { campaign_id, contact_id, agent_id?, from_number? }
 * Returns: { call_attempt_id, telnyx_call_control_id, to, from }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const campaignId: string | undefined = body.campaign_id;
    const contactId: string | undefined = body.contact_id;
    const agentId: string = body.agent_id || callerId;
    let fromNumber: string | undefined = body.from_number;

    if (!campaignId || !contactId) {
      return json({ error: "campaign_id and contact_id required" }, 400);
    }

    const apiKey = Deno.env.get("TELNYX_API_KEY");
    const connectionId = Deno.env.get("TELNYX_OUTBOUND_VOICE_PROFILE_ID");
    if (!apiKey || !connectionId) return json({ error: "Telnyx not configured" }, 503);

    // Look up contact phone (E.164)
    const { data: contact } = await admin
      .from("contacts")
      .select("id, phone_e164, state")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact?.phone_e164) return json({ error: "Contact has no phone" }, 400);

    // Pick caller ID: campaign pool → least-recently-used healthy number
    if (!fromNumber) {
      const { data: pool } = await admin
        .from("campaign_caller_ids")
        .select("caller_id, caller_ids!inner(phone_e164, is_active, health_status, last_used_at)")
        .eq("campaign_id", campaignId);
      const candidates = (pool || [])
        .map((p: any) => p.caller_ids)
        .filter((c: any) => c?.is_active && c?.health_status !== "blocked")
        .sort((a: any, b: any) =>
          (a.last_used_at ?? "").localeCompare(b.last_used_at ?? ""),
        );
      fromNumber = candidates[0]?.phone_e164;
    }
    if (!fromNumber) return json({ error: "No caller ID available" }, 400);

    // Originate via Telnyx
    const webhookBase = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
    const telnyxRes = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: connectionId,
        to: contact.phone_e164,
        from: fromNumber,
        webhook_url: `${webhookBase}/functions/v1/telnyx-webhook`,
        record: "record-from-answer",
        record_format: "mp3",
      }),
    });
    const telnyxJson = await telnyxRes.json();
    if (!telnyxRes.ok) {
      console.error("[telnyx-create-call] Telnyx error:", telnyxJson);
      return json({ error: "Telnyx origination failed", details: telnyxJson }, 502);
    }
    const callControlId = telnyxJson?.data?.call_control_id;

    // Insert call_attempts row
    const { data: attempt, error: insErr } = await admin
      .from("call_attempts")
      .insert({
        agent_id: agentId,
        campaign_id: campaignId,
        contact_id: contactId,
        telnyx_call_id: callControlId,
        outbound_number_used: fromNumber,
        provider_used: "telnyx",
        dial_mode_used: "predictive",
        outcome: "pending",
        started_at: new Date().toISOString(),
        call_source: "predictive_engine",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("[telnyx-create-call] insert error:", insErr);
      return json({ error: insErr.message }, 500);
    }

    // Mark caller_id as used
    await admin
      .from("caller_ids")
      .update({ last_used_at: new Date().toISOString() })
      .eq("phone_e164", fromNumber);

    return json({
      call_attempt_id: attempt.id,
      telnyx_call_control_id: callControlId,
      to: contact.phone_e164,
      from: fromNumber,
    });
  } catch (e) {
    console.error("[telnyx-create-call] error:", e);
    return json({ error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}