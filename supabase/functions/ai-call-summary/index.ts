import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT =
  "You are a call analysis assistant for a sales team. Analyse the following sales call transcript and return a JSON object with three fields: summary (a 2-3 sentence plain English summary of what happened on the call), sentiment (one of: positive, neutral, negative), and objections (an array of strings listing any objections the lead raised). Return only valid JSON, no other text.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated caller.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => null);
    const callAttemptId: string | undefined = body?.callAttemptId;
    const transcript: string | undefined = body?.transcript;

    if (!callAttemptId || typeof transcript !== "string" || !transcript.trim()) {
      return json({ error: "callAttemptId and transcript are required" }, 400);
    }

    // Verify the caller is the agent for this call attempt OR an admin/manager.
    const { data: roles } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isPriv = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "manager",
    );
    if (!isPriv) {
      const { data: attempt, error: attemptErr } = await userClient
        .from("call_attempts")
        .select("agent_id")
        .eq("id", callAttemptId)
        .maybeSingle();
      if (attemptErr || !attempt || attempt.agent_id !== userId) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY is not configured" }, 500);

    // Use tool calling for reliable structured output.
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_call_analysis",
              description: "Save the structured analysis of the call.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                  objections: { type: "array", items: { type: "string" } },
                },
                required: ["summary", "sentiment", "objections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_call_analysis" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return json({ error: "Rate limits exceeded, please try again later." }, 429);
      if (aiRes.status === 402) return json({ error: "Payment required, please add funds to your Lovable AI workspace." }, 402);
      const text = await aiRes.text();
      console.error("[ai-call-summary] AI gateway error:", aiRes.status, text);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    let parsed: { summary: string; sentiment: string; objections: string[] };
    try {
      parsed = JSON.parse(argsStr ?? "{}");
    } catch {
      // Fallback: try to parse from raw content
      const raw = aiData?.choices?.[0]?.message?.content ?? "{}";
      parsed = JSON.parse(raw);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertErr } = await supabase.from("ai_summaries").insert({
      call_attempt_id: callAttemptId,
      summary: parsed.summary ?? "",
      sentiment: parsed.sentiment ?? null,
      objections: parsed.objections ?? [],
      created_at: new Date().toISOString(),
      summary_source: "lovable_ai",
      generation_status: "complete",
    });

    if (insertErr) {
      console.error("[ai-call-summary] insert error:", insertErr.message);
      return json({ error: insertErr.message }, 500);
    }

    return json({ ok: true, summary: parsed.summary, sentiment: parsed.sentiment, objections: parsed.objections });
  } catch (err) {
    console.error("[ai-call-summary] handler error:", err);
    return json({ error: (err as Error)?.message || "Internal error" }, 500);
  }
});
