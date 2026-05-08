import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode as decodeBase64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";

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

// Verify Telnyx ed25519 webhook signature.
// TELNYX_WEBHOOK_SECRET must contain the base64-encoded ed25519 public key
// from the Telnyx portal (Mission Control → Auth → Public Key).
async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  publicKeyB64: string | null,
): Promise<boolean> {
  if (!signatureB64 || !timestamp || !publicKeyB64) return false;
  // Reject events older than 5 minutes to limit replay attacks.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  try {
    const pubKeyBytes = decodeBase64(publicKeyB64);
    const sigBytes = decodeBase64(signatureB64);
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    const key = await crypto.subtle.importKey(
      "raw",
      pubKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("Ed25519", key, sigBytes, signedPayload);
  } catch (e) {
    console.error("[telnyx-webhook] signature verify error:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read raw body once so we can both verify the signature and parse JSON.
    const rawBody = await req.text();
    const signature = req.headers.get("telnyx-signature-ed25519");
    const timestamp = req.headers.get("telnyx-timestamp");
    const publicKey = Deno.env.get("TELNYX_WEBHOOK_SECRET") ?? null;

    const isValid = await verifyTelnyxSignature(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      console.warn("[telnyx-webhook] rejected unsigned/invalid request");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { body = null; }
    const eventType: string | undefined = body?.data?.event_type;
    const payload = body?.data?.payload ?? {};

    console.log("[telnyx-webhook] event:", eventType);

    // Log every webhook hit so the UI test panel can confirm Telnyx is reaching us.
    let logStatus = "received";
    let logError: string | null = null;

    if (eventType === "call.recording.saved") {
      const recordingUrl: string | null = payload?.recording_urls?.mp3 ?? null;
      const callControlId: string | null = payload?.call_control_id ?? null;
      const connectionId: string | null = payload?.connection_id ?? null;
      const callDuration: number | null =
        typeof payload?.call_duration === "number" ? payload.call_duration : null;

      const { error } = await supabase.from("call_recordings").insert({
        recording_url: recordingUrl,
        telnyx_call_control_id: callControlId,
        connection_id: connectionId,
        duration_seconds: callDuration,
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.error("[telnyx-webhook] recordings insert error:", error.message);
        logStatus = "error";
        logError = error.message;
      } else {
        logStatus = "processed";
      }
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
        if (error) {
          console.error("[telnyx-webhook] hangup update error:", error.message);
          logStatus = "error";
          logError = error.message;
        } else {
          logStatus = "processed";
        }
      }
    } else {
      logStatus = "ignored";
    }

    await supabase.from("webhook_events").insert({
      source: "telnyx",
      event_type: eventType ?? null,
      status: logStatus,
      payload: body ?? {},
      error: logError,
    }).then(({ error }) => {
      if (error) console.error("[telnyx-webhook] webhook_events insert error:", error.message);
    });
  } catch (err) {
    console.error("[telnyx-webhook] handler error:", err);
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("webhook_events").insert({
        source: "telnyx",
        status: "error",
        payload: {},
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (_) { /* swallow */ }
  }

  // Always 200 to prevent Telnyx retries / duplicates.
  return ok();
});
