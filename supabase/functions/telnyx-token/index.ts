// Mints a short-lived Telnyx WebRTC JWT login_token for the authenticated agent.
// Falls back to per-agent SIP credential or global SIP credential if no Telnyx
// "telephony_credential" id is configured.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimErr } = await callerClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(url, svc);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const allowed = new Set(["agent", "admin", "team_leader", "manager"]);
    if (!(roles ?? []).some((r: any) => allowed.has(r.role))) return json({ error: "Forbidden" }, 403);

    const apiKey = Deno.env.get("TELNYX_API_KEY");

    // 1) Per-agent telephony credential id (preferred)
    const { data: cred } = await admin
      .from("agent_telephony_credentials")
      .select("telnyx_credential_id, telnyx_sip_username, encrypted_telnyx_sip_password, active")
      .eq("agent_id", userId)
      .maybeSingle();

    if (cred?.active && cred.telnyx_credential_id && apiKey) {
      // Mint short-lived JWT login_token from Telnyx
      const r = await fetch(
        `https://api.telnyx.com/v2/telephony_credentials/${cred.telnyx_credential_id}/token`,
        { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
      );
      if (r.ok) {
        const tok = await r.text(); // Telnyx returns the JWT as plain text
        return json({ login_token: tok.trim(), mode: "jwt" });
      }
      const errTxt = await r.text();
      console.warn("[telnyx-token] credential token mint failed:", r.status, errTxt);
    }

    // 2) Per-agent SIP user/pass
    if (cred?.active && cred.telnyx_sip_username && cred.encrypted_telnyx_sip_password) {
      return json({
        login: cred.telnyx_sip_username,
        password: cred.encrypted_telnyx_sip_password,
        mode: "sip-agent",
      });
    }

    // 3) Global fallback SIP creds (legacy)
    const login = Deno.env.get("TELNYX_SIP_USERNAME");
    const password = Deno.env.get("TELNYX_SIP_PASSWORD");
    if (login && password) return json({ login, password, mode: "sip-global" });

    return json({ error: "Telnyx credentials not configured for this agent" }, 503);
  } catch (e) {
    console.error("[telnyx-token] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
