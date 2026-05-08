import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SCENARIO_PROMPTS: Record<string, string> = {
  cold_homeowner:
    "You are a homeowner who just got an unsolicited call about your roof. You're skeptical, slightly annoyed, but not rude. Push back on common pitches. Only become interested if the agent qualifies you well, builds rapport, mentions a real concern (storm damage, age, leaks), and offers a free no-obligation inspection.",
  storm_damage:
    "You are a homeowner whose neighborhood had a hailstorm 3 weeks ago. You've noticed a few missing shingles. You're cautiously open but worried about scams. Ask about insurance, licensing, and timelines. Agree to an inspection only if the agent sounds professional and trustworthy.",
  price_objection:
    "You are a homeowner who needs a new roof but every quote feels too expensive. Open with strong price objections. Only soften if the agent reframes value (warranty, financing, longevity) instead of dropping price.",
  not_interested:
    "You are a homeowner who flat-out says 'not interested' in the first 10 seconds. Stay short and dismissive. Only engage if the agent uses a strong pattern interrupt and gives a compelling reason to keep listening.",
  ready_buyer:
    "You are a homeowner actively shopping for a roofer. You already have 2 quotes. You're warm but you'll only book an inspection if the agent stands out, asks smart qualifying questions, and creates urgency.",
};

const DIFFICULTY_TUNING: Record<string, string> = {
  easy: "Be cooperative. Give in after light qualification. Forgive minor mistakes.",
  medium: "Be realistic. Push back twice before warming up. Require solid qualification.",
  hard: "Be tough. Throw multiple objections, interrupt, and only book if the agent is clearly excellent.",
};

// Pull active training material for a campaign (or company-wide if no
// campaign was supplied). Returns a compact text block that can be
// injected into both the roleplay system prompt and the scoring prompt.
async function loadCampaignTrainingContext(
  campaignId: string | null | undefined,
  scenario: string | null | undefined,
): Promise<{ text: string; counts: Record<string, number> }> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return { text: "", counts: {} };
    const supabase = createClient(url, key);

    // We always read materials with no campaign filter when none provided
    // (company-wide library) and otherwise scope to that campaign + any
    // company-wide rows (campaign_id IS NULL).
    let query = supabase
      .from("ai_training_materials")
      .select("material_type, title, content, parent_id, scenario, sort_order")
      .eq("is_active", true)
      .order("material_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(200);

    if (campaignId) {
      query = query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
    }

    const { data, error } = await query;
    if (error || !data) return { text: "", counts: {} };

    // Optionally narrow objections/talking points to ones tagged with the
    // current scenario, but always keep generic (untagged) ones.
    const filtered = data.filter((row: any) => {
      if (!scenario) return true;
      if (!row.scenario) return true;
      return row.scenario === scenario;
    });

    if (filtered.length === 0) return { text: "", counts: {} };

    const groups: Record<string, { title: string; content: string }[]> = {};
    for (const row of filtered as any[]) {
      const k = row.material_type as string;
      groups[k] ??= [];
      groups[k].push({ title: row.title, content: row.content ?? "" });
    }

    const counts: Record<string, number> = {};
    Object.keys(groups).forEach((k) => (counts[k] = groups[k].length));

    const sectionLabels: Record<string, string> = {
      script: "Approved scripts",
      objection: "Common objections",
      rebuttal: "Approved rebuttals",
      talking_point: "Talking points",
      qualification_question: "Qualification questions",
      closing_line: "Closing lines",
    };

    const sections: string[] = [];
    for (const [k, items] of Object.entries(groups)) {
      const label = sectionLabels[k] ?? k;
      const lines = items
        .slice(0, 25)
        .map(
          (it) =>
            `- ${it.title}${it.content ? `: ${it.content.replace(/\s+/g, " ").trim()}` : ""}`,
        )
        .join("\n");
      sections.push(`${label}:\n${lines}`);
    }

    return { text: sections.join("\n\n"), counts };
  } catch (e) {
    console.error("loadCampaignTrainingContext failed", e);
    return { text: "", counts: {} };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated caller with a valid app role.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const { data: roles } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = new Set(["admin", "manager", "team_leader", "agent"]);
    if (!(roles ?? []).some((r: { role: string }) => allowed.has(r.role))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { scenario, difficulty, transcript, mode, campaign_id } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const scenarioPrompt =
      SCENARIO_PROMPTS[scenario] ?? SCENARIO_PROMPTS.cold_homeowner;
    const difficultyPrompt =
      DIFFICULTY_TUNING[difficulty] ?? DIFFICULTY_TUNING.medium;

    const { text: trainingContext, counts: trainingCounts } =
      await loadCampaignTrainingContext(campaign_id, scenario);

    // Mode "score" → analyze entire transcript and return score + feedback
    if (mode === "score") {
      const conversationText = (transcript ?? [])
        .map((m: { role: string; content: string }) =>
          `${m.role === "user" ? "AGENT" : "PROSPECT"}: ${m.content}`
        )
        .join("\n");

      const coachingBlock = trainingContext
        ? `\n\nUse this team coaching library to judge whether the agent stuck to approved talk tracks and handled objections correctly. Reward use of these scripts/rebuttals; flag deviations:\n\n${trainingContext}`
        : "";

      const scoreResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  `You are a sales coach for a roofing appointment-setting team. Score the agent on a 0-100 scale and give concise actionable feedback.${coachingBlock}`,
              },
              {
                role: "user",
                content: `Scenario: ${scenario}\nDifficulty: ${difficulty}\n\nTranscript:\n${conversationText}\n\nReturn the score and feedback.`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "submit_score",
                  description: "Return final score and coaching feedback",
                  parameters: {
                    type: "object",
                    properties: {
                      score: { type: "integer", minimum: 0, maximum: 100 },
                      strengths: { type: "string" },
                      improvements: { type: "string" },
                      booked_appointment: { type: "boolean" },
                    },
                    required: ["score", "strengths", "improvements", "booked_appointment"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "submit_score" } },
          }),
        }
      );

      if (!scoreResp.ok) {
        const t = await scoreResp.text();
        return new Response(JSON.stringify({ error: t }), {
          status: scoreResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await scoreResp.json();
      const args =
        data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({
        ...(parsed ?? { score: 0, strengths: "", improvements: "", booked_appointment: false }),
        training_materials_used: trainingCounts,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default mode → roleplay reply
    const objectionsHint = trainingContext
      ? `\n\nThe team has the following coaching library. Pull realistic objections from this list when pushing back, and only soften when the agent uses the matching rebuttal or qualifying question:\n\n${trainingContext}`
      : "";

    const systemPrompt = `${scenarioPrompt}\n\n${difficultyPrompt}\n\nRules:\n- Stay in character as the prospect.\n- Keep replies short (1-3 sentences) like real phone conversation.\n- Never break character or mention you are AI.\n- If the agent successfully books an inspection, end your reply with the exact tag [APPOINTMENT_BOOKED].${objectionsHint}`;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...(transcript ?? []),
          ],
        }),
      }
    );

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await resp.text();
      return new Response(JSON.stringify({ error: t }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply, training_materials_used: trainingCounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("training-simulation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});