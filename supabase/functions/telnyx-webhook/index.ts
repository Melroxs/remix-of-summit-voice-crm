import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ok = () =>
  new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => null);
    const eventType: string | undefined = body?.data?.event_type;
    const payload = body?.data?.payload ?? {};

    console.log("[telnyx-webhook] event:", eventType);

    if (eventType === "call.recording.saved") {
      const recordingUrl: string | null = payload?.recording_urls?.mp3 ?? null;
      const callControlId: string | null = payload?.call_control_id ?? null;
      const connectionId: string | null = payload?.connection_id ?? null;
      const callDuration: number | null =
        typeof payload?.call_duration === "number" ? payload.call_duration : null;

      const { error } = await supabase.from("call_recordings").insert({
        recording_url: recordingUrl,
        telnyx_call_control_id: callControlId,
        duration_seconds: callDuration,
        created_at: new Date().toISOString(),
      });
      if (error) console.error("[telnyx-webhook] recordings insert error:", error.message);
      // connection_id has no column on call_recordings; logging only
      console.log("[telnyx-webhook] recording connection_id:", connectionId);
    } else if (eventType === "call.hangup") {
      const callControlId: string | null = payload?.call_control_id ?? null;
      const callDuration: number | null =
        typeof payload?.call_duration === "number" ? payload.call_duration : null;
      const fromNumber: string | null = payload?.from ?? null;
      const toNumber: string | null = payload?.to ?? null;

      if (callControlId) {
        const { error } = await supabase
          .from("call_attempts")
          .update({
            duration_seconds: callDuration,
            ended_at: new Date().toISOString(),
            from_number: fromNumber,
            to_number: toNumber,
          })
          .eq("telnyx_call_control_id", callControlId);
        if (error) console.error("[telnyx-webhook] hangup update error:", error.message);
      }
    }
  } catch (err) {
    console.error("[telnyx-webhook] handler error:", err);
  }

  // Always 200 to prevent Telnyx retries / duplicates.
  return ok();
});
