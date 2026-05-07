import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, telnyx-signature-ed25519, telnyx-timestamp",
};

// Decode a base64 string to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  publicKeyB64: string,
): Promise<boolean> {
  if (!signatureB64 || !timestamp) return false;
  // Reject stale timestamps (>5 min skew) to prevent replay
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSec > 300) return false;

  try {
    const publicKeyBytes = b64ToBytes(publicKeyB64).buffer as ArrayBuffer;
    const signatureBytes = b64ToBytes(signatureB64).buffer as ArrayBuffer;
    const message = new TextEncoder().encode(`${timestamp}|${rawBody}`).buffer as ArrayBuffer;

    const key = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
  } catch (e) {
    console.error("[telnyx-webhook] Signature verification error:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read raw body once for both signature verification and JSON parsing
    const rawBody = await req.text();

    const publicKey = Deno.env.get("TELNYX_WEBHOOK_PUBLIC_KEY");
    if (!publicKey) {
      console.error("[telnyx-webhook] TELNYX_WEBHOOK_PUBLIC_KEY not configured — rejecting request");
      return new Response(JSON.stringify({ error: "Webhook verification not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("telnyx-signature-ed25519");
    const timestamp = req.headers.get("telnyx-timestamp");
    const isValid = await verifyTelnyxSignature(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      console.warn("[telnyx-webhook] Invalid or missing signature — rejecting");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const eventType = body?.data?.event_type || body?.event_type;

    console.log("[telnyx-webhook] Event:", eventType, JSON.stringify(body).slice(0, 500));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Handle different Telnyx event types
    if (eventType === "recording.saved" || eventType === "recording.completed") {
      const payload = body?.data?.payload || body?.payload || {};
      const recordingId = payload?.recording_id || payload?.id;
      const callControlId = payload?.call_control_id;
      const callLegId = payload?.call_leg_id;
      const callSessionId = payload?.call_session_id;
      const downloadUrl = payload?.download_urls?.mp3 || payload?.download_urls?.wav || payload?.recording_url;
      const duration = payload?.duration_secs || payload?.duration || null;
      const format = payload?.download_urls?.mp3 ? "mp3" : payload?.download_urls?.wav ? "wav" : "mp3";

      console.log("[telnyx-webhook] Recording saved:", {
        recordingId,
        callControlId,
        duration,
        downloadUrl: downloadUrl?.slice(0, 80),
      });

      // Try to find the call_log by telnyx_call_id
      let callLogId: string | null = null;
      if (callControlId || callLegId || callSessionId) {
        const searchIds = [callControlId, callLegId, callSessionId].filter(Boolean);
        for (const searchId of searchIds) {
          const { data: callLog } = await supabase
            .from("call_attempts")
            .select("id")
            .eq("telnyx_call_id", searchId)
            .limit(1)
            .maybeSingle();
          if (callLog) {
            callLogId = callLog.id;
            break;
          }
        }
      }

      // Insert recording
      const { data: recording, error: insertError } = await supabase
        .from("call_recordings")
        .insert({
          telnyx_recording_id: recordingId,
          call_attempt_id: callLogId,
          recording_url: downloadUrl || null,
          duration_seconds: duration ? Math.round(duration) : null,
          format,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[telnyx-webhook] Insert error:", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If we found a call_log, link the recording back
      if (callLogId && recording) {
        await supabase
          .from("call_attempts")
          .update({ call_recording_id: recording.id } as any)
          .eq("id", callLogId);
      }

      console.log("[telnyx-webhook] Recording stored:", recording?.id);
      return new Response(JSON.stringify({ ok: true, recording_id: recording?.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle call events (for future use - storing telnyx_call_id)
    if (eventType === "call.initiated" || eventType === "call.answered" || eventType === "call.hangup") {
      const payload = body?.data?.payload || body?.payload || {};
      const telnyxCallId =
        payload?.call_control_id || payload?.call_leg_id || payload?.call_session_id;

      // Map Telnyx event_type -> internal call_event_type enum
      const eventMap: Record<string, string> = {
        "call.initiated": "initiated",
        "call.answered": "answered",
        "call.hangup": payload?.hangup_source === "callee" ? "hangup_remote" : "hangup_local",
      };
      const internalEvent = eventMap[eventType];

      if (telnyxCallId && internalEvent) {
        const { data, error } = await supabase.rpc("record_call_event", {
          _telnyx_call_id: telnyxCallId,
          _event_type: internalEvent,
          _payload: payload,
        });
        if (error) {
          console.error("[telnyx-webhook] record_call_event error:", error);
        } else {
          console.log("[telnyx-webhook] Recorded", internalEvent, "for call_attempt", data);
        }
      } else {
        console.warn("[telnyx-webhook] Missing telnyx call id or unmapped event:", eventType);
      }

      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Acknowledge unknown events
    return new Response(JSON.stringify({ ok: true, skipped: eventType }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[telnyx-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
