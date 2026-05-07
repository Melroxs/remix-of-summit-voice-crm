import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, Calendar, Clock, FileText, Play, Square, Disc3, Bot,
  ArrowRight, User, Filter, RefreshCw, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface TimelineEntry {
  id: string;
  type: "call" | "callback" | "appointment";
  date: string;
  agentName: string | null;
  agentId: string | null;
  campaignName: string | null;
  // call-specific
  disposition?: string | null;
  durationSeconds?: number | null;
  callSource?: string | null;
  notes?: string | null;
  outboundNumber?: string | null;
  recording?: { id: string; duration_seconds: number | null } | null;
  aiSummary?: {
    summary: string;
    next_action: string | null;
    sentiment: string | null;
    call_outcome_summary?: string | null;
    generation_status?: string | null;
    error_message?: string | null;
  } | null;
  // callback-specific
  callbackAt?: string | null;
  callbackStatus?: string | null;
  callbackNotes?: string | null;
  priority?: number | null;
  // appointment-specific
  appointmentAt?: string | null;
  appointmentStatus?: string | null;
  appointmentNotes?: string | null;
  address?: string | null;
}

interface Props {
  contactId: string | null;
}

type FilterType = "all" | "call" | "callback" | "appointment";

export default function ContactActivityTimeline({ contactId }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [generatingAi, setGeneratingAi] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) { setEntries([]); return; }
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      // Fetch all data in parallel
      const [
        { data: logs },
        { data: callbacks },
        { data: appointments },
      ] = await Promise.all([
        supabase.from("call_attempts").select("*").eq("contact_id", contactId)
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("callbacks").select("*").eq("contact_id", contactId)
          .order("callback_at", { ascending: false }).limit(30),
        supabase.from("appointments").select("*").eq("contact_id", contactId)
          .order("appointment_at", { ascending: false }).limit(30),
      ]);

      if (cancelled) return;

      // Collect agent IDs for profile lookup
      const agentIds = new Set<string>();
      logs?.forEach(l => { if (l.agent_id) agentIds.add(l.agent_id); });
      callbacks?.forEach(c => { if (c.agent_id) agentIds.add(c.agent_id); });
      appointments?.forEach(a => { if (a.agent_id) agentIds.add(a.agent_id); });

      // Collect campaign IDs
      const campaignIds = new Set<string>();
      logs?.forEach(l => { if (l.campaign_id) campaignIds.add(l.campaign_id); });
      callbacks?.forEach(c => { if (c.campaign_id) campaignIds.add(c.campaign_id); });
      appointments?.forEach(a => { if (a.campaign_id) campaignIds.add(a.campaign_id); });

      // Fetch profiles, campaigns, recordings, AI summaries in parallel
      const logIds = (logs || []).map(l => l.id);
      const [profilesRes, campaignsRes, recsRes, aiRes] = await Promise.all([
        agentIds.size > 0
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", Array.from(agentIds))
          : { data: [] },
        campaignIds.size > 0
          ? supabase.from("campaigns").select("id, name").in("id", Array.from(campaignIds))
          : { data: [] },
        logIds.length > 0
          ? supabase.from("call_recordings").select("id, call_attempt_id, duration_seconds").in("call_attempt_id", logIds)
          : { data: [] },
        logIds.length > 0
          ? supabase.from("ai_summaries").select("call_attempt_id, summary, next_action, sentiment, call_outcome_summary, generation_status, error_message").in("call_attempt_id", logIds)
          : { data: [] },
      ]);

      if (cancelled) return;

      const profileMap = new Map<string, string>();
      (profilesRes.data || []).forEach((p: any) => {
        profileMap.set(p.user_id, p.display_name || p.email || "Unknown");
      });
      const campaignMap = new Map<string, string>();
      (campaignsRes.data || []).forEach((c: any) => campaignMap.set(c.id, c.name));
      const recMap = new Map<string, any>();
      (recsRes.data || []).forEach((r: any) => { if (r.call_attempt_id) recMap.set(r.call_attempt_id, r); });
      const aiMap = new Map<string, any>();
      (aiRes.data || []).forEach((s: any) => { if (s.call_attempt_id) aiMap.set(s.call_attempt_id, s); });

      const timeline: TimelineEntry[] = [];

      (logs || []).forEach(l => {
        const rec = recMap.get(l.id);
        const ai = aiMap.get(l.id);
        timeline.push({
          id: l.id,
          type: "call",
          date: l.created_at,
          agentName: l.agent_id ? profileMap.get(l.agent_id) || null : null,
          agentId: l.agent_id,
          campaignName: l.campaign_id ? campaignMap.get(l.campaign_id) || null : null,
          disposition: l.disposition,
          durationSeconds: l.duration_seconds,
          callSource: l.call_source,
          notes: l.notes,
          outboundNumber: l.outbound_number_used,
          recording: rec ? { id: rec.id, duration_seconds: rec.duration_seconds } : null,
          aiSummary: ai || null,
        });
      });

      (callbacks || []).forEach(cb => {
        timeline.push({
          id: cb.id,
          type: "callback",
          date: cb.created_at,
          agentName: cb.agent_id ? profileMap.get(cb.agent_id) || null : null,
          agentId: cb.agent_id,
          campaignName: cb.campaign_id ? campaignMap.get(cb.campaign_id) || null : null,
          callbackAt: cb.callback_at,
          callbackStatus: cb.status,
          callbackNotes: cb.notes,
          priority: cb.priority,
        });
      });

      (appointments || []).forEach(a => {
        timeline.push({
          id: a.id,
          type: "appointment",
          date: a.created_at,
          agentName: a.agent_id ? profileMap.get(a.agent_id) || null : null,
          agentId: a.agent_id,
          campaignName: a.campaign_id ? campaignMap.get(a.campaign_id) || null : null,
          appointmentAt: a.appointment_at,
          appointmentStatus: a.status,
          appointmentNotes: a.notes,
          address: [a.address, a.city, a.state, a.zip_code].filter(Boolean).join(", ") || null,
        });
      });

      // Sort newest first
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(timeline);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [contactId]);

  const handlePlay = async (recId: string) => {
    if (playingId === recId) { audioRef.current?.pause(); audioRef.current = null; setPlayingId(null); return; }
    audioRef.current?.pause();
    setPlayingId(recId);
    try {
      const { data } = await supabase.functions.invoke("get-recording-url", { body: { call_recording_id: recId } });
      if (!data?.url) { setPlayingId(null); return; }
      const audio = new Audio(data.url);
      audio.play();
      audio.onended = () => { setPlayingId(null); audioRef.current = null; };
      audioRef.current = audio;
    } catch { setPlayingId(null); }
  };

  const handleGenerateAi = async (callLogId: string, regenerate = false) => {
    setGeneratingAi(callLogId);
    try {
      const { data, error } = await supabase.functions.invoke("ai-call-summary", {
        body: { call_attempt_id: callLogId, regenerate },
      });
      if (error) {
        toast({ title: "AI Summary Error", description: error.message, variant: "destructive" });
      } else if (data?.error) {
        if (!data.existing) toast({ title: "AI Summary Error", description: data.error, variant: "destructive" });
      } else if (data?.summary) {
        setEntries(prev => prev.map(e =>
          e.id === callLogId ? { ...e, aiSummary: data.summary } : e
        ));
        toast({ title: "AI Summary Generated" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate AI summary", variant: "destructive" });
    }
    setGeneratingAi(null);
  };

  const filtered = filter === "all" ? entries : entries.filter(e => e.type === filter);

  const typeIcon = (type: string) => {
    switch (type) {
      case "call": return <Phone className="w-3 h-3" />;
      case "callback": return <Clock className="w-3 h-3" />;
      case "appointment": return <Calendar className="w-3 h-3" />;
      default: return <FileText className="w-3 h-3" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "call": return "text-primary";
      case "callback": return "text-amber-400";
      case "appointment": return "text-green-400";
      default: return "text-muted-foreground";
    }
  };

  if (!contactId) {
    return (
      <div className="text-center py-8">
        <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No contact selected</p>
        <p className="text-xs text-muted-foreground mt-1">Load a lead or dial a number to see history</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        <Filter className="w-3 h-3 text-muted-foreground mr-1" />
        {(["all", "call", "callback", "appointment"] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
              filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {f === "all" ? `All (${entries.length})` : `${f}s (${entries.filter(e => e.type === f).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading history…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No contact history found</p>
      ) : (
        <ScrollArea className="h-[400px] pr-2">
          <div className="space-y-2">
            {filtered.map(entry => (
              <div key={`${entry.type}-${entry.id}`} className="p-2.5 bg-muted/50 rounded border border-border/50 space-y-1.5">
                {/* Header row: type + date */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={typeColor(entry.type)}>{typeIcon(entry.type)}</span>
                    <span className="text-xs font-medium text-foreground capitalize">
                      {entry.type === "call"
                        ? entry.disposition?.replace(/_/g, " ") || "Call"
                        : entry.type}
                    </span>
                    {entry.callSource === "manual" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30">Manual</Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(entry.date), "MMM d, yyyy h:mm a")}
                  </span>
                </div>

                {/* Agent attribution */}
                <div className="flex items-center gap-1 text-[10px]">
                  <User className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {entry.agentName || "System"}
                  </span>
                  {entry.campaignName && (
                    <>
                      <span className="text-muted-foreground/50 mx-0.5">·</span>
                      <span className="text-muted-foreground">{entry.campaignName}</span>
                    </>
                  )}
                </div>

                {/* Call details */}
                {entry.type === "call" && (
                  <>
                    {entry.durationSeconds != null && (
                      <p className="text-[10px] text-muted-foreground">
                        {Math.floor(entry.durationSeconds / 60)}m {entry.durationSeconds % 60}s
                        {entry.outboundNumber && <span className="ml-2 font-mono">From: {entry.outboundNumber}</span>}
                      </p>
                    )}
                    {entry.notes && <p className="text-[10px] text-muted-foreground italic">{entry.notes}</p>}

                    {/* Recording */}
                    {entry.recording && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <button onClick={() => handlePlay(entry.recording!.id)}
                          className="flex items-center gap-1 text-primary hover:text-primary/80">
                          {playingId === entry.recording.id ? <><Square className="w-2.5 h-2.5" /> Stop</> : <><Play className="w-2.5 h-2.5" /> Play</>}
                        </button>
                        {entry.recording.duration_seconds && (
                          <span className="text-muted-foreground">
                            ({Math.floor(entry.recording.duration_seconds / 60)}:{String(entry.recording.duration_seconds % 60).padStart(2, "0")})
                          </span>
                        )}
                        <button onClick={async () => {
                          const { data } = await supabase.functions.invoke("get-recording-url", { body: { call_recording_id: entry.recording!.id } });
                          if (data?.url) window.open(data.url, "_blank");
                        }} className="text-muted-foreground hover:text-foreground ml-auto" title="Download">
                          <Disc3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}

                    {/* AI Summary */}
                    {entry.aiSummary ? (
                      entry.aiSummary.generation_status === "failed" ? (
                        <div className="p-1.5 bg-destructive/5 border border-destructive/10 rounded text-[10px] space-y-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-destructive font-medium"><AlertCircle className="w-2.5 h-2.5" />Summary Failed</div>
                            <button className="text-primary/60 hover:text-primary flex items-center gap-1"
                              disabled={generatingAi === entry.id} onClick={() => handleGenerateAi(entry.id, true)}>
                              <RefreshCw className="w-2.5 h-2.5" />{generatingAi === entry.id ? "Retrying..." : "Retry"}
                            </button>
                          </div>
                          {entry.aiSummary.error_message && <p className="text-muted-foreground">{entry.aiSummary.error_message}</p>}
                        </div>
                      ) : entry.aiSummary.generation_status === "processing" ? (
                        <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[10px]">
                          <div className="flex items-center gap-1 text-primary font-medium"><Bot className="w-2.5 h-2.5 animate-pulse" />Generating summary...</div>
                        </div>
                      ) : (
                        <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[10px] space-y-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-primary font-medium"><Bot className="w-2.5 h-2.5" />AI Summary</div>
                            <button className="text-muted-foreground hover:text-primary" title="Regenerate"
                              disabled={generatingAi === entry.id} onClick={() => handleGenerateAi(entry.id, true)}>
                              <RefreshCw className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {entry.aiSummary.call_outcome_summary && (
                            <p className="text-foreground font-medium">{entry.aiSummary.call_outcome_summary}</p>
                          )}
                          <p className="text-muted-foreground">{entry.aiSummary.summary}</p>
                          {entry.aiSummary.next_action && (
                            <p className="flex items-center gap-1 text-primary/80"><ArrowRight className="w-2.5 h-2.5" />{entry.aiSummary.next_action}</p>
                          )}
                          {entry.aiSummary.sentiment && <Badge variant="outline" className="text-[9px] px-1 py-0">{entry.aiSummary.sentiment}</Badge>}
                        </div>
                      )
                    ) : (
                      <button className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1"
                        disabled={generatingAi === entry.id} onClick={() => handleGenerateAi(entry.id)}>
                        <Bot className="w-2.5 h-2.5" />{generatingAi === entry.id ? "Generating..." : "Generate AI Summary"}
                      </button>
                    )}
                  </>
                )}

                {/* Callback details */}
                {entry.type === "callback" && (
                  <>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        Scheduled: {format(new Date(entry.callbackAt!), "MMM d, yyyy h:mm a")}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{entry.callbackStatus}</Badge>
                    </div>
                    {entry.callbackNotes && <p className="text-[10px] text-muted-foreground italic">{entry.callbackNotes}</p>}
                  </>
                )}

                {/* Appointment details */}
                {entry.type === "appointment" && (
                  <>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        {format(new Date(entry.appointmentAt!), "MMM d, yyyy h:mm a")}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{entry.appointmentStatus}</Badge>
                    </div>
                    {entry.address && <p className="text-[10px] text-muted-foreground">{entry.address}</p>}
                    {entry.appointmentNotes && <p className="text-[10px] text-muted-foreground italic">{entry.appointmentNotes}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
