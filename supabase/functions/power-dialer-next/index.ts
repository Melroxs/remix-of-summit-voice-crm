import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Power dialer: pull the next eligible lead for the caller.
 * Body: { campaign_id }
 * Returns: { contact: {...} } or { contact: null } when queue is exhausted.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const agentId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const campaignId: string | undefined = body.campaign_id;
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    const { data, error } = await supabase.rpc("get_next_lead_for_agent", {
      _agent_id: agentId,
      _campaign_id: campaignId,
    });
    if (error) {
      console.error("[power-dialer-next] rpc error:", error);
      return json({ error: error.message }, 400);
    }

    const contact = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return json({ contact });
  } catch (e) {
    console.error("[power-dialer-next] error:", e);
    return json({ error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}