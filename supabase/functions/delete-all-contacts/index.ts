import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all contact IDs in batches
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: contacts } = await adminClient
        .from("contacts")
        .select("id")
        .limit(500);

      if (!contacts || contacts.length === 0) {
        hasMore = false;
        break;
      }

      const ids = contacts.map((c: any) => c.id);

      await adminClient.from("callbacks").delete().in("contact_id", ids);
      await adminClient.from("appointments").delete().in("contact_id", ids);
      await adminClient.from("campaign_contacts").delete().in("contact_id", ids);
      await adminClient.from("call_attempts").update({ contact_id: null }).in("contact_id", ids);

      const { count } = await adminClient
        .from("contacts")
        .delete({ count: "exact" })
        .in("id", ids);

      totalDeleted += count || 0;
    }

    // Audit log
    await adminClient.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "delete_all_contacts",
      details: { contacts_deleted: totalDeleted },
    });

    return new Response(JSON.stringify({
      success: true,
      deleted_contacts: totalDeleted,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
