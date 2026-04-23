import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Disc3, Play, Download, Square } from "lucide-react";
import { format } from "date-fns";

interface RecordingRow {
  id: string;
  recording_url: string | null;
  duration_seconds: number | null;
  format: string | null;
  created_at: string;
  call_attempt_id: string | null;
  contact_name: string;
  disposition: string | null;
  campaign_name: string | null;
}

export default function Recordings() {
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
  }, []);

  useEffect(() => {
    const fetchRecordings = async () => {
      setLoading(true);
      let query = supabase
        .from("call_recordings")
        .select("id, duration_seconds, format, created_at, call_attempt_id, telnyx_recording_id, call_attempts(disposition, campaign_id, contacts(first_name, last_name), campaigns(name))")
        .order("created_at", { ascending: false })
        .limit(100);

      const { data } = await query;
      let rows: RecordingRow[] = (data || []).map((r: any) => ({
        id: r.id,
        recording_url: r.telnyx_recording_id ? "secure" : null,
        duration_seconds: r.duration_seconds,
        format: r.format,
        created_at: r.created_at,
        call_attempt_id: r.call_attempt_id,
        contact_name: r.call_logs?.contacts
          ? `${r.call_logs.contacts.first_name} ${r.call_logs.contacts.last_name}`
          : "Unknown",
        disposition: r.call_logs?.disposition || null,
        campaign_name: r.call_logs?.campaigns?.name || null,
      }));

      if (selectedCampaign !== "all") {
        // Filter client-side since nested filtering is complex
        const campaignName = campaigns.find((c) => c.id === selectedCampaign)?.name;
        rows = rows.filter((r) => r.campaign_name === campaignName);
      }

      setRecordings(rows);
      setLoading(false);
    };
    fetchRecordings();
  }, [selectedCampaign, campaigns]);

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
    if (!url) { setPlayingId(null); return; }
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audioRef.current = audio;
  };

  const handleDownload = async (rec: RecordingRow) => {
    const url = await getSecureUrl(rec.id);
    if (url) window.open(url, "_blank");
  };

  const formatDuration = (s: number | null) => {
    if (!s) return "0:00";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recordings</h1>
          <p className="text-muted-foreground text-sm mt-1">Listen to and download call recordings</p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-8">
              <Disc3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No recordings yet. Recordings will appear here after calls.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recordings.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={!r.recording_url}
                      onClick={() => handlePlay(r)}
                    >
                      {playingId === r.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div>
                      <p className="font-medium text-sm text-foreground">{r.contact_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(r.duration_seconds)} • {r.disposition?.replace(/_/g, " ") || "—"} • {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                      {r.campaign_name && (
                        <p className="text-xs text-muted-foreground/70">{r.campaign_name}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => handleDownload(r)}>
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
