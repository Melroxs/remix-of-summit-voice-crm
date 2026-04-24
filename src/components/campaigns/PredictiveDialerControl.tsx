import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Activity, Loader2, RefreshCw, Phone, Users, Gauge, AlertTriangle } from "lucide-react";
import { tickPredictiveEngine, DialerValidationError } from "@/lib/dialer-service";

interface Metrics {
  placed: number;
  target: number;
  available_agents: number;
  active_calls: number;
  pacing_ratio: number;
  abandon_rate?: number;
  ticked_at: string;
}

interface Props {
  campaignId: string;
  /** When false, the tick button is disabled (e.g. campaign paused). */
  enabled?: boolean;
}

/**
 * Manual control panel for the predictive dialer engine.
 * Lets a manager/admin tick the engine on demand and shows the latest pacing metrics.
 */
export default function PredictiveDialerControl({ campaignId, enabled = true }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTick = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await tickPredictiveEngine(campaignId);
      setMetrics({ ...data, ticked_at: new Date().toISOString() });
      toast({
        title: "Predictive engine ticked",
        description: `Placed ${data.placed} of ${data.target} target calls`,
      });
    } catch (e: any) {
      const msg =
        e instanceof DialerValidationError
          ? e.message
          : e?.message || "Failed to tick predictive engine";
      setError(msg);
      toast({ title: "Predictive tick failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const abandonPct =
    metrics?.abandon_rate != null ? (metrics.abandon_rate * 100).toFixed(1) : null;
  const abandonHigh = metrics?.abandon_rate != null && metrics.abandon_rate > 0.03;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5" /> Predictive Dialer
        </CardTitle>
        <Button size="sm" onClick={handleTick} disabled={loading || !enabled}>
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          {metrics ? "Tick again" : "Tick engine"}
        </Button>
      </CardHeader>
      <CardContent>
        {!enabled && (
          <p className="text-xs text-muted-foreground mb-3">
            Engine is disabled while the campaign is not active.
          </p>
        )}
        {!metrics && !error && (
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">Tick engine</span> to manually
            advance the predictive dialer for this campaign.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
        {metrics && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Metric
                icon={<Phone className="w-4 h-4" />}
                label="Placed"
                value={String(metrics.placed)}
                accent="text-primary"
              />
              <Metric
                icon={<Gauge className="w-4 h-4" />}
                label="Target"
                value={String(metrics.target)}
              />
              <Metric
                icon={<Users className="w-4 h-4" />}
                label="Available agents"
                value={String(metrics.available_agents)}
              />
              <Metric
                icon={<Activity className="w-4 h-4" />}
                label="Active calls"
                value={String(metrics.active_calls)}
              />
              <Metric
                icon={<Gauge className="w-4 h-4" />}
                label="Pacing ratio"
                value={metrics.pacing_ratio.toFixed(2)}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-2">
                <span>Abandon rate:</span>
                {abandonPct == null ? (
                  <span>—</span>
                ) : (
                  <Badge
                    variant="outline"
                    className={
                      abandonHigh
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-foreground"
                    }
                  >
                    {abandonPct}%
                  </Badge>
                )}
              </div>
              <span>
                Last tick:{" "}
                {new Date(metrics.ticked_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  accent = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide">
        {icon} {label}
      </div>
      <p className={`text-xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}