import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!anonKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { target_user_id, action } = body;

    if (!target_user_id || !action) {
      return new Response(JSON.stringify({ error: "target_user_id and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["deactivate", "activate", "delete"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action. Use 'deactivate', 'activate', or 'delete'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-targeting for destructive actions
    if ((action === "deactivate" || action === "delete") && target_user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot perform this action on your own account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Anonymize historical records - set agent_id to null
      await supabaseAdmin.from("call_attempts").update({ agent_id: null }).eq("agent_id", target_user_id);
      await supabaseAdmin.from("callbacks").update({ agent_id: null }).eq("agent_id", target_user_id);
      await supabaseAdmin.from("appointments").update({ agent_id: null }).eq("agent_id", target_user_id);

      // Remove from campaign assignments
      await supabaseAdmin.from("campaign_agents").delete().eq("user_id", target_user_id);
      // Remove client user links
      await supabaseAdmin.from("client_users").delete().eq("user_id", target_user_id);
      // Remove roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", target_user_id);
      // Remove profile
      await supabaseAdmin.from("profiles").delete().eq("user_id", target_user_id);

      // Delete from auth
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);
      if (authDeleteError) {
        console.error("Auth delete error:", authDeleteError);
      }

      // Audit log
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: "delete_user",
        target_user_id,
        details: { reason: body.reason || "Admin hard delete" },
      });

      return new Response(
        JSON.stringify({ ok: true, action: "deleted", user_id: target_user_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "deactivate") {
      await supabaseAdmin.from("profiles").update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: caller.id,
        agent_status: "offline",
      }).eq("user_id", target_user_id);

      await supabaseAdmin.auth.admin.updateUserById(target_user_id, { ban_duration: "876000h" });
      await supabaseAdmin.from("campaign_agents").delete().eq("user_id", target_user_id);

      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: "deactivate_user",
        target_user_id,
        details: { reason: body.reason || "Admin deactivation" },
      });

      return new Response(
        JSON.stringify({ ok: true, action: "deactivated", user_id: target_user_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "activate") {
      await supabaseAdmin.from("profiles").update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
      }).eq("user_id", target_user_id);

      await supabaseAdmin.auth.admin.updateUserById(target_user_id, { ban_duration: "none" });

      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: caller.id,
        action: "activate_user",
        target_user_id,
        details: { reason: body.reason || "Admin reactivation" },
      });

      return new Response(
        JSON.stringify({ ok: true, action: "activated", user_id: target_user_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[manage-user] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
