import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Phone, Calendar, Star, Clock, TrendingUp } from "lucide-react";

interface AgentPerf {
  user_id: string;
  name: string;
  calls: number;
  answered: number;
  answer_rate: number;
  appointments: number;
  conversion_rate: number;
  avg_duration: number;
  qa_avg: number | null;
  qa_count: number;
}

export default function AgentPerformance() {
  const [agents, setAgents] = useState<AgentPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [dateRange, setDateRange] = useState("today");

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
  }, []);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const now = new Date();
      let since: Date;
      if (dateRange === "today") { since = new Date(); since.setHours(0, 0, 0, 0); }
      else if (dateRange === "week") { since = new Date(now.getTime() - 7 * 86400000); }
      else { since = new Date(now.getTime() - 30 * 86400000); }

      // Get agents
      let agentQuery = supabase.from("campaign_agents").select("user_id");
      if (selectedCampaign !== "all") agentQuery = agentQuery.eq("campaign_id", selectedCampaign);
      const { data: links } = await agentQuery;
      const agentIds = [...new Set((links || []).map(l => l.user_id))];

      if (agentIds.length === 0) { setAgents([]); setLoading(false); return; }

      const [{ data: profiles }, { data: calls }, { data: appts }, { data: qaScores }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email").in("user_id", agentIds),
        supabase.from("call_attempts").select("agent_id, duration_seconds, disposition").gte("created_at", since.toISOString()).in("agent_id", agentIds),
        supabase.from("appointments").select("agent_id").gte("created_at", since.toISOString()).in("agent_id", agentIds),
        supabase.from("qa_reviews").select("agent_id, total_score").gte("created_at", since.toISOString()).in("agent_id", agentIds),
      ]);

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach(p => { profileMap[p.user_id] = p.display_name || p.email || "Unknown"; });

      const result: AgentPerf[] = agentIds.map(id => {
        const agentCalls = (calls || []).filter(c => c.agent_id === id);
        const answered = agentCalls.filter(c => c.disposition && !["no_answer", "voicemail"].includes(c.disposition)).length;
        const agentAppts = (appts || []).filter(a => a.agent_id === id).length;
        const durations = agentCalls.filter(c => c.duration_seconds).map(c => c.duration_seconds!);
        const avgDur = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        const agentQa = (qaScores || []).filter(q => q.agent_id === id);
        const qaAvg = agentQa.length > 0 ? agentQa.reduce((a, b) => a + Number(b.total_score), 0) / agentQa.length : null;

        return {
          user_id: id,
          name: profileMap[id] || "Unknown",
          calls: agentCalls.length,
          answered,
          answer_rate: agentCalls.length > 0 ? Math.round((answered / agentCalls.length) * 100) : 0,
          appointments: agentAppts,
          conversion_rate: agentCalls.length > 0 ? Math.round((agentAppts / agentCalls.length) * 100) : 0,
          avg_duration: Math.round(avgDur),
          qa_avg: qaAvg,
          qa_count: agentQa.length,
        };
      }).sort((a, b) => b.calls - a.calls);

      setAgents(result);
      setLoading(false);
    };
    fetch();
  }, [selectedCampaign, dateRange]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const scoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 4) return "text-green-400";
    if (score >= 3) return "text-amber-400";
    return "text-red-400";
  };

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
          <h1 className="text-2xl font-bold text-foreground">Agent Performance</h1>
          <p className="text-muted-foreground text-sm mt-1">Individual agent metrics and KPIs</p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No agent data for the selected filters.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {agents.map(agent => (
            <Card key={agent.user_id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">{agent.name}</h3>
                  {agent.qa_avg !== null && (
                    <Badge variant="outline" className={`gap-1 ${scoreColor(agent.qa_avg)}`}>
                      <Star className="w-3 h-3" /> QA: {agent.qa_avg.toFixed(1)}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                  <div className="text-center">
                    <Phone className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{agent.calls}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div className="text-center">
                    <TrendingUp className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{agent.answer_rate}%</p>
                    <p className="text-xs text-muted-foreground">Answer Rate</p>
                  </div>
                  <div className="text-center">
                    <Calendar className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{agent.appointments}</p>
                    <p className="text-xs text-muted-foreground">Appointments</p>
                  </div>
                  <div className="text-center">
                    <BarChart3 className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{agent.conversion_rate}%</p>
                    <p className="text-xs text-muted-foreground">Conversion</p>
                  </div>
                  <div className="text-center">
                    <Clock className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{formatDuration(agent.avg_duration)}</p>
                    <p className="text-xs text-muted-foreground">Avg Duration</p>
                  </div>
                  <div className="text-center">
                    <Star className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className={`text-lg font-bold ${scoreColor(agent.qa_avg)}`}>
                      {agent.qa_avg?.toFixed(1) || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">QA ({agent.qa_count})</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
