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

    const { assignment_id, session_id, reason } = await req.json();

    if (session_id) {
      await admin
        .from("call_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          failure_reason: reason ?? "released",
        })
        .eq("id", session_id)
        .eq("agent_id", user.id);
    }

    if (assignment_id) {
      await admin
        .from("daily_lead_assignments")
        .update({ status: "assigned", locked_at: null, locked_by: null })
        .eq("id", assignment_id)
        .eq("agent_id", user.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});