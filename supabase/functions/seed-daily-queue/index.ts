import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await anon.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Admin check
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const { agent_email, campaign_id, lead_count } = await req.json();
    if (!agent_email || !campaign_id || !lead_count) {
      throw new Error("Missing agent_email, campaign_id, or lead_count");
    }
    const count = Math.min(Math.max(parseInt(String(lead_count), 10) || 0, 1), 500);

    // Look up agent user_id by email via profiles
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("user_id")
      .ilike("email", agent_email)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile?.user_id) throw new Error(`No profile found for email ${agent_email}`);
    const agentId = profile.user_id;

    const today = new Date().toISOString().split("T")[0];

    // Find contacts already assigned today (any agent) to exclude
    const { data: existing } = await admin
      .from("daily_lead_assignments")
      .select("contact_id")
      .eq("assigned_date", today)
      .eq("campaign_id", campaign_id);
    const excluded = new Set((existing ?? []).map((r: any) => r.contact_id));

    // Pull eligible campaign_contacts
    const { data: leads, error: leadsErr } = await admin
      .from("campaign_contacts")
      .select("contact_id, priority_band, priority_score, created_at")
      .eq("campaign_id", campaign_id)
      .order("priority_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(count + excluded.size + 50);
    if (leadsErr) throw leadsErr;

    const fresh = (leads ?? []).filter((l: any) => !excluded.has(l.contact_id)).slice(0, count);
    if (fresh.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, message: "No eligible leads found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine starting queue_position
    const { data: maxRow } = await admin
      .from("daily_lead_assignments")
      .select("queue_position")
      .eq("assigned_date", today)
      .eq("agent_id", agentId)
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let pos = (maxRow?.queue_position ?? 0) + 1;

    const rows = fresh.map((l: any) => ({
      campaign_id,
      contact_id: l.contact_id,
      agent_id: agentId,
      assigned_by: user.id,
      assigned_date: today,
      queue_position: pos++,
      status: "assigned",
    }));

    const { error: insertErr, count: insertedCount } = await admin
      .from("daily_lead_assignments")
      .insert(rows, { count: "exact" });
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ inserted: insertedCount ?? rows.length, agent_id: agentId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});