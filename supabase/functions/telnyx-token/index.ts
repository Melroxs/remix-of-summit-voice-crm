const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const login = Deno.env.get("TELNYX_SIP_USERNAME");
  const password = Deno.env.get("TELNYX_SIP_PASSWORD");

  if (!login || !password) {
    return new Response(
      JSON.stringify({ error: "Telnyx SIP credentials are not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ login, password }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
