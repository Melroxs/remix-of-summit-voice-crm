import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "save_call_summary",
    description: "Save a structured AI call summary for a CRM call log.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence concise summary of the call" },
        call_outcome_summary: { type: "string", description: "One-line outcome, e.g. 'Homeowner interested, callback requested'" },
        next_action: { type: "string", description: "Specific actionable next step for the agent" },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative", "unknown"], description: "Overall call sentiment" },
      },
      required: ["summary", "call_outcome_summary", "next_action", "sentiment"],
      additionalProperties: false,
    },
  },
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { call_log_id, regenerate } = await req.json();
    if (!call_log_id) {
      return new Response(JSON.stringify({ error: "call_log_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // If regenerating, delete existing summary
    if (regenerate) {
      await adminClient.from("ai_summaries").delete().eq("call_log_id", call_log_id);
    }

    // Check if summary already exists
    const { data: existing } = await adminClient
      .from("ai_summaries")
      .select("id")
      .eq("call_log_id", call_log_id)
      .maybeSingle();

    if (existing && !regenerate) {
      return new Response(JSON.stringify({ error: "Summary already exists", existing: true }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch call log with related data
    const { data: callLog } = await adminClient
      .from("call_attempts")
      .select("*, contacts(first_name, last_name, owner_renter, credit_rating, home_value, household_income, cool_notes, city, state), campaigns(name)")
      .eq("id", call_log_id)
      .maybeSingle();

    if (!callLog) {
      return new Response(JSON.stringify({ error: "Call log not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert pending record
    const pendingRow = {
      call_log_id,
      contact_id: callLog.contact_id || null,
      agent_id: callLog.agent_id || null,
      campaign_id: callLog.campaign_id || null,
      summary: "",
      next_action: null,
      sentiment: null,
      call_outcome_summary: null,
      suggested_next_action: null,
      summary_source: "fallback",
      generation_status: "processing",
      error_message: null,
    };
    const { data: pendingInsert, error: pendingErr } = await adminClient
      .from("ai_summaries")
      .insert(pendingRow)
      .select("id")
      .single();

    if (pendingErr) {
      console.error("Pending insert error:", pendingErr);
      return new Response(JSON.stringify({ error: pendingErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const summaryId = pendingInsert.id;

    // Build context
    const contact = (callLog as any).contacts;
    const campaign = (callLog as any).campaigns;
    const durationMin = callLog.duration_seconds ? Math.floor(callLog.duration_seconds / 60) : 0;
    const durationSec = callLog.duration_seconds ? callLog.duration_seconds % 60 : 0;

    const contextParts = [
      `Disposition: ${callLog.disposition || "none"}`,
      `Call duration: ${durationMin}m ${durationSec}s`,
      `Call source: ${callLog.call_source || "queue"}`,
      `Dial mode: ${callLog.dial_mode_used || "unknown"}`,
      contact ? `Contact: ${contact.first_name} ${contact.last_name}` : null,
      contact?.city && contact?.state ? `Location: ${contact.city}, ${contact.state}` : null,
      contact?.owner_renter ? `Owner/Renter: ${contact.owner_renter}` : null,
      contact?.credit_rating ? `Credit rating: ${contact.credit_rating}` : null,
      contact?.home_value ? `Home value: ${contact.home_value}` : null,
      contact?.household_income ? `Household income: ${contact.household_income}` : null,
      campaign ? `Campaign: ${campaign.name}` : null,
      callLog.notes ? `Agent notes: ${callLog.notes}` : null,
      contact?.cool_notes ? `Contact notes: ${contact.cool_notes}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a CRM call intelligence assistant for an outbound sales/lead generation call center.
Based on the call metadata provided, generate a structured summary. 
Even if there is no transcript, use the disposition, notes, duration, and contact context to produce useful CRM intelligence.
If the call was very short (under 10 seconds) with no_answer/voicemail, keep the summary brief.
For longer calls with notes, provide detailed actionable intelligence.`;

    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextParts },
          ],
          tools: [TOOL_SCHEMA],
          tool_choice: { type: "function", function: { name: "save_call_summary" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        const errText = await aiResponse.text();
        console.error("AI gateway error:", status, errText);

        const errorMsg = status === 429 ? "Rate limit exceeded" : status === 402 ? "Credits exhausted" : `AI error (${status})`;
        await adminClient.from("ai_summaries").update({
          generation_status: "failed",
          error_message: errorMsg,
        }).eq("id", summaryId);

        return new Response(JSON.stringify({ error: errorMsg }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      let parsed: any;

      if (toolCall?.function?.arguments) {
        try {
          parsed = JSON.parse(toolCall.function.arguments);
        } catch {
          parsed = null;
        }
      }

      // Fallback: try parsing message content as JSON
      if (!parsed) {
        const content = aiData.choices?.[0]?.message?.content || "";
        try {
          const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = {
            summary: content.slice(0, 500) || "Summary could not be generated.",
            call_outcome_summary: callLog.disposition || "Unknown outcome",
            next_action: "Review call details manually",
            sentiment: "unknown",
          };
        }
      }

      // Update the summary record
      await adminClient.from("ai_summaries").update({
        summary: parsed.summary || "No summary generated",
        next_action: parsed.next_action || null,
        sentiment: parsed.sentiment || null,
        call_outcome_summary: parsed.call_outcome_summary || null,
        suggested_next_action: parsed.next_action || null,
        summary_source: "fallback",
        generation_status: "complete",
        error_message: null,
      }).eq("id", summaryId);

      // Fetch the completed record
      const { data: final } = await adminClient
        .from("ai_summaries")
        .select("*")
        .eq("id", summaryId)
        .single();

      return new Response(JSON.stringify({ ok: true, summary: final }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (aiErr: any) {
      console.error("AI call error:", aiErr);
      await adminClient.from("ai_summaries").update({
        generation_status: "failed",
        error_message: aiErr.message || "Unknown AI error",
      }).eq("id", summaryId);

      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("[ai-call-summary] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
