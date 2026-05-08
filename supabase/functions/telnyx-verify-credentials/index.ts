import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth: admin only ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  const userId = claimsData.claims.sub as string;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
    return json({ error: "Forbidden — admin role required" }, 403);
  }

  const checks: Check[] = [];

  // --- Secret presence ---
  const required = [
    "TELNYX_API_KEY",
    "TELNYX_CONNECTION_ID",
    "TELNYX_CREDENTIAL_ID",
    "TELNYX_OUTBOUND_VOICE_PROFILE_ID",
    "TELNYX_DEFAULT_FROM_NUMBER",
    "TELNYX_WEBHOOK_SECRET",
    "TELNYX_SIP_USERNAME",
    "TELNYX_SIP_PASSWORD",
  ];
  for (const k of required) {
    const v = Deno.env.get(k);
    checks.push({
      name: k,
      ok: !!v && v.length > 0,
      detail: v ? `set (${v.length} chars)` : "missing",
    });
  }

  const apiKey = Deno.env.get("TELNYX_API_KEY");
  const connectionId = Deno.env.get("TELNYX_CONNECTION_ID");
  const credentialId = Deno.env.get("TELNYX_CREDENTIAL_ID");
  const profileId = Deno.env.get("TELNYX_OUTBOUND_VOICE_PROFILE_ID");

  // Helper to GET a Telnyx resource and report status.
  async function pingTelnyx(label: string, url: string) {
    if (!apiKey) {
      checks.push({ name: label, ok: false, detail: "TELNYX_API_KEY missing" });
      return;
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (res.ok) {
        checks.push({ name: label, ok: true, detail: `HTTP ${res.status}` });
      } else {
        let msg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text);
          msg += `: ${j?.errors?.[0]?.detail || j?.errors?.[0]?.title || text.slice(0, 120)}`;
        } catch {
          msg += `: ${text.slice(0, 120)}`;
        }
        checks.push({ name: label, ok: false, detail: msg });
      }
    } catch (e) {
      checks.push({
        name: label,
        ok: false,
        detail: (e as Error).message || "request failed",
      });
    }
  }

  // --- API key validity (lists phone numbers, page size 1) ---
  await pingTelnyx(
    "Telnyx API key (GET /v2/phone_numbers)",
    "https://api.telnyx.com/v2/phone_numbers?page[size]=1",
  );

  // --- Connection ID ---
  if (connectionId) {
    await pingTelnyx(
      `Connection ${connectionId}`,
      `https://api.telnyx.com/v2/connections/${connectionId}`,
    );
  }

  // --- Credential ID ---
  if (credentialId) {
    await pingTelnyx(
      `Telephony credential ${credentialId}`,
      `https://api.telnyx.com/v2/telephony_credentials/${credentialId}`,
    );
  }

  // --- Outbound voice profile ---
  if (profileId) {
    await pingTelnyx(
      `Outbound voice profile ${profileId}`,
      `https://api.telnyx.com/v2/outbound_voice_profiles/${profileId}`,
    );
  }

  // --- Webhook public key sanity (must base64-decode to 32 bytes for ed25519) ---
  const pubKey = Deno.env.get("TELNYX_WEBHOOK_SECRET");
  if (pubKey) {
    try {
      const bytes = Uint8Array.from(atob(pubKey), (c) => c.charCodeAt(0));
      checks.push({
        name: "TELNYX_WEBHOOK_SECRET ed25519 key",
        ok: bytes.length === 32,
        detail: `decoded ${bytes.length} bytes (expected 32)`,
      });
    } catch {
      checks.push({
        name: "TELNYX_WEBHOOK_SECRET ed25519 key",
        ok: false,
        detail: "not valid base64",
      });
    }
  }

  const allOk = checks.every((c) => c.ok);
  return json({ ok: allOk, checks }, 200);
});