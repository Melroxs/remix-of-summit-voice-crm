import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";
import { Phone, CalendarClock, TrendingUp, Clock, Users } from "lucide-react";

interface CallLog {
  id: string;
  agent_id: string | null;
  campaign_id: string | null;
  disposition: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface Campaign {
  id: string;
  name: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316",
];

const DISPO_COLORS: Record<string, string> = {
  no_answer: "#6b7280",
  voicemail: "#8b5cf6",
  wrong_number: "#ef4444",
  dnc: "#dc2626",
  not_interested: "#f97316",
  callback: "#f59e0b",
  appointment_booked: "#10b981",
  have_solar: "#06b6d4",
};

export default function Reports() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [callsRes, campaignsRes, profilesRes] = await Promise.all([
        supabase.from("call_logs").select("id, agent_id, campaign_id, disposition, duration_seconds, created_at").order("created_at", { ascending: true }),
        supabase.from("campaigns").select("id, name").order("name"),
        supabase.from("profiles").select("user_id, display_name, email"),
      ]);
      setCalls(callsRes.data || []);
      setCampaigns(campaignsRes.data || []);
      setProfiles(profilesRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    if (selectedCampaign === "all") return calls;
    return calls.filter((c) => c.campaign_id === selectedCampaign);
  }, [calls, selectedCampaign]);

  // --- Call Volume by Day ---
  const volumeByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filtered) {
      const day = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      map.set(day, (map.get(day) || 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, calls: count }));
  }, [filtered]);

  // --- Disposition Breakdown ---
  const dispoBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filtered) {
      const d = c.disposition || "unknown";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.replace(/_/g, " "), value, code: name }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // --- Agent Performance ---
  const agentPerf = useMemo(() => {
    const map = new Map<string, { calls: number; totalDuration: number; appointments: number }>();
    for (const c of filtered) {
      const agentId = c.agent_id || "unknown";
      const existing = map.get(agentId) || { calls: 0, totalDuration: 0, appointments: 0 };
      existing.calls++;
      existing.totalDuration += c.duration_seconds || 0;
      if (c.disposition === "appointment_booked") existing.appointments++;
      map.set(agentId, existing);
    }
    return Array.from(map.entries()).map(([agentId, data]) => {
      const profile = profiles.find((p) => p.user_id === agentId);
      return {
        agent: profile?.display_name || profile?.email?.split("@")[0] || agentId.slice(0, 8),
        calls: data.calls,
        avgDuration: data.calls > 0 ? Math.round(data.totalDuration / data.calls) : 0,
        appointments: data.appointments,
      };
    }).sort((a, b) => b.calls - a.calls);
  }, [filtered, profiles]);

  // --- Summary Stats ---
  const totalCalls = filtered.length;
  const totalAppointments = filtered.filter((c) => c.disposition === "appointment_booked").length;
  const avgDuration = totalCalls > 0
    ? Math.round(filtered.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / totalCalls)
    : 0;
  const conversionRate = totalCalls > 0 ? ((totalAppointments / totalCalls) * 100).toFixed(1) : "0";

  const summaryStats = [
    { label: "Total Calls", value: totalCalls, icon: Phone },
    { label: "Appointments", value: totalAppointments, icon: CalendarClock },
    { label: "Conversion Rate", value: `${conversionRate}%`, icon: TrendingUp },
    { label: "Avg Duration", value: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`, icon: Clock },
    { label: "Active Agents", value: new Set(filtered.map((c) => c.agent_id).filter(Boolean)).size, icon: Users },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Campaign performance and agent analytics</p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {summaryStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Call Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Call Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {volumeByDay.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No call data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Disposition Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Disposition Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {dispoBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No disposition data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={dispoBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {dispoBreakdown.map((entry, i) => (
                      <Cell key={entry.code} fill={DISPO_COLORS[entry.code] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agent Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {agentPerf.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No agent data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-muted-foreground font-medium">Agent</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Calls</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Avg Duration</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Appointments</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerf.map((agent, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-2 font-medium text-foreground">{agent.agent}</td>
                      <td className="py-3 px-2 text-right text-foreground">{agent.calls}</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">
                        {Math.floor(agent.avgDuration / 60)}m {agent.avgDuration % 60}s
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="outline" className="text-green-400 border-green-400/20">
                          {agent.appointments}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right text-foreground">
                        {agent.calls > 0 ? ((agent.appointments / agent.calls) * 100).toFixed(1) : "0"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
