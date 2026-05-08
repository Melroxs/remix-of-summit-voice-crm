import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  contactId: string | null;
}

interface AttemptRow {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  disposition: string | null;
  outcome: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  recording_url?: string | null;
  ai_summary?: string | null;
  ai_sentiment?: string | null;
}

function formatDuration(secs: number | null) {
  if (!secs || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CallHistoryPanel({ contactId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [openSummaries, setOpenSummaries] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !contactId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: attempts, error } = await supabase
          .from("call_attempts")
          .select("id, created_at, duration_seconds, disposition, outcome, agent_id")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false });
        if (error) throw error;

        const attemptIds = (attempts ?? []).map((a) => a.id);
        const agentIds = Array.from(
          new Set((attempts ?? []).map((a) => a.agent_id).filter(Boolean) as string[])
        );

        const [recRes, sumRes, profRes] = await Promise.all([
          attemptIds.length
            ? supabase
                .from("call_recordings")
                .select("call_attempt_id, recording_url, download_url")
                .in("call_attempt_id", attemptIds)
            : Promise.resolve({ data: [], error: null } as any),
          attemptIds.length
            ? supabase
                .from("ai_summaries")
                .select("call_attempt_id, summary, sentiment")
                .in("call_attempt_id", attemptIds)
            : Promise.resolve({ data: [], error: null } as any),
          agentIds.length
            ? supabase
                .from("profiles")
                .select("user_id, display_name, email")
                .in("user_id", agentIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        const recMap = new Map<string, string>();
        for (const r of (recRes.data ?? []) as any[]) {
          const url = r.recording_url || r.download_url;
          if (url && !recMap.has(r.call_attempt_id)) recMap.set(r.call_attempt_id, url);
        }
        const sumMap = new Map<string, { summary: string; sentiment: string | null }>();
        for (const s of (sumRes.data ?? []) as any[]) {
          if (!sumMap.has(s.call_attempt_id))
            sumMap.set(s.call_attempt_id, { summary: s.summary, sentiment: s.sentiment });
        }
        const profMap = new Map<string, string>();
        for (const p of (profRes.data ?? []) as any[]) {
          profMap.set(p.user_id, p.display_name || p.email || "Unknown");
        }

        const merged: AttemptRow[] = (attempts ?? []).map((a) => ({
          ...a,
          agent_name: a.agent_id ? profMap.get(a.agent_id) ?? "Unknown" : "—",
          recording_url: recMap.get(a.id) ?? null,
          ai_summary: sumMap.get(a.id)?.summary ?? null,
          ai_sentiment: sumMap.get(a.id)?.sentiment ?? null,
        }));

        if (!cancelled) setRows(merged);
      } catch (e) {
        console.error("[CallHistoryPanel] load error", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, contactId]);

  if (!contactId) return null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="w-4 h-4 text-primary" />
            Call History
            {rows.length > 0 && (
              <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No previous call attempts
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="border border-border rounded-md p-3 space-y-2 bg-card/50"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, yyyy • h:mm a")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatDuration(row.duration_seconds)}
                      </Badge>
                      {(row.disposition || row.outcome) && (
                        <Badge variant="secondary" className="text-xs">
                          {row.disposition || row.outcome}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Agent: <span className="text-foreground">{row.agent_name}</span>
                  </div>

                  {row.recording_url && (
                    <audio controls preload="none" className="w-full h-8">
                      <source src={row.recording_url} />
                      Your browser does not support audio playback.
                    </audio>
                  )}

                  {row.ai_summary && (
                    <Collapsible
                      open={!!openSummaries[row.id]}
                      onOpenChange={(v) =>
                        setOpenSummaries((s) => ({ ...s, [row.id]: v }))
                      }
                    >
                      <CollapsibleTrigger className="w-full flex items-center justify-between text-xs text-primary hover:underline">
                        <span>AI Summary</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${openSummaries[row.id] ? "rotate-180" : ""}`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 space-y-2">
                        {row.ai_sentiment && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {row.ai_sentiment}
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {row.ai_summary}
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}