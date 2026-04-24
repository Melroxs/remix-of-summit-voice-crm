import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap,
  Phone,
  PhoneOff,
  Send,
  Sparkles,
  History,
  Trophy,
  Mic,
  MicOff,
  Keyboard,
  Volume2,
  BookOpen,
  MessageSquareWarning,
  Quote,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Msg = { role: "user" | "assistant"; content: string };

interface Simulation {
  id: string;
  scenario: string;
  difficulty: string;
  score: number | null;
  feedback: string | null;
  status: string;
  created_at: string;
  duration_seconds: number | null;
}

interface CampaignOption {
  id: string;
  name: string;
}

interface TrainingMaterial {
  id: string;
  material_type:
    | "script"
    | "objection"
    | "rebuttal"
    | "talking_point"
    | "qualification_question"
    | "closing_line";
  title: string;
  content: string;
  parent_id: string | null;
  scenario: string | null;
  sort_order: number;
}

const SCENARIOS: { value: string; label: string; description: string }[] = [
  { value: "cold_homeowner", label: "Cold Homeowner", description: "Skeptical, unsolicited call" },
  { value: "storm_damage", label: "Storm Damage", description: "Recent hailstorm in the area" },
  { value: "price_objection", label: "Price Objection", description: "Already had quotes, too expensive" },
  { value: "not_interested", label: "Hard Brush-off", description: "'Not interested' in 10 seconds" },
  { value: "ready_buyer", label: "Ready Buyer", description: "Actively shopping, has 2 quotes" },
];

