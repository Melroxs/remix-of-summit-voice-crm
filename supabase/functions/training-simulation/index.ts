import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scenario, difficulty, transcript, mode } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const scenarioPrompt =
      SCENARIO_PROMPTS[scenario] ?? SCENARIO_PROMPTS.cold_homeowner;
    const difficultyPrompt =
      DIFFICULTY_TUNING[difficulty] ?? DIFFICULTY_TUNING.medium;

    // Mode "score" → analyze entire transcript and return score + feedback
    if (mode === "score") {
      const conversationText = (transcript ?? [])
        .map((m: { role: string; content: string }) =>
          `${m.role === "user" ? "AGENT" : "PROSPECT"}: ${m.content}`
        )
        .join("\n");

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
                  "You are a sales coach for a roofing appointment-setting team. Score the agent on a 0-100 scale and give concise actionable feedback.",
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
      return new Response(JSON.stringify(parsed ?? { score: 0, strengths: "", improvements: "", booked_appointment: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default mode → roleplay reply
    const systemPrompt = `${scenarioPrompt}\n\n${difficultyPrompt}\n\nRules:\n- Stay in character as the prospect.\n- Keep replies short (1-3 sentences) like real phone conversation.\n- Never break character or mention you are AI.\n- If the agent successfully books an inspection, end your reply with the exact tag [APPOINTMENT_BOOKED].`;

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
    return new Response(JSON.stringify({ reply }), {
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