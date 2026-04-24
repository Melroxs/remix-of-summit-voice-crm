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

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

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

    // Derive lead area code from contact phone (E.164: +1NPANXXXXXX)
    const leadAreaCode = extractAreaCode(contact.phone_e164);

    // Pick caller ID:
    //   1. campaign pool → healthy number whose area_code matches the lead's area code (local presence)
    //   2. fallback → least-recently-used healthy number in the campaign pool
    let selectionStrategy: "local_presence" | "rotation_fallback" | "manual_override" = "manual_override";
    let selectedCallerIdRow: { id: string; phone_e164: string; area_code: string | null } | null = null;

    if (!fromNumber) {
      const { data: pool } = await admin
        .from("campaign_caller_ids")
        .select(
          "caller_id, caller_ids!inner(id, phone_e164, area_code, is_active, health_status, last_used_at)",
        )
        .eq("campaign_id", campaignId);

      const healthy = (pool || [])
        .map((p: any) => p.caller_ids)
        .filter((c: any) => c?.is_active && c?.health_status !== "blocked");

      // 1. Local presence: same area code as the lead
      if (leadAreaCode) {
        const localMatches = healthy
          .filter((c: any) => c?.area_code === leadAreaCode)
          .sort((a: any, b: any) =>
            (a.last_used_at ?? "").localeCompare(b.last_used_at ?? ""),
          );
        if (localMatches[0]) {
          selectedCallerIdRow = localMatches[0];
          selectionStrategy = "local_presence";
        }
      }

      // 2. Fallback: least-recently-used healthy number
      if (!selectedCallerIdRow) {
        const sorted = healthy.sort((a: any, b: any) =>
          (a.last_used_at ?? "").localeCompare(b.last_used_at ?? ""),
        );
        if (sorted[0]) {
          selectedCallerIdRow = sorted[0];
          selectionStrategy = "rotation_fallback";
        }
      }

      fromNumber = selectedCallerIdRow?.phone_e164;
    }
    if (!fromNumber) return json({ error: "No caller ID available" }, 400);

    // If a manual from_number was supplied, look up the caller_ids row so we can log it
    if (!selectedCallerIdRow) {
      const { data: row } = await admin
        .from("caller_ids")
        .select("id, phone_e164, area_code")
        .eq("phone_e164", fromNumber)
        .maybeSingle();
      if (row) selectedCallerIdRow = row;
    }

    console.log("[telnyx-create-call] caller-id selection", {
      campaign_id: campaignId,
      contact_id: contactId,
      lead_area_code: leadAreaCode,
      selected_caller_id: selectedCallerIdRow?.id ?? null,
      from_number: fromNumber,
      strategy: selectionStrategy,
    });

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

    // Audit which caller ID was selected and why
    if (selectedCallerIdRow) {
      await admin.from("audit_events").insert({
        actor_id: callerId,
        actor_role: "system",
        event_type: "caller_id_selected",
        entity_type: "call_attempt",
        entity_id: attempt.id,
        metadata: {
          campaign_id: campaignId,
          contact_id: contactId,
          caller_id: selectedCallerIdRow.id,
          from_number: fromNumber,
          to_number: contact.phone_e164,
          lead_area_code: leadAreaCode,
          caller_id_area_code: selectedCallerIdRow.area_code,
          strategy: selectionStrategy,
        },
      });
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
      caller_id: selectedCallerIdRow?.id ?? null,
      caller_id_strategy: selectionStrategy,
      lead_area_code: leadAreaCode,
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

/**
 * Extract the 3-digit NANP area code from an E.164 number.
 * "+14807766403" → "480". Returns null for non-NANP or malformed input.
 */
function extractAreaCode(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  const m = phoneE164.match(/^\+1(\d{3})\d{7}$/);
  return m ? m[1] : null;
}