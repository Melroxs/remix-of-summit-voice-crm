// Returns a fresh playback/download URL for a call_recordings row.
// RLS on call_recordings is enforced via the caller's client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await caller.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const { recording_id } = await req.json();
    if (!recording_id || typeof recording_id !== "string") return json({ error: "recording_id required" }, 400);

    // RLS-guarded read
    const { data: rec, error } = await caller
      .from("call_recordings")
      .select("id, recording_url, download_url, telnyx_recording_id")
      .eq("id", recording_id)
      .maybeSingle();
    if (error || !rec) return json({ error: "Not found" }, 404);

    // Try to refresh from Telnyx if we have an id and an API key.
    const apiKey = Deno.env.get("TELNYX_API_KEY");
    if (rec.telnyx_recording_id && apiKey) {
      try {
        const r = await fetch(`https://api.telnyx.com/v2/recordings/${rec.telnyx_recording_id}`,
          { headers: { Authorization: `Bearer ${apiKey}` } });
        if (r.ok) {
          const j = await r.json();
          const fresh = j?.data?.download_urls?.mp3 || j?.data?.download_urls?.wav || j?.data?.recording_urls?.mp3;
          if (fresh) return json({ url: fresh, source: "telnyx" });
        } else {
          await r.text();
        }
      } catch (e) { console.warn("[recording-url] refresh failed", e); }
    }

    const fallback = rec.download_url || rec.recording_url;
    if (!fallback) return json({ error: "No URL available" }, 404);
    return json({ url: fallback, source: "stored" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
