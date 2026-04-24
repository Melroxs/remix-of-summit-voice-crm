import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Activity, Loader2, RefreshCw, Phone, Users, Gauge, AlertTriangle, TrendingDown, Timer } from "lucide-react";
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
const AUTO_TICK_ENABLED_KEY = "predictiveDialer.autoTick.enabled";
const AUTO_TICK_INTERVAL_KEY = "predictiveDialer.autoTick.intervalSec";
const AUTO_TICK_INTERVALS = [15, 30, 60, 120, 300] as const;
const DEFAULT_AUTO_TICK_INTERVAL = 60; // seconds
const MANUAL_TICK_COOLDOWN_SEC = 30;

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
  const [autoTickEnabled, setAutoTickEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(AUTO_TICK_ENABLED_KEY) === "1";
  });
  const [autoTickInterval, setAutoTickInterval] = useState<number>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(AUTO_TICK_INTERVAL_KEY) : null;
    const parsed = stored ? Number(stored) : NaN;
    return AUTO_TICK_INTERVALS.includes(parsed as typeof AUTO_TICK_INTERVALS[number])
      ? parsed
      : DEFAULT_AUTO_TICK_INTERVAL;
  });
  const [nextAutoTickAt, setNextAutoTickAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlightRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const handleThresholdChange = (raw: string) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    setConnectThreshold(n);
    try {
      localStorage.setItem(CONNECT_THRESHOLD_KEY, String(n));
    } catch {}
  };

  const handleAutoTickToggle = (next: boolean) => {
    setAutoTickEnabled(next);
    try {
      localStorage.setItem(AUTO_TICK_ENABLED_KEY, next ? "1" : "0");
    } catch {}
    if (next) {
      toast({
        title: "Auto-tick enabled",
        description: `Engine will tick every ${autoTickInterval}s while this campaign is active.`,
      });
    } else {
      setNextAutoTickAt(null);
    }
  };

  const handleAutoTickIntervalChange = (raw: string) => {
    const n = Number(raw);
    if (!AUTO_TICK_INTERVALS.includes(n as typeof AUTO_TICK_INTERVALS[number])) return;
    setAutoTickInterval(n);
    try {
      localStorage.setItem(AUTO_TICK_INTERVAL_KEY, String(n));
    } catch {}
  };

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 3;

  const openConfirm = () => {
    setReason("");
    setError(null);
    setConfirmOpen(true);
  };

  const cooldownRemaining =
    cooldownUntil != null ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const inCooldown = cooldownRemaining > 0;

  const performTick = async (auto: boolean) => {
    if (inFlightRef.current) return;
    if (!auto && !reasonValid) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    const tickReason = auto ? "auto-tick scheduler" : trimmedReason;
    try {
      const data = await tickPredictiveEngine(campaignId);
      setMetrics({ ...data, ticked_at: new Date().toISOString() });
      logEvent({
        type: "predictive_engine.ticked",
        entity_type: "campaign",
        entity_id: campaignId,
        metadata: {
          reason: tickReason,
          source: auto ? "auto" : "manual",
          auto_tick_interval_sec: auto ? autoTickInterval : null,
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
      if (!auto) {
        toast({
          title: "Predictive engine ticked",
          description: `Placed ${data.placed} of ${data.target} target calls`,
        });
        setConfirmOpen(false);
        setReason("");
        setCooldownUntil(Date.now() + MANUAL_TICK_COOLDOWN_SEC * 1000);
      }
    } catch (e: any) {
      const msg =
        e instanceof DialerValidationError
          ? e.message
          : e?.message || "Failed to tick predictive engine";
      setError(msg);
      toast({
        title: auto ? "Auto-tick failed" : "Predictive tick failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      if (auto) {
        setNextAutoTickAt(Date.now() + autoTickInterval * 1000);
      }
    }
  };

  const handleTick = () => performTick(false);

  // Auto-tick scheduler
  useEffect(() => {
    if (!autoTickEnabled || !enabled) {
      setNextAutoTickAt(null);
      return;
    }
    // Schedule first run
    setNextAutoTickAt((prev) => prev ?? Date.now() + autoTickInterval * 1000);
    const id = window.setInterval(() => {
      performTick(true);
    }, autoTickInterval * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTickEnabled, autoTickInterval, enabled, campaignId]);

  // Tick a 1s clock for countdown displays (auto-tick scheduler and/or manual cooldown)
  useEffect(() => {
    const needsClock =
      (autoTickEnabled && enabled && nextAutoTickAt != null) ||
      (cooldownUntil != null && cooldownUntil > Date.now());
    if (!needsClock) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [autoTickEnabled, enabled, nextAutoTickAt, cooldownUntil]);

  // Clear cooldown state once it elapses to avoid stale timers
  useEffect(() => {
    if (cooldownUntil != null && cooldownUntil <= now) {
      setCooldownUntil(null);
    }
  }, [cooldownUntil, now]);

  const secondsUntilNext =
    autoTickEnabled && nextAutoTickAt != null
      ? Math.max(0, Math.ceil((nextAutoTickAt - now) / 1000))
      : null;

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
        <Button size="sm" onClick={openConfirm} disabled={loading || !enabled || inCooldown}>
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          {inCooldown
            ? `Wait ${cooldownRemaining}s`
            : metrics
            ? "Tick again"
            : "Tick engine"}
        </Button>
      </CardHeader>
      <CardContent>
        {!enabled && (
          <p className="text-xs text-muted-foreground mb-3">
            Engine is disabled while the campaign is not active.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 mb-3 p-2 rounded-md border border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <Label htmlFor="auto-tick" className="text-sm font-medium cursor-pointer">
              Auto-tick
            </Label>
            <Switch
              id="auto-tick"
              checked={autoTickEnabled}
              onCheckedChange={handleAutoTickToggle}
              disabled={!enabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-tick-interval" className="text-xs text-muted-foreground">
              Every
            </Label>
            <Select
              value={String(autoTickInterval)}
              onValueChange={handleAutoTickIntervalChange}
              disabled={!enabled}
            >
              <SelectTrigger id="auto-tick-interval" className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_TICK_INTERVALS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">
                    {s < 60 ? `${s}s` : `${s / 60} min`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {autoTickEnabled && enabled && (
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Ticking…
                </>
              ) : secondsUntilNext != null ? (
                <>Next tick in {secondsUntilNext}s</>
              ) : null}
            </span>
          )}
        </div>
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
              disabled={!reasonValid || loading || inCooldown}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              {inCooldown ? `Wait ${cooldownRemaining}s` : "Confirm tick"}
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