import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Disc3, Play, Download, Square, Search } from "lucide-react";
import { format } from "date-fns";
import { ReportFilters, type DateRange, rangeFromPreset } from "@/components/reports/ReportFilters";
import { EmptyState } from "@/components/reports/EmptyState";
import { exportToCsv } from "@/lib/export-csv";

interface RecordingRow {
  id: string;
  duration_seconds: number | null;
  format: string | null;
  created_at: string;
  call_attempt_id: string | null;
  has_audio: boolean;
  contact_name: string;
  agent_name: string;
  disposition: string | null;
  outcome: string | null;
  campaign_name: string | null;
  campaign_id: string | null;
  agent_id: string | null;
}

function fmtDuration(s: number | null) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Recordings() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(30));
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedDispo, setSelectedDispo] = useState("all");
  const [search, setSearch] = useState("");

  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reference data
  useEffect(() => {
    Promise.all([
      supabase.from("campaigns").select("id, name").order("name"),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
    ]).then(([camps, profs]) => {
      setCampaigns(camps.data || []);
      setAgents(profs.data || []);
    });
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Fetch recordings
  useEffect(() => {
    const fromIso = new Date(range.from).toISOString();
    const toIso = new Date(new Date(range.to).setHours(23, 59, 59, 999)).toISOString();

    const fetchRecordings = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("call_recordings")
        .select(
          "id, duration_seconds, format, created_at, call_attempt_id, telnyx_recording_id, recording_url, " +
          "call_attempts!inner(disposition, outcome, agent_id, campaign_id, contacts(first_name, last_name), campaigns(name))"
        )
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(500);

      const rows: RecordingRow[] = (data || []).map((r: any) => {
        const ca = r.call_attempts || {};
        const contact = ca.contacts;
        const agentProfile = agents.find((a) => a.user_id === ca.agent_id);
        return {
          id: r.id,
          duration_seconds: r.duration_seconds,
          format: r.format,
          created_at: r.created_at,
          call_attempt_id: r.call_attempt_id,
          has_audio: Boolean(r.telnyx_recording_id || r.recording_url),
          contact_name: contact ? `${contact.first_name} ${contact.last_name}` : "Unknown",
          agent_name: agentProfile?.display_name || agentProfile?.email?.split("@")[0] || "—",
          disposition: ca.disposition || null,
          outcome: ca.outcome || null,
          campaign_name: ca.campaigns?.name || null,
          campaign_id: ca.campaign_id || null,
          agent_id: ca.agent_id || null,
        };
      });
      setRecordings(rows);
      setLoading(false);
    };
    fetchRecordings();
  }, [range, agents]);

  // Available dispositions in this dataset
  const dispositionOptions = useMemo(() => {
    const set = new Set<string>();
    recordings.forEach((r) => r.disposition && set.add(r.disposition));
    return Array.from(set).sort();
  }, [recordings]);

  // Apply client-side filters
  const filtered = useMemo(() => {
    return recordings.filter((r) => {
      if (selectedCampaign !== "all" && r.campaign_id !== selectedCampaign) return false;
      if (selectedAgent !== "all" && r.agent_id !== selectedAgent) return false;
      if (selectedDispo !== "all" && r.disposition !== selectedDispo) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !r.contact_name.toLowerCase().includes(s) &&
          !r.agent_name.toLowerCase().includes(s) &&
          !(r.campaign_name || "").toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [recordings, selectedCampaign, selectedAgent, selectedDispo, search]);

  const getSecureUrl = async (recordingId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("get-recording-url", {
        body: { call_recording_id: recordingId },
      });
      if (error || !data?.url) return null;
      return data.url;
    } catch {
      return null;
    }
  };

  const handlePlay = async (rec: RecordingRow) => {
    if (playingId === rec.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingId(rec.id);
    const url = await getSecureUrl(rec.id);
    if (!url) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audioRef.current = audio;
  };

  const handleDownload = async (rec: RecordingRow) => {
    const url = await getSecureUrl(rec.id);
    if (url) window.open(url, "_blank");
  };

  const handleExport = () => {
    exportToCsv(
      `recordings-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}`,
      filtered.map((r) => ({
        date: format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
        contact: r.contact_name,
        agent: r.agent_name,
        campaign: r.campaign_name || "",
        disposition: r.disposition || "",
        outcome: r.outcome || "",
        duration_seconds: r.duration_seconds || 0,
        has_audio: r.has_audio ? "yes" : "no",
      })),
      [
        { key: "date", label: "Date" },
        { key: "contact", label: "Contact" },
        { key: "agent", label: "Agent" },
        { key: "campaign", label: "Campaign" },
        { key: "disposition", label: "Disposition" },
        { key: "outcome", label: "Outcome" },
        { key: "duration_seconds", label: "Duration (s)" },
        { key: "has_audio", label: "Audio Available" },
      ],
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Recordings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {loading ? "Loading…" : `${filtered.length} of ${recordings.length} recordings in range`}
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
            placeholder="Search contact, agent, or campaign"
            className="pl-9 h-9 w-[260px]"
          />
        </div>
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
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
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="All dispositions" />
          </SelectTrigger>
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Disc3}
              title="No recordings match your filters"
              description="Try widening the date range, clearing filters, or making more calls."
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={!r.has_audio}
                      onClick={() => handlePlay(r)}
                      title={r.has_audio ? "Play recording" : "No audio available"}
                    >
                      {playingId === r.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-foreground truncate">{r.contact_name}</p>
                        {!r.has_audio && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmtDuration(r.duration_seconds)} • {r.disposition?.replace(/_/g, " ") || r.outcome?.replace(/_/g, " ") || "—"} •
                        {" "}{r.agent_name} • {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                      {r.campaign_name && (
                        <p className="text-xs text-muted-foreground/70 truncate">{r.campaign_name}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleDownload(r)}
                    disabled={!r.has_audio}
                    title={r.has_audio ? "Download" : "No audio available"}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}