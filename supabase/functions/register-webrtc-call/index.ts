import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Register a browser-originated (WebRTC) outbound call attempt.
 * The browser places the call directly via @telnyx/webrtc; we log a row in
 * call_attempts so the webhook (recording.saved, call.hangup) can match it.
 *
 * Body: { campaign_id, contact_id, telnyx_call_id, telnyx_session_id?, from_number, to_number }
 * Returns: { call_attempt_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);
    const agentId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      campaign_id,
      contact_id,
      telnyx_call_id,
      telnyx_session_id,
      from_number,
      to_number,
      assignment_id,
    } = body || {};

    if (!contact_id || !telnyx_call_id || !to_number) {
      return json({ error: "contact_id, telnyx_call_id, to_number required" }, 400);
    }

    const { data: attempt, error } = await admin
      .from("call_attempts")
      .insert({
        agent_id: agentId,
        campaign_id: campaign_id ?? null,
        contact_id,
        telnyx_call_id,
        telnyx_call_control_id: telnyx_call_id,
        telnyx_call_session_id: telnyx_session_id ?? null,
        from_number: from_number ?? null,
        to_number,
        outbound_number_used: from_number ?? null,
        provider_used: "telnyx",
        dial_mode_used: "manual_webrtc",
        outcome: "pending",
        call_status: "initiated",
        call_source: "queue",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[register-webrtc-call] insert error", error);
      return json({ error: error.message }, 500);
    }

    if (assignment_id) {
      await admin
        .from("daily_lead_assignments")
        .update({ call_attempt_id: attempt.id, status: "calling", locked_at: new Date().toISOString(), locked_by: agentId })
        .eq("id", assignment_id);
    }

    return json({ call_attempt_id: attempt.id });
  } catch (e) {
    console.error("[register-webrtc-call] error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}