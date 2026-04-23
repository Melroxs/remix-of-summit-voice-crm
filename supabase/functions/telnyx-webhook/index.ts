import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const eventType = body?.data?.event_type || body?.event_type;

    console.log("[telnyx-webhook] Event:", eventType, JSON.stringify(body).slice(0, 500));

    // Verify webhook signature if secret is set
    const webhookSecret = Deno.env.get("TELNYX_WEBHOOK_SECRET");
    // Note: Full signature verification requires ed25519 - for now we log and process

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
      console.log("[telnyx-webhook] Call event:", eventType);
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
