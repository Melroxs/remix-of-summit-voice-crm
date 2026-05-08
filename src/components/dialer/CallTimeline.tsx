import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneOutgoing, BellRing, PhoneCall, PhoneOff, ClipboardCheck } from "lucide-react";
import type { CallTimelineEntry, CallTimelineStage } from "@/hooks/useTelnyxDialer";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  entries: CallTimelineEntry[];
  telnyxCallId?: string | null;
}

const STAGE_META: Record<
  CallTimelineStage,
  { label: string; icon: typeof PhoneOutgoing; color: string }
> = {
  initiated:   { label: "Initiated",   icon: PhoneOutgoing,    color: "text-muted-foreground" },
  ringing:     { label: "Ringing",     icon: BellRing,         color: "text-status-calling" },
  active:      { label: "Active",      icon: PhoneCall,        color: "text-success" },
  hangup:      { label: "Hangup",      icon: PhoneOff,         color: "text-status-wrong-number" },
  disposition: { label: "Disposition", icon: ClipboardCheck,   color: "text-accent" },
};

const ORDER: CallTimelineStage[] = ["initiated", "ringing", "active", "hangup", "disposition"];

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

const DB_EVENT_MAP: Record<string, { stage: CallTimelineStage; detail?: string } | null> = {
  initiated:           { stage: "initiated" },
  ringing:             { stage: "ringing" },
  answered:            { stage: "active" },
  hangup_local:        { stage: "hangup", detail: "ended by agent" },
  hangup_remote:       { stage: "hangup", detail: "ended by callee" },
  no_answer:           { stage: "hangup", detail: "no answer" },
  voicemail:           { stage: "hangup", detail: "voicemail" },
  busy:                { stage: "hangup", detail: "busy" },
  failed:              { stage: "hangup", detail: "failed" },
  // ignore: dtmf, recording_started, recording_completed, transferred
  dtmf: null, recording_started: null, recording_completed: null, transferred: null,
};

export default function CallTimeline({ entries, telnyxCallId }: Props) {
  const [dbEntries, setDbEntries] = useState<CallTimelineEntry[]>([]);

  // Load + subscribe to stored call_events for this Telnyx call.
  useEffect(() => {
    setDbEntries([]);
    if (!telnyxCallId) return;
    let attemptId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: attempt } = await supabase
        .from("call_attempts")
        .select("id")
        .eq("telnyx_call_id", telnyxCallId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !attempt?.id) return;
      attemptId = attempt.id;

      const { data: events } = await supabase
        .from("call_events")
        .select("event_type, occurred_at")
        .eq("call_attempt_id", attemptId)
        .order("occurred_at", { ascending: true });
      if (cancelled) return;
      setDbEntries(
        (events || [])
          .map((e: any) => {
            const m = DB_EVENT_MAP[e.event_type];
            return m ? { stage: m.stage, at: e.occurred_at, detail: m.detail } : null;
          })
          .filter(Boolean) as CallTimelineEntry[]
      );

      channel = supabase
        .channel(`call-events-${attemptId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "call_events", filter: `call_attempt_id=eq.${attemptId}` },
          (payload) => {
            const row: any = payload.new;
            const m = DB_EVENT_MAP[row.event_type];
            if (!m) return;
            setDbEntries((prev) => [...prev, { stage: m.stage, at: row.occurred_at, detail: m.detail }]);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [telnyxCallId]);

  // Merge live SDK entries with stored DB events; DB wins per stage when present.
  const merged = useMemo(() => {
    const byStage = new Map<CallTimelineStage, CallTimelineEntry>();
    for (const e of entries) byStage.set(e.stage, e);
    for (const e of dbEntries) byStage.set(e.stage, e);
    return byStage;
  }, [entries, dbEntries]);

  const hasAny = merged.size > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Call Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No call in progress.</p>
        ) : (
          <ol className="relative space-y-3 ps-4 border-s border-border">
            {ORDER.map((stage) => {
              const meta = STAGE_META[stage];
              const entry = byStage.get(stage);
              const reached = !!entry;
              const Icon = meta.icon;
              return (
                <li key={stage} className="relative">
                  <span
                    className={cn(
                      "absolute -start-[21px] flex h-4 w-4 items-center justify-center rounded-full border bg-background",
                      reached ? "border-current " + meta.color : "border-border text-muted-foreground/40"
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={cn("text-xs font-medium", reached ? meta.color : "text-muted-foreground/60")}>
                        {meta.label}
                      </p>
                      {entry?.detail && (
                        <p className="text-[10px] text-muted-foreground">{entry.detail}</p>
                      )}
                    </div>
                    {entry && (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatTime(entry.at)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}