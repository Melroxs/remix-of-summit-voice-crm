import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require authenticated caller — these are live Telnyx WebRTC credentials.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;

    // Restrict to roles that actually place calls.
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = new Set(["agent", "admin", "team_leader", "manager"]);
    const hasAccess = (roles ?? []).some((r: { role: string }) => allowed.has(r.role));
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Try per-agent Telnyx credential (preferred)
    const { data: cred } = await adminClient
      .from("agent_telephony_credentials")
      .select("telnyx_credential_id, telnyx_sip_username")
      .eq("agent_id", userId)
      .eq("active", true)
      .maybeSingle();

    const apiKey = Deno.env.get("TELNYX_API_KEY");
    if (cred?.telnyx_credential_id && apiKey) {
      const tokRes = await fetch(
        `https://api.telnyx.com/v2/telephony_credentials/${cred.telnyx_credential_id}/token`,
        { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (tokRes.ok) {
        const tokJson = await tokRes.json();
        const login_token = tokJson?.token ?? tokJson?.data?.token;
        if (login_token) {
          return new Response(
            JSON.stringify({ login_token, sip_username: cred.telnyx_sip_username }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        console.warn("[telnyx-token] per-agent token fetch failed:", await tokRes.text());
      }
    }

    // 2. Fallback to shared SIP credential from secrets
    const login = Deno.env.get("TELNYX_SIP_USERNAME") ?? Deno.env.get("VITE_TELNYX_LOGIN");
    const password = Deno.env.get("TELNYX_SIP_PASSWORD") ?? Deno.env.get("VITE_TELNYX_PASSWORD");
    if (!login || !password) {
      return new Response(
        JSON.stringify({ error: "Telnyx credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ login, password, sip_username: login }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
