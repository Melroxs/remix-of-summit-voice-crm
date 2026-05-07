import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Play, Square, Download, Search, PhoneOff } from "lucide-react";
import { format } from "date-fns";
import { ReportFilters, type DateRange, rangeFromPreset } from "@/components/reports/ReportFilters";
import { EmptyState } from "@/components/reports/EmptyState";
import { exportToCsv } from "@/lib/export-csv";

interface CallRow {
  id: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  outcome: string | null;
  to_number: string | null;
  from_number: string | null;
  agent_id: string | null;
  campaign_id: string | null;
  contact_name: string;
  agent_name: string;
  campaign_name: string | null;
  recording_id: string | null;
  has_recording: boolean;
  telnyx_call_id: string | null;
}

const dispoVariant = (d: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (!d) return "outline";
  if (["appointment_booked", "connected", "already_customer"].includes(d)) return "default";
  if (["dnc", "wrong_number", "not_interested"].includes(d)) return "destructive";
  return "secondary";
};

const fmtDur = (s: number | null) => {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function CallLogs() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(7));
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedDispo, setSelectedDispo] = useState("all");
  const [search, setSearch] = useState("");

  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("campaigns").select("id, name").order("name"),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
    ]).then(([camps, profs]) => {
      setCampaigns(camps.data || []);
      setAgents(profs.data || []);
    });
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  useEffect(() => {
    const fromIso = new Date(range.from).toISOString();
    const toIso = new Date(new Date(range.to).setHours(23, 59, 59, 999)).toISOString();

    const fetchCalls = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("call_attempts")
        .select(
          "id, created_at, started_at, ended_at, duration_seconds, disposition, outcome, to_number, from_number, " +
          "agent_id, campaign_id, telnyx_call_id, contacts(first_name, last_name), campaigns(name), " +
          "call_recordings(id, telnyx_recording_id, recording_url)"
        )
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(500);

      const rows: CallRow[] = (data || []).map((c: any) => {
        const rec = Array.isArray(c.call_recordings) ? c.call_recordings[0] : c.call_recordings;
        const agentProfile = agents.find((a) => a.user_id === c.agent_id);
        return {
          id: c.id,
          created_at: c.created_at,
          started_at: c.started_at,
          ended_at: c.ended_at,
          duration_seconds: c.duration_seconds,
          disposition: c.disposition,
          outcome: c.outcome,
          to_number: c.to_number,
          from_number: c.from_number,
          agent_id: c.agent_id,
          campaign_id: c.campaign_id,
          contact_name: c.contacts ? `${c.contacts.first_name} ${c.contacts.last_name}` : "Unknown",
          agent_name: agentProfile?.display_name || agentProfile?.email?.split("@")[0] || "—",
          campaign_name: c.campaigns?.name || null,
          recording_id: rec?.id || null,
          has_recording: Boolean(rec?.telnyx_recording_id || rec?.recording_url),
          telnyx_call_id: c.telnyx_call_id,
        };
      });
      setCalls(rows);
      setLoading(false);
    };
    fetchCalls();
  }, [range, agents]);

  const dispositionOptions = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => c.disposition && set.add(c.disposition));
    return Array.from(set).sort();
  }, [calls]);

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (selectedCampaign !== "all" && c.campaign_id !== selectedCampaign) return false;
      if (selectedAgent !== "all" && c.agent_id !== selectedAgent) return false;
      if (selectedDispo !== "all" && c.disposition !== selectedDispo) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !c.contact_name.toLowerCase().includes(s) &&
          !c.agent_name.toLowerCase().includes(s) &&
          !(c.campaign_name || "").toLowerCase().includes(s) &&
          !(c.to_number || "").includes(s)
        ) return false;
      }
      return true;
    });
  }, [calls, selectedCampaign, selectedAgent, selectedDispo, search]);

  const getSecureUrl = async (recordingId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("get-recording-url", {
        body: { call_recording_id: recordingId },
      });
      if (error || !data?.url) return null;
      return data.url;
    } catch { return null; }
  };

  const handlePlay = async (c: CallRow) => {
    if (!c.recording_id) return;
    if (playingId === c.id) {
      audioRef.current?.pause(); audioRef.current = null; setPlayingId(null); return;
    }
    audioRef.current?.pause();
    setPlayingId(c.id);
    const url = await getSecureUrl(c.recording_id);
    if (!url) { setPlayingId(null); return; }
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audioRef.current = audio;
  };

  const handleDownload = async (c: CallRow) => {
    if (!c.recording_id) return;
    const url = await getSecureUrl(c.recording_id);
    if (url) window.open(url, "_blank");
  };

  const handleExport = () => {
    exportToCsv(
      `call-logs-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}`,
      filtered.map((c) => ({
        date: format(new Date(c.created_at), "yyyy-MM-dd HH:mm"),
        contact: c.contact_name,
        to_number: c.to_number || "",
        from_number: c.from_number || "",
        agent: c.agent_name,
        campaign: c.campaign_name || "",
        disposition: c.disposition || "",
        outcome: c.outcome || "",
        duration_seconds: c.duration_seconds || 0,
        recording: c.has_recording ? "yes" : "no",
        telnyx_call_id: c.telnyx_call_id || "",
      })),
      [
        { key: "date", label: "Date" },
        { key: "contact", label: "Contact" },
        { key: "to_number", label: "To" },
        { key: "from_number", label: "From" },
        { key: "agent", label: "Agent" },
        { key: "campaign", label: "Campaign" },
        { key: "disposition", label: "Disposition" },
        { key: "outcome", label: "Outcome" },
        { key: "duration_seconds", label: "Duration (s)" },
        { key: "recording", label: "Recording" },
        { key: "telnyx_call_id", label: "Telnyx Call ID" },
      ],
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Call Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {loading ? "Loading…" : `${filtered.length} of ${calls.length} calls in range`}
        </p>
      </div>

      <ReportFilters
        range={range}
        onRangeChange={setRange}
        campaigns={campaigns}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onExport={handleExport}
        exportLabel="Export CSV"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contact, agent, number"
            className="pl-9 h-9 w-[260px]"
          />
        </div>
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="All agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                {a.display_name || a.email?.split("@")[0] || a.user_id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedDispo} onValueChange={setSelectedDispo}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="All dispositions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dispositions</SelectItem>
            {dispositionOptions.map((d) => (
              <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={PhoneOff}
              title="No calls match your filters"
              description="Try widening the date range or clearing filters."
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/60 rounded-lg transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm text-foreground truncate">{c.contact_name}</p>
                        {c.disposition && (
                          <Badge variant={dispoVariant(c.disposition)} className="text-xs">
                            {c.disposition.replace(/_/g, " ")}
                          </Badge>
                        )}
                        {!c.disposition && c.outcome && (
                          <Badge variant="outline" className="text-xs">{c.outcome.replace(/_/g, " ")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.to_number || "—"} • {fmtDur(c.duration_seconds)} • {c.agent_name} •{" "}
                        {format(new Date(c.created_at), "MMM d, h:mm a")}
                        {c.campaign_name && ` • ${c.campaign_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!c.has_recording}
                      onClick={() => handlePlay(c)}
                      title={c.has_recording ? "Play recording" : "No recording"}
                    >
                      {playingId === c.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!c.has_recording}
                      onClick={() => handleDownload(c)}
                      title={c.has_recording ? "Download recording" : "No recording"}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
