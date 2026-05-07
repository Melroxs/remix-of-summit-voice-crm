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

    const body = await req.json().catch(() => ({}));
    const { lead_id } = body as { lead_id?: string };

    let assignmentId: string;
    let leadId: string;
    let campaignId: string;
    const today = new Date().toISOString().split("T")[0];

    if (lead_id) {
      const { data: assignment, error } = await admin
        .from("daily_lead_assignments")
        .select("id, contact_id, campaign_id, status, locked_by")
        .eq("contact_id", lead_id)
        .eq("agent_id", user.id)
        .eq("assigned_date", today)
        .maybeSingle();
      if (error || !assignment) throw new Error("Lead not in your daily queue");
      if (assignment.locked_by && assignment.locked_by !== user.id) {
        throw new Error("Lead is locked by another agent");
      }
      if (assignment.status === "completed") throw new Error("Lead already completed");
      assignmentId = assignment.id;
      leadId = assignment.contact_id;
      campaignId = assignment.campaign_id;
    } else {
      const { data: nextLead, error } = await admin
        .from("daily_lead_assignments")
        .select("id, contact_id, campaign_id")
        .eq("agent_id", user.id)
        .eq("assigned_date", today)
        .in("status", ["assigned", "new", "no_answer", "voicemail", "callback"])
        .is("locked_by", null)
        .order("queue_position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !nextLead) throw new Error("No pending leads in your queue for today");
      assignmentId = nextLead.id;
      leadId = nextLead.contact_id;
      campaignId = nextLead.campaign_id;
    }

    await admin
      .from("daily_lead_assignments")
      .update({
        locked_at: new Date().toISOString(),
        locked_by: user.id,
        status: "calling",
      })
      .eq("id", assignmentId);

    const { data: session, error: sessionError } = await admin
      .from("call_sessions")
      .insert({
        lead_id: leadId,
        agent_id: user.id,
        campaign_id: campaignId,
        direction: "outbound",
        status: "initiated",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (sessionError) throw new Error("Failed to create call session: " + sessionError.message);

    return new Response(
      JSON.stringify({ session_id: session.id, lead_id: leadId, campaign_id: campaignId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});