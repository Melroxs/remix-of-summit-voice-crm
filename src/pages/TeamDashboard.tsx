import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Phone, PhoneOff, Clock, Calendar, TrendingUp, Headphones, MessageSquare } from "lucide-react";
import { getStatusMeta } from "@/hooks/use-agent-status";
import LiveCallsPanel from "@/components/team/LiveCallsPanel";
import FeedbackModal from "@/components/team/FeedbackModal";

interface AgentRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  agent_status: string | null;
  calls_today: number;
  appointments_today: number;
  last_call_time: string | null;
}

interface DashMetrics {
  totalCalls: number;
  answered: number;
  appointments: number;
  callbacks: number;
  avgDuration: number;
}

export default function TeamDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [metrics, setMetrics] = useState<DashMetrics>({ totalCalls: 0, answered: 0, appointments: 0, callbacks: 0, avgDuration: 0 });
  const [loading, setLoading] = useState(true);
  const [feedbackAgent, setFeedbackAgent] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").eq("status", "active").order("name")
      .then(({ data }) => setCampaigns(data || []));
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Get agents in campaigns
    let agentQuery = supabase.from("campaign_agents").select("user_id, campaign_id");
    if (selectedCampaign !== "all") {
      agentQuery = agentQuery.eq("campaign_id", selectedCampaign);
    }
    const { data: agentLinks } = await agentQuery;
    const agentIds = [...new Set((agentLinks || []).map(a => a.user_id))];

    if (agentIds.length === 0) {
      setAgents([]);
      setMetrics({ totalCalls: 0, answered: 0, appointments: 0, callbacks: 0, avgDuration: 0 });
      setLoading(false);
      return;
    }

    // Fetch profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email, agent_status")
      .in("user_id", agentIds);

    // Fetch today's call logs
    let callQuery = supabase.from("call_attempts").select("agent_id, duration_seconds, disposition, started_at").gte("created_at", todayISO);
    if (selectedCampaign !== "all") callQuery = callQuery.eq("campaign_id", selectedCampaign);
    const { data: calls } = await callQuery;

    // Fetch today's appointments
    let apptQuery = supabase.from("appointments").select("agent_id").gte("created_at", todayISO);
    if (selectedCampaign !== "all") apptQuery = apptQuery.eq("campaign_id", selectedCampaign);
    const { data: appts } = await apptQuery;

    // Fetch today's callbacks
    let cbQuery = supabase.from("callbacks").select("agent_id").gte("created_at", todayISO);
    if (selectedCampaign !== "all") cbQuery = cbQuery.eq("campaign_id", selectedCampaign);
    const { data: cbs } = await cbQuery;

    // Build agent rows
    const callsByAgent: Record<string, number> = {};
    const apptsByAgent: Record<string, number> = {};
    const lastCallByAgent: Record<string, string> = {};
    let totalDuration = 0;
    let durationCount = 0;

    (calls || []).forEach(c => {
      callsByAgent[c.agent_id] = (callsByAgent[c.agent_id] || 0) + 1;
      if (c.duration_seconds) { totalDuration += c.duration_seconds; durationCount++; }
      if (c.started_at && (!lastCallByAgent[c.agent_id] || c.started_at > lastCallByAgent[c.agent_id])) {
        lastCallByAgent[c.agent_id] = c.started_at;
      }
    });

    (appts || []).forEach(a => {
      if (a.agent_id) apptsByAgent[a.agent_id] = (apptsByAgent[a.agent_id] || 0) + 1;
    });

    const answered = (calls || []).filter(c => c.disposition && !["no_answer", "voicemail"].includes(c.disposition)).length;

    const agentRows: AgentRow[] = (profiles || []).map(p => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: p.email,
      agent_status: p.agent_status,
      calls_today: callsByAgent[p.user_id] || 0,
      appointments_today: apptsByAgent[p.user_id] || 0,
      last_call_time: lastCallByAgent[p.user_id] || null,
    }));

    setAgents(agentRows.sort((a, b) => {
      const order = ["on_call", "available", "ready", "wrap_up", "paused", "lunch", "tea", "bathroom_break", "offline"];
      return order.indexOf(a.agent_status || "offline") - order.indexOf(b.agent_status || "offline");
    }));

    setMetrics({
      totalCalls: (calls || []).length,
      answered,
      appointments: (appts || []).length,
      callbacks: (cbs || []).length,
      avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    });

    setLoading(false);
  }, [user, selectedCampaign]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription on profiles for status changes
  useEffect(() => {
    const channel = supabase
      .channel("team-dashboard-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const statusCounts = {
    online: agents.filter(a => ["available", "ready"].includes(a.agent_status || "")).length,
    on_call: agents.filter(a => a.agent_status === "on_call").length,
    paused: agents.filter(a => ["paused", "lunch", "tea", "bathroom_break"].includes(a.agent_status || "")).length,
    wrap_up: agents.filter(a => a.agent_status === "wrap_up").length,
    offline: agents.filter(a => !a.agent_status || a.agent_status === "offline").length,
  };

  const connectionRate = metrics.totalCalls > 0 ? Math.round((metrics.answered / metrics.totalCalls) * 100) : 0;
  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time team monitoring</p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Status Summary Bar */}
      <div className="flex gap-3 flex-wrap">
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-green-500/40 text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {statusCounts.online} Ready
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-cyan-500/40 text-cyan-400">
          <Phone className="w-3 h-3" /> {statusCounts.on_call} On Call
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-amber-500/40 text-amber-400">
          <Clock className="w-3 h-3" /> {statusCounts.wrap_up} Wrap-Up
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-orange-500/40 text-orange-400">
          <PhoneOff className="w-3 h-3" /> {statusCounts.paused} Paused
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-muted-foreground/40 text-muted-foreground">
          {statusCounts.offline} Offline
        </Badge>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Calls Today</p>
          <p className="text-2xl font-bold text-foreground">{metrics.totalCalls}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Connection Rate</p>
          <p className="text-2xl font-bold text-foreground">{connectionRate}%</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Appointments</p>
          <p className="text-2xl font-bold text-foreground">{metrics.appointments}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Callbacks Set</p>
          <p className="text-2xl font-bold text-foreground">{metrics.callbacks}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Avg Duration</p>
          <p className="text-2xl font-bold text-foreground">{formatDuration(metrics.avgDuration)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Active Agents</p>
          <p className="text-2xl font-bold text-foreground">{statusCounts.online + statusCounts.on_call}</p>
        </CardContent></Card>
      </div>

      {/* Live Calls Panel */}
      <LiveCallsPanel campaignId={selectedCampaign === "all" ? undefined : selectedCampaign} />

      {/* Agents Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Agent Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No agents assigned to selected campaigns.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Agent</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-center">Calls</th>
                    <th className="pb-2 font-medium text-center">Appts</th>
                    <th className="pb-2 font-medium text-center">Conv %</th>
                    <th className="pb-2 font-medium">Last Call</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(a => {
                    const meta = getStatusMeta(a.agent_status);
                    const convRate = a.calls_today > 0 ? Math.round((a.appointments_today / a.calls_today) * 100) : 0;
                    return (
                      <tr key={a.user_id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2.5">
                          <p className="font-medium text-foreground">{a.display_name || a.email}</p>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: meta.color + "60", color: meta.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-center text-foreground">{a.calls_today}</td>
                        <td className="py-2.5 text-center text-foreground">{a.appointments_today}</td>
                        <td className="py-2.5 text-center text-foreground">{convRate}%</td>
                        <td className="py-2.5 text-muted-foreground">
                          {a.last_call_time ? new Date(a.last_call_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setFeedbackAgent({ id: a.user_id, name: a.display_name || a.email || "Agent" })}>
                            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Feedback
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {feedbackAgent && (
        <FeedbackModal
          agentId={feedbackAgent.id}
          agentName={feedbackAgent.name}
          onClose={() => setFeedbackAgent(null)}
        />
      )}
    </div>
  );
}
