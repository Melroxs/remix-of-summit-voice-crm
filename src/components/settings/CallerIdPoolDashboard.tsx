import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, RefreshCw, Power, Search, Shield, ShieldAlert, ShieldOff, Snowflake, ThermometerSun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneDisplay } from "@/lib/phone";
import { logEvent } from "@/lib/audit";
import CallerIdAuditModal from "./CallerIdAuditModal";
import CallerIdSparkline, { SparkPoint } from "./CallerIdSparkline";

interface PoolRow {
  id: string;
  phone_e164: string;
  display_name: string | null;
  is_active: boolean;
  health_status: "healthy" | "warm" | "fatigued" | "cooling_down" | "blocked";
  total_calls: number;
  answered_calls: number;
  last_used_at: string | null;
  cooldown_until: string | null;
  campaigns: { id: string; name: string }[];
}

const healthIcons: Record<string, any> = {
  healthy: Shield,
  warm: ThermometerSun,
  fatigued: ShieldAlert,
  cooling_down: Snowflake,
  blocked: ShieldOff,
};

const healthColors: Record<string, string> = {
  healthy: "text-green-400 border-green-400/30",
  warm: "text-amber-400 border-amber-400/30",
  fatigued: "text-orange-400 border-orange-400/30",
  cooling_down: "text-blue-400 border-blue-400/30",
  blocked: "text-destructive border-destructive/30",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function CallerIdPoolDashboard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [auditTarget, setAuditTarget] = useState<PoolRow | null>(null);
  const [sparkData, setSparkData] = useState<Record<string, SparkPoint[]>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("caller_ids")
      .select(
        "id, phone_e164, display_name, is_active, health_status, total_calls, answered_calls, last_used_at, cooldown_until, campaign_caller_ids(campaigns(id, name))"
      )
      .order("last_used_at", { ascending: false, nullsFirst: false });

    if (error) {
      toast({ title: "Error loading numbers", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped: PoolRow[] = (data || []).map((n: any) => ({
      id: n.id,
      phone_e164: n.phone_e164,
      display_name: n.display_name,
      is_active: n.is_active,
      health_status: n.health_status || "healthy",
      total_calls: n.total_calls || 0,
      answered_calls: n.answered_calls || 0,
      last_used_at: n.last_used_at,
      cooldown_until: n.cooldown_until,
      campaigns: (n.campaign_caller_ids || [])
        .map((cc: any) => cc.campaigns)
        .filter(Boolean),
    }));
    setRows(mapped);
    setLoading(false);
    loadSparklines(mapped.map((r) => r.phone_e164));
  };

  const loadSparklines = async (phones: string[]) => {
    if (phones.length === 0) {
      setSparkData({});
      return;
    }
    const since = new Date(Date.now() - 7 * 24 * 3_600_000);
    since.setUTCHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("call_attempts")
      .select("outbound_number_used, outcome, created_at")
      .in("outbound_number_used", phones)
      .gte("created_at", since.toISOString())
      .limit(10000);
    if (error) {
      console.warn("[caller-id sparkline] failed:", error.message);
      return;
    }

    // Build last 7 day buckets (oldest -> newest)
    const days: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
      });
    }

    const ANSWERED = new Set(["connected", "appointment_booked", "callback_scheduled"]);
    const map: Record<string, SparkPoint[]> = {};
    phones.forEach((p) => {
      map[p] = days.map((d) => ({ day: d.label, total: 0, answered: 0, answer_rate: 0 }));
    });

    (data || []).forEach((row: any) => {
      const phone: string | null = row.outbound_number_used;
      if (!phone || !map[phone]) return;
      const dayKey = (row.created_at as string).slice(0, 10);
      const idx = days.findIndex((d) => d.key === dayKey);
      if (idx === -1) return;
      const point = map[phone][idx];
      point.total += 1;
      if (ANSWERED.has(row.outcome)) point.answered += 1;
    });

    Object.values(map).forEach((points) =>
      points.forEach((p) => {
        p.answer_rate = p.total > 0 ? Math.round((p.answered / p.total) * 100) : 0;
      })
    );

    setSparkData(map);
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleActive = async (row: PoolRow) => {
    const next = !row.is_active;
    setBusyId(row.id);
    const { error } = await supabase
      .from("caller_ids")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Number activated" : "Number deactivated" });
    logEvent({
      type: next ? "caller_id.activated" : "caller_id.deactivated",
      entity_type: "caller_id",
      entity_id: row.id,
      metadata: { phone_e164: row.phone_e164 },
    }).catch(() => {});
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)));
  };

  const handleBulkSetActive = async (next: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("caller_ids")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? `Activated ${ids.length} number${ids.length === 1 ? "" : "s"}` : `Deactivated ${ids.length} number${ids.length === 1 ? "" : "s"}`,
    });
    ids.forEach((id) => {
      const row = rows.find((r) => r.id === id);
      logEvent({
        type: next ? "caller_id.activated" : "caller_id.deactivated",
        entity_type: "caller_id",
        entity_id: id,
        metadata: { phone_e164: row?.phone_e164, bulk: true },
      }).catch(() => {});
    });
    setRows((prev) => prev.map((r) => (selectedIds.has(r.id) ? { ...r, is_active: next } : r)));
    setSelectedIds(new Set());
  };

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.campaigns.forEach((c) => map.set(c.id, c.name)));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (campaignFilter === "unassigned") {
      if (r.campaigns.length > 0) return false;
    } else if (campaignFilter !== "all") {
      if (!r.campaigns.some((c) => c.id === campaignFilter)) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.phone_e164.toLowerCase().includes(q) ||
      (r.display_name || "").toLowerCase().includes(q) ||
      r.campaigns.some((c) => c.name.toLowerCase().includes(q))
    );
  });

  const visibleIds = filtered.map((r) => r.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach((id) => next.add(id));
      else visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Caller ID Pool Health</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="h-9 w-52 text-sm">
              <SelectValue placeholder="Filter by campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {campaignOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search number or campaign"
              className="h-9 text-sm pl-7 w-56"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3 p-2 px-3 rounded-md border border-border bg-muted/30">
            <div className="text-sm">
              <span className="font-medium">{selectedIds.size}</span> selected
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkSetActive(true)}
                disabled={bulkBusy}
              >
                <Power className="h-3.5 w-3.5 mr-1" />
                Activate
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleBulkSetActive(false)}
                disabled={bulkBusy}
              >
                <Power className="h-3.5 w-3.5 mr-1" />
                Deactivate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkBusy}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading numbers..." : "No caller IDs configured."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allVisibleSelected || (someVisibleSelected ? "indeterminate" : false)}
                    onCheckedChange={(v) => toggleAllVisible(!!v)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Campaigns</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Answer %</TableHead>
                <TableHead>7-Day Trend</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const Icon = healthIcons[r.health_status] || Shield;
                const answerRate =
                  r.total_calls > 0
                    ? Math.round((r.answered_calls / r.total_calls) * 1000) / 10
                    : 0;
                const blocked = !r.is_active || r.health_status === "blocked";
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, !!v)}
                        aria-label={`Select ${r.phone_e164}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setAuditTarget(r)}
                        className="text-left hover:text-primary transition-colors group"
                        title="View audit log"
                      >
                        <div className="font-mono text-sm group-hover:underline">
                          {formatPhoneDisplay(r.phone_e164)}
                        </div>
                        {r.display_name && (
                          <div className="text-xs text-muted-foreground">{r.display_name}</div>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      {r.campaigns.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.campaigns.map((c) => (
                            <Badge key={c.id} variant="secondary" className="text-xs">
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${healthColors[r.health_status] || ""}`}
                        >
                          <Icon className="w-3 h-3 mr-1" />
                          {r.health_status.replace("_", " ")}
                        </Badge>
                        {!r.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeTime(r.last_used_at)}
                    </TableCell>
                    <TableCell>{r.total_calls}</TableCell>
                    <TableCell>{answerRate}%</TableCell>
                    <TableCell>
                      <CallerIdSparkline data={sparkData[r.phone_e164] || []} mode="rate" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={blocked ? "outline" : "destructive"}
                        onClick={() => handleToggleActive(r)}
                        disabled={busyId === r.id}
                      >
                        <Power className="h-3.5 w-3.5 mr-1" />
                        {r.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {auditTarget && (
        <CallerIdAuditModal
          callerId={auditTarget.id}
          phoneE164={auditTarget.phone_e164}
          displayName={auditTarget.display_name}
          onClose={() => setAuditTarget(null)}
        />
      )}
    </Card>
  );
}