import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify caller
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResponse({ error: "Invalid token" }, 401);

    // Verify caller has admin or team_leader role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "team_leader"]);

    if (!roles || roles.length === 0) {
      return jsonResponse({ error: "Forbidden: admin or team_leader only" }, 403);
    }

    const body = await req.json();
    const { action, call_log_id, mode, session_id } = body;

    if (!action) return jsonResponse({ error: "action is required" }, 400);

    // ─── START MONITORING ─────────────────────────────────
    if (action === "start") {
      if (!call_log_id || !mode) {
        return jsonResponse({ error: "call_log_id and mode are required" }, 400);
      }
      if (!["listen", "whisper", "barge"].includes(mode)) {
        return jsonResponse({ error: "mode must be listen, whisper, or barge" }, 400);
      }

      // Get the call log with provider info
      const { data: callLog, error: clErr } = await supabaseAdmin
        .from("call_logs")
        .select("id, agent_id, contact_id, campaign_id, telnyx_call_id, provider_used, outbound_number_used, ended_at")
        .eq("id", call_log_id)
        .single();

      if (clErr || !callLog) return jsonResponse({ error: "Call not found" }, 404);
      if (callLog.ended_at) return jsonResponse({ error: "Call has already ended" }, 400);
      if (!callLog.telnyx_call_id) {
        return jsonResponse({ error: "No active telephony session for this call" }, 400);
      }

      // Get the campaign's telephony provider
      const provider_type = callLog.provider_used || "telnyx";

      // Check for existing active monitoring on this call by this supervisor
      const { data: existing } = await supabaseAdmin
        .from("call_monitoring_sessions")
        .select("id")
        .eq("call_log_id", call_log_id)
        .eq("supervisor_id", caller.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        return jsonResponse({ error: "You are already monitoring this call. End existing session first." }, 400);
      }

      let providerResult: { success: boolean; conference_id?: string; supervisor_call_id?: string; error?: string };

      if (provider_type === "telnyx") {
        providerResult = await startTelnyxMonitoring(callLog.telnyx_call_id, mode, callLog.agent_id);
      } else if (provider_type === "twilio") {
        providerResult = await startTwilioMonitoring(callLog, mode);
      } else {
        return jsonResponse({ error: `Unsupported provider: ${provider_type}` }, 400);
      }

      // Create monitoring session record
      const sessionData: Record<string, unknown> = {
        call_log_id,
        supervisor_id: caller.id,
        agent_id: callLog.agent_id,
        campaign_id: callLog.campaign_id,
        provider_type,
        monitoring_mode: mode,
        status: providerResult.success ? "active" : "failed",
        provider_conference_id: providerResult.conference_id || null,
        provider_call_id: providerResult.supervisor_call_id || null,
        failure_reason: providerResult.error || null,
      };

      const { data: session, error: insErr } = await supabaseAdmin
        .from("call_monitoring_sessions")
        .insert(sessionData)
        .select("id")
        .single();

      if (insErr) {
        console.error("[call-monitor] Insert error:", insErr);
        return jsonResponse({ error: "Failed to record monitoring session" }, 500);
      }

      // Audit log
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: `monitor_${mode}_start`,
        target_user_id: callLog.agent_id,
        details: { call_log_id, provider_type, session_id: session.id, success: providerResult.success },
      });

      if (!providerResult.success) {
        return jsonResponse({
          error: providerResult.error || "Failed to start monitoring",
          session_id: session.id,
          status: "failed",
        }, 422);
      }

      return jsonResponse({
        ok: true,
        session_id: session.id,
        mode,
        provider_type,
        conference_id: providerResult.conference_id,
      });
    }

    // ─── SWITCH MODE ──────────────────────────────────────
    if (action === "switch") {
      if (!session_id || !mode) {
        return jsonResponse({ error: "session_id and mode are required" }, 400);
      }

      const { data: session } = await supabaseAdmin
        .from("call_monitoring_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("supervisor_id", caller.id)
        .eq("status", "active")
        .single();

      if (!session) return jsonResponse({ error: "Active session not found" }, 404);

      let switchResult: { success: boolean; error?: string };

      if (session.provider_type === "telnyx" && session.provider_call_id) {
        switchResult = await switchTelnyxRole(session.provider_call_id, mode);
      } else {
        switchResult = { success: false, error: "Switch not supported for this provider/session" };
      }

      if (switchResult.success) {
        await supabaseAdmin
          .from("call_monitoring_sessions")
          .update({ monitoring_mode: mode })
          .eq("id", session_id);
      }

      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: `monitor_switch_to_${mode}`,
        target_user_id: session.agent_id,
        details: { session_id, success: switchResult.success },
      });

      if (!switchResult.success) {
        return jsonResponse({ error: switchResult.error }, 422);
      }

      return jsonResponse({ ok: true, mode });
    }

    // ─── END MONITORING ───────────────────────────────────
    if (action === "end") {
      if (!session_id) return jsonResponse({ error: "session_id is required" }, 400);

      const { data: session } = await supabaseAdmin
        .from("call_monitoring_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("supervisor_id", caller.id)
        .eq("status", "active")
        .single();

      if (!session) return jsonResponse({ error: "Active session not found" }, 404);

      // Hang up the supervisor leg
      if (session.provider_type === "telnyx" && session.provider_call_id) {
        await hangupTelnyxLeg(session.provider_call_id);
      }

      await supabaseAdmin
        .from("call_monitoring_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", session_id);

      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: "monitor_end",
        target_user_id: session.agent_id,
        details: { session_id, mode: session.monitoring_mode },
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[call-monitor] Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// TELNYX IMPLEMENTATION
// Uses Conference API with supervisor_role for listen/whisper/barge
// ═══════════════════════════════════════════════════════════

async function startTelnyxMonitoring(
  agentCallControlId: string,
  mode: string,
  agentUserId: string
): Promise<{ success: boolean; conference_id?: string; supervisor_call_id?: string; error?: string }> {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) return { success: false, error: "TELNYX_API_KEY not configured" };

  const voiceProfileId = Deno.env.get("TELNYX_OUTBOUND_VOICE_PROFILE_ID");

  try {
    // Step 1: Create a conference from the agent's active call
    // This bridges the agent's existing call into a conference
    const confName = `monitor_${agentCallControlId}_${Date.now()}`;
    
    const createConfRes = await fetch("https://api.telnyx.com/v2/conferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: confName,
        call_control_id: agentCallControlId,
        beep_enabled: "never",
      }),
    });

    const confBody = await createConfRes.json();
    
    if (!createConfRes.ok) {
      console.error("[call-monitor] Create conference failed:", JSON.stringify(confBody));
      return {
        success: false,
        error: `Failed to create conference: ${confBody?.errors?.[0]?.detail || confBody?.errors?.[0]?.title || "Unknown error"}`,
      };
    }

    const conferenceId = confBody?.data?.id;
    if (!conferenceId) {
      return { success: false, error: "Conference created but no ID returned" };
    }

    // Step 2: Dial the supervisor into the conference with the appropriate role
    // Map mode to Telnyx supervisor_role
    const supervisorRole = mode === "listen" ? "monitor" : mode === "whisper" ? "whisper" : "barge";

    // We need a number or SIP to connect the supervisor.
    // For WebRTC supervisors, we use a SIP connection to the supervisor's WebRTC client.
    // Since the supervisor is using the browser, we create a call to a SIP endpoint
    // that the supervisor's WebRTC client will answer.
    const telnyxLogin = Deno.env.get("VITE_TELNYX_LOGIN");
    
    if (!telnyxLogin) {
      return { success: false, error: "VITE_TELNYX_LOGIN not configured for supervisor WebRTC" };
    }

    // Dial the supervisor via SIP to their WebRTC credential
    const dialRes = await fetch(`https://api.telnyx.com/v2/conferences/${conferenceId}/actions/join`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        call_control_id: agentCallControlId,
        supervisor_role: supervisorRole,
        mute: supervisorRole === "monitor",
        // For whisper mode, specify which call_control_ids can hear the supervisor
        ...(supervisorRole === "whisper" ? {
          whisper_call_control_ids: [agentCallControlId],
        } : {}),
      }),
    });

    const dialBody = await dialRes.json();
    
    if (!dialRes.ok) {
      console.error("[call-monitor] Join conference failed:", JSON.stringify(dialBody));
      return {
        success: false,
        conference_id: conferenceId,
        error: `Failed to join conference: ${dialBody?.errors?.[0]?.detail || dialBody?.errors?.[0]?.title || "Unknown error"}`,
      };
    }

    // The supervisor call_control_id for future reference
    const supervisorCallId = dialBody?.data?.call_control_id || null;

    return {
      success: true,
      conference_id: conferenceId,
      supervisor_call_id: supervisorCallId,
    };
  } catch (err) {
    console.error("[call-monitor] Telnyx error:", err);
    return { success: false, error: `Telnyx API error: ${(err as Error).message}` };
  }
}

