import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneOutgoing, BellRing, PhoneCall, PhoneOff, ClipboardCheck } from "lucide-react";
import type { CallTimelineEntry, CallTimelineStage } from "@/hooks/useTelnyxDialer";
import { cn } from "@/lib/utils";

interface Props {
  entries: CallTimelineEntry[];
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

export default function CallTimeline({ entries }: Props) {
  const byStage = new Map<CallTimelineStage, CallTimelineEntry>();
  for (const e of entries) byStage.set(e.stage, e);

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