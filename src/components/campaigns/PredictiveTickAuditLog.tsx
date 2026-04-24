import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Activity, RefreshCw, User, History, Gauge, Phone, Users, TrendingDown, Loader2 } from "lucide-react";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedRow, setSelectedRow] = useState<TickRow | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Fetch one page of audit events. When `before` is set, returns only rows
   * older than that timestamp (used for "Load more"). Otherwise refreshes
   * the list from the most recent tick.
   */
  const fetchPage = async (before?: string): Promise<TickRow[] | null> => {
    let query = supabase
      .from("audit_events")
      .select("id, occurred_at, actor_id, actor_role, metadata")
      .eq("event_type", "predictive_engine.ticked")
      .eq("entity_type", "campaign")
      .eq("entity_id", campaignId)
      .order("occurred_at", { ascending: false })
      .limit(pageSize);

    if (before) {
      query = query.lt("occurred_at", before);
    }

    const { data, error } = await query;
    if (error) {
      toast({
        title: "Failed to load tick history",
        description: error.message,
        variant: "destructive",
      });
      return null;
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

    return events.map((e) => ({
      ...e,
      actor_name: e.actor_id ? nameMap.get(e.actor_id) || null : null,
    }));
  };

  const load = async () => {
    setLoading(true);
    const page = await fetchPage();
    if (page) {
      setRows(page);
      setHasMore(page.length === pageSize);
    }
    setLoading(false);
  };

  const loadMore = async () => {
    const oldest = rows[rows.length - 1]?.occurred_at;
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    const page = await fetchPage(oldest);
    if (page) {
      // De-dupe by id in case of clock collisions on the boundary row
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of page) if (!seen.has(r.id)) merged.push(r);
        return merged;
      });
      setHasMore(page.length === pageSize);
    }
    setLoadingMore(false);
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

  // Canonical list of fields we record on each predictive tick. Keeps the
  // detail drawer consistent and makes missing/null fields explicit.
  const KNOWN_METRIC_FIELDS: { key: string; label: string }[] = [
    { key: "source", label: "Source" },
    { key: "reason", label: "Reason" },
    { key: "auto_tick_interval_sec", label: "Auto-tick interval (s)" },
    { key: "placed", label: "Placed" },
    { key: "target", label: "Target" },
    { key: "available_agents", label: "Available agents" },
    { key: "active_calls", label: "Active calls" },
    { key: "pacing_ratio", label: "Pacing ratio" },
    { key: "abandon_rate", label: "Abandon rate" },
    { key: "connect_rate", label: "Connect rate" },
    { key: "connect_threshold_pct", label: "Connect alert threshold (%)" },
    { key: "ticked_at", label: "Ticked at (client)" },
  ];

  const renderFieldValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  };

  const handleCopyJson = async () => {
    if (!selectedRow) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedRow.metadata ?? {}, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy JSON to clipboard.",
        variant: "destructive",
      });
    }
  };

  // Extra metadata keys not in our canonical list (forward-compatibility)
  const extraMetadataKeys = useMemo(() => {
    if (!selectedRow?.metadata) return [];
    const known = new Set(KNOWN_METRIC_FIELDS.map((f) => f.key));
    return Object.keys(selectedRow.metadata).filter((k) => !known.has(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow]);

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
                  className="p-3 rounded-md border border-border bg-card cursor-pointer transition-colors hover:bg-accent/40 hover:border-primary/40 focus-within:ring-1 focus-within:ring-ring"
                  onClick={() => setSelectedRow(row)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedRow(row);
                    }
                  }}
                  aria-label="View full tick metrics snapshot"
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
          <div className="pt-3 pb-1 flex items-center justify-center">
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Loading…
                  </>
                ) : (
                  <>Load older ticks</>
                )}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                End of history — {rows.length} tick{rows.length === 1 ? "" : "s"} loaded
              </span>
            )}
          </div>
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