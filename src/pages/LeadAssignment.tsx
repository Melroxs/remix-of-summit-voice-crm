import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Campaign { id: string; name: string }
interface Availability { available_leads: number; assigned_leads: number; total_leads: number }
interface Agent { user_id: string; display_name: string | null; email: string | null; assigned_today: number }

export default function LeadAssignment() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [stats, setStats] = useState<Availability | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perAgent, setPerAgent] = useState<number>(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      setCampaigns((data ?? []) as Campaign[]);
    })();
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refresh = async (cid: string) => {
    if (!cid) return;
    const [availRes, agentsRes] = await Promise.all([
      supabase.from("campaign_lead_availability").select("*").eq("campaign_id", cid).maybeSingle(),
      supabase.from("campaign_agents").select("user_id, profiles:profiles!inner(user_id, display_name, email)").eq("campaign_id", cid),
    ]);

    setStats(
      availRes.data
        ? {
            available_leads: Number(availRes.data.available_leads ?? 0),
            assigned_leads: Number(availRes.data.assigned_leads ?? 0),
            total_leads: Number(availRes.data.total_leads ?? 0),
          }
        : { available_leads: 0, assigned_leads: 0, total_leads: 0 },
    );

    const rows = (agentsRes.data ?? []) as any[];
    const userIds = rows.map((r) => r.user_id);
    let counts: Record<string, number> = {};
    if (userIds.length) {
      const { data: ccRows } = await supabase
        .from("campaign_contacts")
        .select("assigned_agent_id")
        .eq("campaign_id", cid)
        .eq("assigned_date", today)
        .in("assigned_agent_id", userIds);
      (ccRows ?? []).forEach((r: any) => {
        if (!r.assigned_agent_id) return;
        counts[r.assigned_agent_id] = (counts[r.assigned_agent_id] ?? 0) + 1;
      });
    }

    setAgents(
      rows.map((r) => ({
        user_id: r.user_id,
        display_name: r.profiles?.display_name ?? null,
        email: r.profiles?.email ?? null,
        assigned_today: counts[r.user_id] ?? 0,
      })),
    );
  };

  useEffect(() => {
    setSelected(new Set());
    if (campaignId) refresh(campaignId);
    else { setStats(null); setAgents([]); }
  }, [campaignId]);

  const toggle = (uid: string) => {
    const next = new Set(selected);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setSelected(next);
  };

  const handleAssign = async () => {
    if (!campaignId || selected.size === 0 || perAgent < 1) return;
    setLoading(true);
    let total = 0;
    try {
      for (const agentId of selected) {
        const { data, error } = await supabase.rpc("bulk_assign_leads", {
          p_campaign_id: campaignId,
          p_agent_id: agentId,
          p_quantity: perAgent,
        });
        if (error) throw error;
        total += Number(data ?? 0);
      }
      toast.success(`Assigned ${total} lead${total === 1 ? "" : "s"}`);
      await refresh(campaignId);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to assign leads");
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (agentId: string, quantity: number) => {
    if (!campaignId || quantity < 1) return;
    const { data, error } = await supabase.rpc("bulk_unassign_leads", {
      p_campaign_id: campaignId,
      p_agent_id: agentId,
      p_quantity: quantity,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Unassigned ${data ?? 0} lead${data === 1 ? "" : "s"}`);
    await refresh(campaignId);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Lead Assignment" subtitle="Distribute leads to agents per campaign" />

      <div className="max-w-md">
        <Label className="mb-2 block">Campaign</Label>
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger><SelectValue placeholder="Select an active campaign" /></SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {campaignId && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Available", value: stats.available_leads },
            { label: "Assigned", value: stats.assigned_leads },
            { label: "Total", value: stats.total_leads },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{s.label}</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold">{s.value}</div></CardContent>
            </Card>
          ))}
        </div>
      )}

      {campaignId && (
        <Card>
          <CardHeader><CardTitle>Assign Leads</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <Label htmlFor="per-agent" className="mb-2 block">Leads per Agent</Label>
              <Input id="per-agent" type="number" min={1} value={perAgent}
                onChange={(e) => setPerAgent(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div>
              <Label className="mb-2 block">Agents</Label>
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents on this campaign.</p>
              ) : (
                <div className="space-y-2 border rounded-md p-3 max-h-64 overflow-y-auto">
                  {agents.map((a) => (
                    <label key={a.user_id} className="flex items-center gap-3 cursor-pointer">
                      <Checkbox checked={selected.has(a.user_id)} onCheckedChange={() => toggle(a.user_id)} />
                      <span className="text-sm">{a.display_name || a.email || a.user_id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleAssign} disabled={loading || selected.size === 0}>
              {loading ? "Assigning…" : "Assign Leads"}
            </Button>
          </CardContent>
        </Card>
      )}

      {campaignId && (
        <Card>
          <CardHeader><CardTitle>Agent Overview</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Assigned Today</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No agents</TableCell></TableRow>
                ) : agents.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell>{a.display_name || a.email || a.user_id}</TableCell>
                    <TableCell>{a.assigned_today}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline"
                        disabled={a.assigned_today === 0}
                        onClick={() => handleUnassign(a.user_id, a.assigned_today)}>
                        Unassign
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}