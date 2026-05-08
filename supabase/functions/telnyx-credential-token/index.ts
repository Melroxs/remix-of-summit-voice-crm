import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub as string;

  // Caller must hold a role that uses the SIP softphone.
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const allowed = new Set(["admin", "manager", "team_leader", "agent"]);
  const hasRole = (roles ?? []).some((r: { role: string }) => allowed.has(r.role));
  if (!hasRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "TELNYX_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve credential id: from request body, query param, or env.
  let credentialId: string | undefined;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      credentialId = body?.credential_id;
    }
  } catch (_) { /* ignore */ }
  if (!credentialId) {
    const url = new URL(req.url);
    credentialId = url.searchParams.get("credential_id") ?? undefined;
  }
  if (!credentialId) {
    credentialId = Deno.env.get("TELNYX_CREDENTIAL_ID") ?? undefined;
  }

  if (!credentialId || !/^[A-Za-z0-9_-]{1,64}$/.test(credentialId)) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid credential_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const tnxRes = await fetch(
    `https://api.telnyx.com/v2/telephony_credentials/${credentialId}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  // Telnyx returns the JWT as plain text in the response body.
  const text = await tnxRes.text();
  if (!tnxRes.ok) {
    console.error("[telnyx-credential-token] Telnyx error", tnxRes.status, text);
    return new Response(
      JSON.stringify({ error: "Failed to mint Telnyx token", status: tnxRes.status }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ token: text.trim() }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});