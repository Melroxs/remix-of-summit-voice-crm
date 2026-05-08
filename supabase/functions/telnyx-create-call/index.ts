import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(token);
    if (claimErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const agentId = claims.claims.sub as string;

    // --- Body ---
    const body = await req.json().catch(() => null);
    const destinationNumber = body?.destinationNumber;
    const callerNumber = body?.callerNumber;
    const campaignId = body?.campaignId ?? null;
    const contactId = body?.contactId ?? null;

    if (!destinationNumber || !callerNumber) {
      return json({ error: "destinationNumber and callerNumber are required" }, 400);
    }

    // --- Telnyx ---
    const apiKey = Deno.env.get("TELNYX_API_KEY");
    const connectionId = Deno.env.get("TELNYX_CONNECTION_ID");
    if (!apiKey || !connectionId) {
      return json({ error: "Telnyx is not configured" }, 500);
    }

    const telnyxRes = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: connectionId,
        to: destinationNumber,
        from: callerNumber,
        record_audio: true,
      }),
    });

    const telnyxData = await telnyxRes.json().catch(() => ({}));
    if (!telnyxRes.ok) {
      console.error("[telnyx-create-call] Telnyx error:", telnyxRes.status, telnyxData);
      return json({ error: "Telnyx API error", details: telnyxData }, telnyxRes.status);
    }

    const callControlId: string | null = telnyxData?.data?.call_control_id ?? null;

    // --- Log call attempt (service role to bypass RLS quirks) ---
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: insertErr } = await admin.from("call_attempts").insert({
      agent_id: agentId,
      contact_id: contactId,
      campaign_id: campaignId,
      telnyx_call_control_id: callControlId,
      from_number: callerNumber,
      to_number: destinationNumber,
      started_at: new Date().toISOString(),
      provider_used: "telnyx",
    });
    if (insertErr) {
      console.error("[telnyx-create-call] call_attempts insert error:", insertErr.message);
    }

    return json(telnyxData, 200);
  } catch (err) {
    console.error("[telnyx-create-call] handler error:", err);
    return json({ error: (err as Error)?.message || "Internal error" }, 500);
  }
});
