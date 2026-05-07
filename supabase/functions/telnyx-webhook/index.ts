// Telnyx webhook: signature-verified, idempotent recording + call event sync.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyTelnyxSignature(rawBody: string, sigB64: string | null, ts: string | null, pubKeyB64: string) {
  if (!sigB64 || !ts) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      b64ToBytes(pubKeyB64).buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      b64ToBytes(sigB64).buffer as ArrayBuffer,
      new TextEncoder().encode(`${ts}|${rawBody}`).buffer as ArrayBuffer,
    );
  } catch (e) {
    console.error("[webhook] sig verify error:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ok = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const raw = await req.text();
  const pub = Deno.env.get("TELNYX_WEBHOOK_PUBLIC_KEY") ?? Deno.env.get("TELNYX_WEBHOOK_SECRET");
  if (!pub) return ok({ error: "Webhook key not configured" }, 503);

  const valid = await verifyTelnyxSignature(
    raw,
    req.headers.get("telnyx-signature-ed25519"),
    req.headers.get("telnyx-timestamp"),
    pub,
  );
  if (!valid) return ok({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = JSON.parse(raw); } catch { return ok({ error: "Bad JSON" }, 400); }

  const eventType: string = body?.data?.event_type || body?.event_type || "";
  const payload = body?.data?.payload || body?.payload || {};
  console.log("[webhook]", eventType, JSON.stringify(payload).slice(0, 300));

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------- Recording events ----------
  if (eventType === "call.recording.saved" || eventType === "recording.saved" || eventType === "recording.completed") {
    const recordingId: string | undefined = payload?.recording_id || payload?.id;
    const callControlId: string | undefined = payload?.call_control_id;
    const callLegId: string | undefined = payload?.call_leg_id;
    const callSessionId: string | undefined = payload?.call_session_id;
    const url = payload?.recording_urls?.mp3 || payload?.download_urls?.mp3 || payload?.recording_urls?.wav || payload?.download_urls?.wav || payload?.recording_url || null;
    const duration = payload?.duration_secs || payload?.duration_millis ? Math.round((payload?.duration_millis ?? 0) / 1000) : payload?.duration_secs || null;
    const format = (payload?.recording_urls?.mp3 || payload?.download_urls?.mp3) ? "mp3" : "wav";

    // Find linked call_attempt by any of the Telnyx ids
    let callAttemptId: string | null = null;
    const candidateIds = [callControlId, callLegId, callSessionId].filter(Boolean) as string[];
    for (const id of candidateIds) {
      const { data: row } = await sb
        .from("call_attempts")
        .select("id")
        .or(`telnyx_call_id.eq.${id},telnyx_call_control_id.eq.${id},telnyx_call_session_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (row?.id) { callAttemptId = row.id; break; }
    }

    // Idempotent upsert
    const { data: existing } = await sb
      .from("call_recordings")
      .select("id")
      .eq("telnyx_recording_id", recordingId!)
      .maybeSingle();

    if (existing?.id) {
      await sb.from("call_recordings").update({
        recording_url: url, download_url: url, duration_seconds: duration ?? null,
        format, status: "available", available_at: new Date().toISOString(),
        call_attempt_id: callAttemptId ?? undefined,
      } as any).eq("id", existing.id);
      return ok({ ok: true, recording_id: existing.id });
    }

    const { data: rec, error } = await sb.from("call_recordings").insert({
      telnyx_recording_id: recordingId,
      call_attempt_id: callAttemptId,
      recording_url: url,
      download_url: url,
      duration_seconds: duration ?? null,
      format,
      status: "available",
      available_at: new Date().toISOString(),
    } as any).select("id").single();

    if (error) { console.error("[webhook] insert recording err:", error); return ok({ error: error.message }, 500); }
    if (callAttemptId && rec?.id) {
      await sb.from("call_attempts").update({ call_recording_id: rec.id, recording_url: url } as any).eq("id", callAttemptId);
    }
    return ok({ ok: true, recording_id: rec?.id });
  }

  // ---------- Call lifecycle events ----------
  if (eventType.startsWith("call.")) {
    const ccId = payload?.call_control_id;
    if (ccId) {
      // Update call_attempts mirror columns when we can match
      const updates: Record<string, any> = {};
      if (eventType === "call.initiated") updates.call_status = "initiated";
      if (eventType === "call.answered") { updates.call_status = "answered"; updates.answered_at = new Date().toISOString(); }
      if (eventType === "call.hangup") {
        updates.call_status = "completed";
        updates.ended_at = new Date().toISOString();
      }
      if (Object.keys(updates).length) {
        await sb.from("call_attempts").update(updates).eq("telnyx_call_control_id", ccId);
      }
    }
    return ok({ ok: true });
  }

  return ok({ ok: true, ignored: eventType });
});
