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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recording_id } = await req.json();
    if (!recording_id || typeof recording_id !== "string") {
      return new Response(JSON.stringify({ error: "recording_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the caller's client to respect RLS - only returns if user has access
    const { data: recording, error } = await callerClient
      .from("call_recordings")
      .select("recording_url, telnyx_recording_id")
      .eq("id", recording_id)
      .maybeSingle();

    if (error || !recording) {
      return new Response(JSON.stringify({ error: "Recording not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If we have a telnyx_recording_id, try to get a fresh URL from Telnyx API
    const telnyxApiKey = Deno.env.get("TELNYX_API_KEY");
    if (recording.telnyx_recording_id && telnyxApiKey) {
      try {
        const resp = await fetch(
          `https://api.telnyx.com/v2/recordings/${recording.telnyx_recording_id}`,
          { headers: { Authorization: `Bearer ${telnyxApiKey}` } }
        );
        if (resp.ok) {
          const data = await resp.json();
          const url = data?.data?.download_urls?.mp3 || data?.data?.download_urls?.wav;
          if (url) {
            return new Response(JSON.stringify({ url }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (e) {
        console.error("[get-recording-url] Telnyx API error:", e);
      }
    }

    // Fallback to stored URL if Telnyx API unavailable
    if (recording.recording_url) {
      return new Response(JSON.stringify({ url: recording.recording_url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "No recording URL available" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-recording-url] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
