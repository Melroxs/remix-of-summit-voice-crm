import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Campaign { id: string; name: string }
interface Agent { user_id: string; display_name: string | null; email: string | null }
interface Lead { id: string; first_name: string; last_name: string; phone_e164: string | null; city: string | null; state: string | null }

export default function DailyLeadAssignment() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [leadsPerAgent, setLeadsPerAgent] = useState(20);
  const [available, setAvailable] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([
      supabase.from("campaigns").select("id, name").order("name"),
      supabase.from("profiles").select("user_id, display_name, email").eq("is_active", true).order("display_name"),
    ]).then(async ([camps, profs]) => {
      setCampaigns(camps.data || []);
      // restrict to users with the agent role
      const ids = (profs.data || []).map((p: any) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent")
        .in("user_id", ids);
      const agentIds = new Set((roles || []).map((r: any) => r.user_id));
      setAgents((profs.data || []).filter((p: any) => agentIds.has(p.user_id)));
    });
  }, []);

  // Load unassigned-today leads for the campaign
  useEffect(() => {
    if (!campaignId) { setAvailable([]); return; }
    setLoading(true);
    (async () => {
      const { data: assigned } = await supabase
        .from("daily_lead_assignments")
        .select("contact_id")
        .eq("campaign_id", campaignId)
        .eq("assigned_date", today);
      const exclude = (assigned || []).map((r: any) => r.contact_id);
      const { data: ccs } = await supabase
        .from("campaign_contacts")
        .select("contact_id, contacts(id, first_name, last_name, phone_e164, city, state)")
        .eq("campaign_id", campaignId)
        .not("contact_id", "in", `(${exclude.length ? exclude.join(",") : "00000000-0000-0000-0000-000000000000"})`)
        .limit(2000);
      const leads: Lead[] = (ccs || [])
        .map((cc: any) => cc.contacts)
        .filter((c: any) => c && c.phone_e164);
      setAvailable(leads);
      setLoading(false);
    })();
  }, [campaignId, today]);

  const totalNeeded = leadsPerAgent * selectedAgents.length;
  const preview = useMemo(() => {
    if (!selectedAgents.length || !available.length) return [] as { agentId: string; leads: Lead[] }[];
    const out = selectedAgents.map((id) => ({ agentId: id, leads: [] as Lead[] }));
    let i = 0;
    for (const lead of available.slice(0, totalNeeded)) {
      out[i % selectedAgents.length].leads.push(lead);
      i++;
    }
    return out;
  }, [selectedAgents, available, totalNeeded]);

  const toggleAgent = (id: string) =>
    setSelectedAgents((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleAssign = async () => {
    if (!campaignId || !selectedAgents.length || preview.every((p) => !p.leads.length)) return;
    setAssigning(true);
    const { data: u } = await supabase.auth.getUser();
    const rows: any[] = [];
    preview.forEach((bucket) => {
      bucket.leads.forEach((lead, idx) => {
        rows.push({
          campaign_id: campaignId,
          contact_id: lead.id,
          agent_id: bucket.agentId,
          assigned_by: u.user?.id,
          assigned_date: today,
          queue_position: idx + 1,
          status: "assigned",
        });
      });
    });
    const { error } = await supabase.from("daily_lead_assignments").insert(rows);
    setAssigning(false);
    if (error) {
      toast({ title: "Assignment failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Assigned", description: `${rows.length} leads assigned across ${selectedAgents.length} agents.` });
    // refresh
    setAvailable((a) => a.slice(rows.length));
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold">Daily Lead Assignment</h1>
        <p className="text-muted-foreground text-sm">Distribute today's calling queue to agents.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Select campaign</CardTitle></CardHeader>
        <CardContent>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Choose campaign" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {campaignId && (
            <p className="text-xs text-muted-foreground mt-2">
              {loading ? "Loading…" : `${available.length} unassigned leads available today.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Select agents</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {agents.map((a) => (
            <label key={a.user_id} className="flex items-center gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/40">
              <Checkbox checked={selectedAgents.includes(a.user_id)} onCheckedChange={() => toggleAgent(a.user_id)} />
              <span className="text-sm">{a.display_name || a.email?.split("@")[0]}</span>
            </label>
          ))}
          {!agents.length && <p className="text-sm text-muted-foreground">No active agents found.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3. Leads per agent</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3">
          <div>
            <Label className="text-xs">Leads per agent</Label>
            <Input type="number" min={1} max={500} value={leadsPerAgent}
              onChange={(e) => setLeadsPerAgent(Math.max(1, Number(e.target.value) || 1))}
              className="w-32" />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Total needed: {totalNeeded} • Will assign: {Math.min(totalNeeded, available.length)}
          </p>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">4. Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {preview.map((p) => {
              const a = agents.find((x) => x.user_id === p.agentId);
              return (
                <div key={p.agentId} className="border border-border rounded p-3">
                  <p className="text-sm font-medium">{a?.display_name || a?.email} — {p.leads.length} leads</p>
                </div>
              );
            })}
            <Button onClick={handleAssign} disabled={assigning || !preview.some((p) => p.leads.length)}>
              {assigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm assignments
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}