export default function TrainingHub() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [scenario, setScenario] = useState("cold_homeowner");
  const [difficulty, setDifficulty] = useState("medium");
  const [campaignId, setCampaignId] = useState<string>("none");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [history, setHistory] = useState<Simulation[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [result, setResult] = useState<{
    score: number;
    strengths: string;
    improvements: string;
    booked_appointment: boolean;
  } | null>(null);

  // Voice mode
  const [mode, setMode] = useState<"text" | "voice">("voice");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<Msg[]>([]);
  const sendingRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync so SpeechRecognition callbacks use fresh state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setVoiceSupported(false);
  }, []);

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  // Load the campaigns this user can see (RLS will filter).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name")
        .order("name", { ascending: true });
      setCampaigns((data as CampaignOption[]) ?? []);
    })();
  }, [user]);

  // Reload coaching materials whenever the campaign or scenario changes.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setMaterialsLoading(true);
      let q = supabase
        .from("ai_training_materials")
        .select("id, material_type, title, content, parent_id, scenario, sort_order")
        .eq("is_active", true)
        .order("material_type", { ascending: true })
        .order("sort_order", { ascending: true })
        .limit(200);

      if (campaignId !== "none") {
        q = q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
      } else {
        q = q.is("campaign_id", null);
      }

      const { data } = await q;
      if (cancelled) return;
      const filtered = (data as TrainingMaterial[] | null)?.filter(
        (m) => !m.scenario || m.scenario === scenario,
      );
      setMaterials(filtered ?? []);
      setMaterialsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, campaignId, scenario]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  async function loadHistory() {
    if (!user) return;
    const { data } = await supabase
      .from("training_assets")
      .select("*")
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data as Simulation[]) ?? []);
  }

  async function startCall() {
    if (!user) return;
    const { data, error } = await supabase
      .from("training_assets")
      .insert({
        agent_id: user.id,
        scenario,
        difficulty,
        transcript: [],
        status: "in_progress",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setActive(data.id);
    setTranscript([]);
    setResult(null);
    setStartTime(Date.now());
    // Agent speaks first — empty transcript, agent kicks off
  }

  function speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth || !text) return resolve();
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        // Pick a natural-sounding English voice if available
        const voices = synth.getVoices();
        const preferred =
          voices.find((v) => /Google US English|Samantha|Jenny|Aria/i.test(v.name)) ||
          voices.find((v) => v.lang?.startsWith("en")) ||
          voices[0];
        if (preferred) utter.voice = preferred;
        utter.rate = 1;
        utter.pitch = 1;
        utter.onstart = () => setAiSpeaking(true);
        utter.onend = () => {
          setAiSpeaking(false);
          resolve();
        };
        utter.onerror = () => {
          setAiSpeaking(false);
          resolve();
        };
        synth.speak(utter);
      } catch {
        resolve();
      }
    });
  }

  async function sendMessage(spoken?: string) {
    const text = (spoken ?? input).trim();
    if (!text || !active || sendingRef.current) return;
    const next: Msg[] = [...transcriptRef.current, { role: "user", content: text }];
    setTranscript(next);
    if (!spoken) setInput("");
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("training-simulation", {
        body: {
          scenario,
          difficulty,
          transcript: next,
          mode: "reply",
          campaign_id: campaignId !== "none" ? campaignId : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = (data?.reply ?? "").replace("[APPOINTMENT_BOOKED]", "").trim();
      const updated: Msg[] = [...next, { role: "assistant", content: reply }];
      setTranscript(updated);
      await supabase
        .from("training_assets")
        .update({ transcript: updated as never })
        .eq("id", active);

      if (mode === "voice" && reply) {
        await speak(reply);
      }

      if (data?.reply?.includes("[APPOINTMENT_BOOKED]")) {
        toast({ title: "🎉 Appointment booked!", description: "Wrapping up the call..." });
        setTimeout(() => endCall(updated), 800);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to get reply";
      toast({ title: "AI error", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  function startListening() {
    if (!voiceSupported || listening) return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "Voice not supported",
        description: "Use Chrome or Edge for voice mode, or switch to text mode.",
        variant: "destructive",
      });
      return;
    }
    // Stop any AI speech so the mic doesn't pick it up
    window.speechSynthesis?.cancel();
    setAiSpeaking(false);

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = "";
    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      setInterim("");
      if (e.error !== "no-speech" && e.error !== "aborted") {
        toast({
          title: "Mic error",
          description: e.error || "Could not capture audio",
          variant: "destructive",
        });
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const said = finalText.trim();
      if (said) sendMessage(said);
    };

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }

  // Cleanup speech on unmount / call end
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  async function endCall(finalTranscript?: Msg[]) {
    if (!active) return;
    setScoring(true);
    const tx = finalTranscript ?? transcript;
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    try {
      const { data, error } = await supabase.functions.invoke("training-simulation", {
        body: {
          scenario,
          difficulty,
          transcript: tx,
          mode: "score",
          campaign_id: campaignId !== "none" ? campaignId : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const feedbackText = `**Strengths**\n${data.strengths}\n\n**Improvements**\n${data.improvements}`;
      await supabase
        .from("training_assets")
        .update({
          score: data.score,
          feedback: feedbackText,
          status: "completed",
          duration_seconds: duration,
          ended_at: new Date().toISOString(),
        })
        .eq("id", active);
      setResult(data);
      loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to score";
      toast({ title: "Scoring error", description: msg, variant: "destructive" });
    } finally {
      setScoring(false);
    }
  }

  function resetCall() {
    setActive(null);
    setTranscript([]);
    setResult(null);
    setStartTime(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" /> Training Hub
        </h1>
        <p className="text-sm text-muted-foreground">
          Practice live calls against an AI homeowner. Get scored at the end.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Main practice area */}
        <Card className="flex flex-col min-h-[600px]">
          {!active ? (
            <div className="p-6 flex-1 flex flex-col">
              <div className="text-center mb-6">
                <Sparkles className="w-10 h-10 mx-auto text-primary mb-2" />
                <h2 className="text-lg font-semibold">Start a practice call</h2>
                <p className="text-sm text-muted-foreground">
                  The AI will play a homeowner. You start the call.
                </p>
              </div>
              <div className="space-y-4 max-w-md mx-auto w-full">
                <div>
                  <label className="text-sm font-medium mb-2 block">Scenario</label>
                  <Select value={scenario} onValueChange={setScenario}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENARIOS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <div>
                            <div className="font-medium">{s.label}</div>
                            <div className="text-xs text-muted-foreground">{s.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Campaign coaching library
                  </label>
                  <Select value={campaignId} onValueChange={setCampaignId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Generic — no campaign library
                      </SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The AI will pull approved scripts and objections from this campaign’s library when role-playing and scoring.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Difficulty</label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy — cooperative prospect</SelectItem>
                      <SelectItem value="medium">Medium — realistic pushback</SelectItem>
                      <SelectItem value="hard">Hard — tough objections</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Call mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={mode === "voice" ? "default" : "outline"}
                      onClick={() => setMode("voice")}
                      disabled={!voiceSupported}
                      className="justify-start"
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Voice
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "text" ? "default" : "outline"}
                      onClick={() => setMode("text")}
                      className="justify-start"
                    >
                      <Keyboard className="w-4 h-4 mr-2" />
                      Text
                    </Button>
                  </div>
                  {!voiceSupported && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Voice mode needs Chrome or Edge. Text mode works everywhere.
                    </p>
                  )}
                </div>
                <Button className="w-full" size="lg" onClick={startCall}>
                  <Phone className="w-4 h-4 mr-2" /> Start Call
                </Button>
              </div>
            </div>
          ) : result ? (
            <div className="p-6 flex-1 space-y-4">
              <div className="text-center">
                <Trophy className="w-12 h-12 mx-auto text-primary mb-2" />
                <h2 className="text-2xl font-bold">{result.score}/100</h2>
                {result.booked_appointment && (
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/30 mt-2">
                    Appointment booked
                  </Badge>
                )}
              </div>
              <Card className="p-4 bg-muted/30">
                <h3 className="font-semibold text-sm text-primary mb-1">Strengths</h3>
                <p className="text-sm">{result.strengths}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <h3 className="font-semibold text-sm text-amber-400 mb-1">Improvements</h3>
                <p className="text-sm">{result.improvements}</p>
              </Card>
              <Button className="w-full" onClick={resetCall}>
                New Practice Call
              </Button>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-medium">
                    {mode === "voice" ? "Live voice call" : "Live with AI prospect"}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {SCENARIOS.find((s) => s.value === scenario)?.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {difficulty}
                  </Badge>
                  {aiSpeaking && (
                    <Badge variant="outline" className="text-xs">
                      <Volume2 className="w-3 h-3 mr-1" /> Speaking
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => endCall()}
                  disabled={scoring || transcript.length === 0}
                >
                  <PhoneOff className="w-4 h-4 mr-1" />
                  {scoring ? "Scoring..." : "End & Score"}
                </Button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[500px]">
                {transcript.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    {mode === "voice"
                      ? "Tap the mic and say your opening line — the prospect will reply out loud."
                      : "Type your opening line below — you're calling the prospect."}
                  </div>
                )}
                {transcript.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm"
                      }`}
                    >
                      <div className="text-[10px] opacity-70 mb-0.5">
                        {m.role === "user" ? "You" : "Prospect"}
                      </div>
                      {m.content}
                    </div>
                  </div>
                ))}
                {listening && interim && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm text-sm bg-primary/30 text-foreground italic">
                      <div className="text-[10px] opacity-70 mb-0.5">You (listening…)</div>
                      {interim}
                    </div>
                  </div>
                )}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:100ms]" />
                        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:200ms]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {mode === "voice" ? (
                <div className="border-t border-border p-4 flex flex-col items-center gap-2">
                  <Button
                    type="button"
                    size="lg"
                    variant={listening ? "destructive" : "default"}
                    onClick={listening ? stopListening : startListening}
                    disabled={sending || aiSpeaking}
                    className="rounded-full w-16 h-16 p-0"
                  >
                    {listening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {aiSpeaking
                      ? "Prospect is talking…"
                      : listening
                      ? "Listening — tap again when done"
                      : sending
                      ? "Thinking…"
                      : "Tap to speak"}
                  </span>
                </div>
              ) : (
                <div className="border-t border-border p-3 flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type what you'd say on the phone..."
                    disabled={sending}
                  />
                  <Button onClick={() => sendMessage()} disabled={!input.trim() || sending}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Sidebar: history + coaching library */}
        <div className="space-y-4">
        <Card className="p-4 h-fit">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Recent sessions</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-2 rounded-md border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium capitalize">
                      {SCENARIOS.find((s) => s.value === h.scenario)?.label ?? h.scenario}
                    </span>
                    {h.score != null && (
                      <Badge
                        variant="outline"
                        className={
                          h.score >= 70
                            ? "bg-green-500/15 text-green-400 border-green-500/30"
                            : h.score >= 40
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-destructive/15 text-destructive border-destructive/30"
                        }
                      >
                        {h.score}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                    {h.difficulty} · {format(new Date(h.created_at), "MMM d, h:mm a")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Coaching library */}
        <Card className="p-4 h-fit">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Coaching library</h3>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {campaignId === "none"
                ? "Generic"
                : campaigns.find((c) => c.id === campaignId)?.name ?? "Campaign"}
            </Badge>
          </div>
          {materialsLoading ? (
            <p className="text-xs text-muted-foreground">Loading materials…</p>
          ) : materials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No materials yet. Admins can add scripts and objections in Campaign settings.
            </p>
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {(["script", "objection", "rebuttal", "talking_point", "qualification_question", "closing_line"] as const).map(
                (type) => {
                  const items = materials.filter((m) => m.material_type === type);
                  if (items.length === 0) return null;
                  const labels: Record<string, string> = {
                    script: "Scripts",
                    objection: "Objections",
                    rebuttal: "Rebuttals",
                    talking_point: "Talking points",
                    qualification_question: "Qualifying questions",
                    closing_line: "Closing lines",
                  };
                  const Icon =
                    type === "objection"
                      ? MessageSquareWarning
                      : type === "rebuttal" || type === "closing_line"
                      ? Quote
                      : BookOpen;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        <Icon className="w-3 h-3" /> {labels[type]} ({items.length})
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((m) => (
                          <li
                            key={m.id}
                            className="text-xs p-2 rounded-md border border-border bg-card"
                          >
                            <div className="font-medium">{m.title}</div>
                            {m.content && (
                              <div className="text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">
                                {m.content}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                },
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            The AI prospect uses these objections when pushing back, and the coach scores you against these scripts.
          </p>
        </Card>
        </div>
      </div>
    </div>
  );
}