async function switchTelnyxRole(
  supervisorCallControlId: string,
  newMode: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) return { success: false, error: "TELNYX_API_KEY not configured" };

  const role = newMode === "listen" ? "monitor" : newMode === "whisper" ? "whisper" : "barge";

  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/calls/${supervisorCallControlId}/actions/switch_supervisor_role`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      }
    );

    const body = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: `Switch role failed: ${body?.errors?.[0]?.detail || body?.errors?.[0]?.title || "Unknown"}`,
      };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `Telnyx API error: ${(err as Error).message}` };
  }
}

async function hangupTelnyxLeg(callControlId: string) {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) return;

  try {
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.error("[call-monitor] Hangup error:", err);
  }
}

// ═══════════════════════════════════════════════════════════
// TWILIO IMPLEMENTATION
// Uses Twilio Conference API with coach/listen participant roles
// ═══════════════════════════════════════════════════════════

async function startTwilioMonitoring(
  callLog: Record<string, unknown>,
  mode: string
): Promise<{ success: boolean; conference_id?: string; supervisor_call_id?: string; error?: string }> {
  // Twilio monitoring requires:
  // 1. The active call to be in a Conference
  // 2. Adding a supervisor participant with appropriate settings
  // Since Twilio monitoring requires a TwiML app and additional infrastructure,
  // we return a clear error with what's needed

  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioAccountSid || !twilioAuthToken) {
    return {
      success: false,
      error: "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    };
  }

  // For Twilio, calls need to be routed through Conferences from the start
  // to support monitoring. If the call wasn't started as a conference,
  // monitoring isn't possible mid-call.
  return {
    success: false,
    error: "Twilio live monitoring requires calls to be routed through Twilio Conferences from call initiation. Please configure your Twilio TwiML app to use Conference-based routing for monitoring support.",
  };
}
