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

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
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

    const { lead_import_id } = await req.json();
    if (!lead_import_id) {
      return new Response(JSON.stringify({ error: "lead_import_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the import job
    const { data: job, error: jobErr } = await adminClient
      .from("lead_imports")
      .select("id, filename, total_rows, successful_rows")
      .eq("id", lead_import_id)
      .maybeSingle();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Import job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all contacts from this import
    const { data: contacts } = await adminClient
      .from("contacts")
      .select("id")
      .eq("lead_import_id", lead_import_id);

    const contactIds = (contacts || []).map((c: any) => c.id);
    let deletedContacts = 0;

    if (contactIds.length > 0) {
      // Delete related records in correct order (batched for large lists)
      const BATCH = 500;
      for (let i = 0; i < contactIds.length; i += BATCH) {
        const batch = contactIds.slice(i, i + BATCH);

        // Delete callbacks
        await adminClient.from("callbacks").delete().in("contact_id", batch);
        // Delete appointments
        await adminClient.from("appointments").delete().in("contact_id", batch);
        // Delete campaign_contacts
        await adminClient.from("campaign_contacts").delete().in("contact_id", batch);

        // Nullify contact_id on call_logs (preserve history but unlink)
        await adminClient.from("call_attempts").update({ contact_id: null }).in("contact_id", batch);

        // Delete the contacts themselves
        const { count } = await adminClient
          .from("contacts")
          .delete({ count: "exact" })
          .in("id", batch);

        deletedContacts += count || 0;
      }
    }

    // Delete import errors
    await adminClient.from("lead_import_rows").delete().eq("lead_import_id", lead_import_id);

    // Delete the import job itself
    await adminClient.from("lead_imports").delete().eq("id", lead_import_id);

    // Audit log
    await adminClient.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "delete_import_list",
      details: {
        lead_import_id,
        filename: job.filename,
        contacts_deleted: deletedContacts,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      deleted_contacts: deletedContacts,
      filename: job.filename,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
