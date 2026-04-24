import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Activity, Loader2, RefreshCw, Phone, Users, Gauge, AlertTriangle, TrendingDown } from "lucide-react";
import { tickPredictiveEngine, DialerValidationError } from "@/lib/dialer-service";
import { logEvent } from "@/lib/audit";

interface Metrics {
  placed: number;
  target: number;
  available_agents: number;
  active_calls: number;
  pacing_ratio: number;
  abandon_rate?: number;
  connect_rate?: number;
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
const CONNECT_THRESHOLD_KEY = "predictiveDialer.connectThresholdPct";
const DEFAULT_CONNECT_THRESHOLD = 25; // percent

export default function PredictiveDialerControl({ campaignId, enabled = true }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [connectThreshold, setConnectThreshold] = useState<number>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(CONNECT_THRESHOLD_KEY) : null;
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_CONNECT_THRESHOLD;
  });

  const handleThresholdChange = (raw: string) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    setConnectThreshold(n);
    try {
      localStorage.setItem(CONNECT_THRESHOLD_KEY, String(n));
    } catch {}
  };

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 3;

  const openConfirm = () => {
    setReason("");
    setError(null);
    setConfirmOpen(true);
  };

  const handleTick = async () => {
    if (!reasonValid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tickPredictiveEngine(campaignId);
      setMetrics({ ...data, ticked_at: new Date().toISOString() });
      logEvent({
        type: "predictive_engine.ticked",
        entity_type: "campaign",
        entity_id: campaignId,
        metadata: {
          reason: trimmedReason,
          placed: data.placed,
          target: data.target,
          available_agents: data.available_agents,
          active_calls: data.active_calls,
          pacing_ratio: data.pacing_ratio,
          abandon_rate: data.abandon_rate ?? null,
          connect_rate: data.connect_rate ?? null,
          connect_threshold_pct: connectThreshold,
          ticked_at: new Date().toISOString(),
        },
      }).catch(() => {});
      toast({
        title: "Predictive engine ticked",
        description: `Placed ${data.placed} of ${data.target} target calls`,
      });
      setConfirmOpen(false);
      setReason("");
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

  const connectPctNum =
    metrics?.connect_rate != null ? metrics.connect_rate * 100 : null;
  const connectPct = connectPctNum != null ? connectPctNum.toFixed(1) : null;
  const connectLow = connectPctNum != null && connectPctNum < connectThreshold;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5" /> Predictive Dialer
        </CardTitle>
        <Button size="sm" onClick={openConfirm} disabled={loading || !enabled}>
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
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Connect rate:</span>
                  {connectPct == null ? (
                    <span>—</span>
                  ) : (
                    <Badge
                      variant="outline"
                      className={
                        connectLow
                          ? "border-destructive/40 text-destructive"
                          : "border-border text-foreground"
                      }
                    >
                      {connectLow && <TrendingDown className="w-3 h-3 mr-1" />}
                      {connectPct}%
                    </Badge>
                  )}
                </div>
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
            <div className="flex items-center gap-2 pt-1 border-t border-border/50">
              <Label htmlFor="connect-threshold" className="text-xs text-muted-foreground">
                Alert when connect rate &lt;
              </Label>
              <Input
                id="connect-threshold"
                type="number"
                min={0}
                max={100}
                step={1}
                value={connectThreshold}
                onChange={(e) => handleThresholdChange(e.target.value)}
                className="h-7 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
              {connectLow && (
                <span className="text-xs text-destructive flex items-center gap-1 ml-auto">
                  <AlertTriangle className="w-3 h-3" />
                  Below threshold
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!loading) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tick the predictive engine?</AlertDialogTitle>
            <AlertDialogDescription>
              This will manually advance pacing for this campaign and place outbound calls.
              Provide a short reason for this manual tick — it will be saved to the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tick-reason" className="text-sm">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="tick-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Catching up after pause, testing pacing change…"
              rows={3}
              maxLength={280}
              autoFocus
              disabled={loading}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {reasonValid ? "Looks good" : "At least 3 characters required"}
              </span>
              <span>{trimmedReason.length}/280</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleTick();
              }}
              disabled={!reasonValid || loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Confirm tick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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