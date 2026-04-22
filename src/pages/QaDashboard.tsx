import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, TrendingUp, TrendingDown, Award } from "lucide-react";
import QaScoringForm from "@/components/team/QaScoringForm";

interface AgentQa {
  agent_id: string;
  agent_name: string;
  avg_score: number;
  total_scored: number;
  recent_score: number | null;
}

interface RecentScore {
  id: string;
  call_log_id: string;
  agent_id: string;
  agent_name: string;
  total_score: number;
  created_at: string;
  strengths: string | null;
  improvement_feedback: string | null;
}

export default function QaDashboard() {
  const [agentScores, setAgentScores] = useState<AgentQa[]>([]);
  const [recentScores, setRecentScores] = useState<RecentScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [scoringCall, setScoringCall] = useState<{ callLogId: string; agentId: string; campaignId?: string } | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
  }, []);

  const fetchData = async () => {
    setLoading(true);

    let query = supabase.from("qa_scores").select("id, call_log_id, agent_id, total_score, created_at, strengths, improvement_feedback, campaign_id");
    if (selectedCampaign !== "all") query = query.eq("campaign_id", selectedCampaign);

    const { data: scores } = await query.order("created_at", { ascending: false });

    // Get agent profiles for names
    const agentIds = [...new Set((scores || []).map(s => s.agent_id))];
    const { data: profiles } = agentIds.length > 0
      ? await supabase.from("profiles").select("user_id, display_name, email").in("user_id", agentIds)
      : { data: [] };

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach(p => { profileMap[p.user_id] = p.display_name || p.email || "Unknown"; });

    // Build per-agent summaries
    const byAgent: Record<string, { scores: number[]; recent: number | null }> = {};
    (scores || []).forEach(s => {
      if (!byAgent[s.agent_id]) byAgent[s.agent_id] = { scores: [], recent: null };
      const sc = Number(s.total_score) || 0;
      byAgent[s.agent_id].scores.push(sc);
      if (byAgent[s.agent_id].recent === null) byAgent[s.agent_id].recent = sc;
    });

    const agentQa: AgentQa[] = Object.entries(byAgent).map(([id, data]) => ({
      agent_id: id,
      agent_name: profileMap[id] || "Unknown",
      avg_score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      total_scored: data.scores.length,
      recent_score: data.recent,
    })).sort((a, b) => b.avg_score - a.avg_score);

    setAgentScores(agentQa);

    // Recent scores
    setRecentScores((scores || []).slice(0, 20).map(s => ({
      id: s.id,
      call_log_id: s.call_log_id,
      agent_id: s.agent_id,
      agent_name: profileMap[s.agent_id] || "Unknown",
      total_score: Number(s.total_score) || 0,
      created_at: s.created_at,
      strengths: s.strengths,
      improvement_feedback: s.improvement_feedback,
    })));

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCampaign]);

  const overallAvg = agentScores.length > 0
    ? agentScores.reduce((a, b) => a + b.avg_score, 0) / agentScores.length
    : 0;

  const scoreColor = (score: number) => {
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
          <h1 className="text-2xl font-bold text-foreground">QA Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Call quality scoring and analytics</p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
          <Star className="w-8 h-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Overall Avg</p>
            <p className={`text-2xl font-bold ${scoreColor(overallAvg)}`}>{overallAvg.toFixed(1)}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
          <Award className="w-8 h-8 text-green-400" />
          <div>
            <p className="text-xs text-muted-foreground">Top Performer</p>
            <p className="text-sm font-bold text-foreground">{agentScores[0]?.agent_name || "—"}</p>
            <p className="text-xs text-muted-foreground">{agentScores[0] ? `${agentScores[0].avg_score.toFixed(1)} avg` : ""}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
          <TrendingDown className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-xs text-muted-foreground">Needs Coaching</p>
            <p className="text-sm font-bold text-foreground">{agentScores[agentScores.length - 1]?.agent_name || "—"}</p>
            <p className="text-xs text-muted-foreground">{agentScores[agentScores.length - 1] ? `${agentScores[agentScores.length - 1].avg_score.toFixed(1)} avg` : ""}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-cyan-400" />
          <div>
            <p className="text-xs text-muted-foreground">Total Scored</p>
            <p className="text-2xl font-bold text-foreground">{recentScores.length}</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Agent Rankings */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Agent QA Rankings</CardTitle></CardHeader>
        <CardContent>
          {agentScores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No QA scores yet. Score calls to see rankings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Agent</th>
                    <th className="pb-2 font-medium text-center">Avg Score</th>
                    <th className="pb-2 font-medium text-center">Calls Scored</th>
                    <th className="pb-2 font-medium text-center">Recent</th>
                  </tr>
                </thead>
                <tbody>
                  {agentScores.map((a, i) => (
                    <tr key={a.agent_id} className="border-b border-border/50">
                      <td className="py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 font-medium text-foreground">{a.agent_name}</td>
                      <td className={`py-2.5 text-center font-bold ${scoreColor(a.avg_score)}`}>{a.avg_score.toFixed(1)}</td>
                      <td className="py-2.5 text-center text-foreground">{a.total_scored}</td>
                      <td className={`py-2.5 text-center ${scoreColor(a.recent_score || 0)}`}>{a.recent_score?.toFixed(1) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Scores */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent Scored Calls</CardTitle></CardHeader>
        <CardContent>
          {recentScores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No scored calls yet.</p>
          ) : (
            <div className="space-y-2">
              {recentScores.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-foreground">{s.agent_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()} • Score: <span className={`font-bold ${scoreColor(s.total_score)}`}>{s.total_score.toFixed(1)}</span>
                    </p>
                    {s.strengths && <p className="text-xs text-green-400 mt-0.5">✓ {s.strengths}</p>}
                    {s.improvement_feedback && <p className="text-xs text-amber-400 mt-0.5">△ {s.improvement_feedback}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {scoringCall && (
        <QaScoringForm
          callLogId={scoringCall.callLogId}
          agentId={scoringCall.agentId}
          campaignId={scoringCall.campaignId}
          onClose={() => setScoringCall(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
