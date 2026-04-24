import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, RefreshCw, User, History, Gauge, Phone, Users, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TickRow {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  metadata: Record<string, any> | null;
  actor_name?: string | null;
}

interface Props {
  campaignId: string;
  /** Set false to render the panel as a child without the wrapping <Card>. */
  asCard?: boolean;
  /** How many entries to load per page. Default 50. */
  pageSize?: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtPct(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // Stored as 0..1 ratio in metadata
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Admin-facing audit log of every predictive engine tick for a campaign.
 * Reads from public.audit_events (event_type = 'predictive_engine.ticked').
 * RLS already restricts non-admin/non-manager users from seeing these rows.
 */
export default function PredictiveTickAuditLog({
  campaignId,
  asCard = true,
  pageSize = 50,
}: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TickRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_events")
      .select("id, occurred_at, actor_id, actor_role, metadata")
      .eq("event_type", "predictive_engine.ticked")
      .eq("entity_type", "campaign")
      .eq("entity_id", campaignId)
      .order("occurred_at", { ascending: false })
      .limit(pageSize);

    if (error) {
      toast({
        title: "Failed to load tick history",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const events = (data || []) as TickRow[];
    const actorIds = Array.from(
      new Set(events.map((e) => e.actor_id).filter((id): id is string => !!id)),
    );

    const nameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", actorIds);
      (profiles || []).forEach((p: any) => {
        nameMap.set(p.user_id, p.display_name || p.email || p.user_id);
      });
    }

    setRows(
      events.map((e) => ({
        ...e,
        actor_name: e.actor_id ? nameMap.get(e.actor_id) || null : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPlaced = rows.reduce((acc, r) => acc + (Number(r.metadata?.placed) || 0), 0);
    const totalTarget = rows.reduce((acc, r) => acc + (Number(r.metadata?.target) || 0), 0);
    return { totalPlaced, totalTarget, count: rows.length };
  }, [rows]);

  const body = (
    <>
      {summary && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
          <span>
            <span className="font-medium text-foreground">{summary.count}</span> ticks
          </span>
          <span>·</span>
          <span>
            Placed{" "}
            <span className="font-medium text-foreground">{summary.totalPlaced}</span> /{" "}
            <span className="font-medium text-foreground">{summary.totalTarget}</span> target
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Loading tick history…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No predictive ticks recorded for this campaign yet.
        </p>
      ) : (
        <ScrollArea className="max-h-[60vh] pr-3">
          <ul className="space-y-2">
            {rows.map((row) => {
              const m = row.metadata || {};
              const placed = Number(m.placed) || 0;
              const target = Number(m.target) || 0;
              const ratio = target > 0 ? Math.min(100, Math.round((placed / target) * 100)) : 0;
              const connectPct = fmtPct(m.connect_rate);
              const abandonPct = fmtPct(m.abandon_rate);
              const threshold = Number(m.connect_threshold_pct);
              const connectNum =
                typeof m.connect_rate === "number" ? m.connect_rate * 100 : null;
              const connectLow =
                Number.isFinite(threshold) && connectNum != null && connectNum < threshold;
              const reason = typeof m.reason === "string" ? m.reason : null;
              return (
                <li
                  key={row.id}
                  className="p-3 rounded-md border border-border bg-card"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          Placed {placed} of {target}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {ratio}% of target
                        </Badge>
                        {row.actor_role && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {row.actor_role}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <User className="h-3 w-3" />
                        <span>{row.actor_name || row.actor_id || "Unknown user"}</span>
                        <span>·</span>
                        <span>{formatDateTime(row.occurred_at)}</span>
                      </div>

                      {/* Metric snapshot */}
                      <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                        {m.available_agents != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Users className="h-3 w-3" /> Agents{" "}
                            <span className="font-medium text-foreground">
                              {m.available_agents}
                            </span>
                          </span>
                        )}
                        {m.active_calls != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" /> Active{" "}
                            <span className="font-medium text-foreground">
                              {m.active_calls}
                            </span>
                          </span>
                        )}
                        {m.pacing_ratio != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Gauge className="h-3 w-3" /> Pacing{" "}
                            <span className="font-medium text-foreground">
                              {Number(m.pacing_ratio).toFixed(2)}
                            </span>
                          </span>
                        )}
                        {connectPct && (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              connectLow ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            {connectLow && <TrendingDown className="h-3 w-3" />}
                            Connect{" "}
                            <span className="font-medium">{connectPct}</span>
                          </span>
                        )}
                        {abandonPct && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            Abandon{" "}
                            <span className="font-medium text-foreground">{abandonPct}</span>
                          </span>
                        )}
                      </div>

                      {reason && (
                        <div className="mt-2 text-xs text-foreground/80 border-l-2 border-border pl-2 italic">
                          “{reason}”
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </>
  );

  if (!asCard) return body;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5" /> Predictive Tick Audit Log
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}