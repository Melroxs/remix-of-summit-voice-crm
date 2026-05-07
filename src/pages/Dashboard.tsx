import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone, Users, CalendarClock, Megaphone, TrendingUp, Clock, UserCheck,
  Target, Repeat, ShieldOff, Disc3, PhoneIncoming,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format, isPast } from "date-fns";
import { AgentStatusBadge } from "@/components/agents/AgentStatusSelector";
import { AgentStatusSelector } from "@/components/agents/AgentStatusSelector";
import { AGENT_STATUS_OPTIONS, getStatusMeta } from "@/hooks/use-agent-status";
import { StatCard } from "@/components/reports/StatCard";
import { PageHeader } from "@/components/common/PageHeader";

interface DashStats {
  totalContacts: number;
  activeCampaigns: number;
  callsToday: number;
  callbacksDue: number;
  appointmentsThisWeek: number;
  avgTalkTime: number;
  // Leadership KPIs
  attempts7d: number;
  connects7d: number;
  appts7d: number;
  dncCount: number;
  recordingsAvailable7d: number;
}

interface RecentCall {
  id: string;
  disposition: string | null;
  created_at: string;
  contact_name: string;
}

interface UpcomingCallback {
  id: string;
  callback_at: string;
  contact_name: string;
  status: string;
}

interface AgentProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  agent_status: string | null;
  is_active: boolean;
  status_updated_at: string | null;
}

export default function Dashboard() {
  const { user, isAdmin, isAgent } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashStats>({
    totalContacts: 0, activeCampaigns: 0, callsToday: 0,
    callbacksDue: 0, appointmentsThisWeek: 0, avgTalkTime: 0,
    attempts7d: 0, connects7d: 0, appts7d: 0, dncCount: 0, recordingsAvailable7d: 0,
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [upcomingCallbacks, setUpcomingCallbacks] = useState<UpcomingCallback[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchDashboard = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenIso = sevenDaysAgo.toISOString();
        const agentFilter = isAgent && !isAdmin ? user.id : null;

        const [
          contactsRes, campaignsRes, callsTodayRes, callbacksRes, appointmentsRes,
          recentCallsRes, upcomingCbRes,
          calls7dRes, appts7dRes, dncRes,
          techApptsWeekRes, techAppts7dRes,
        ] = await Promise.all([
          supabase.from("contacts").select("id", { count: "exact", head: true }),
          supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
          (() => {
            let q = supabase.from("call_attempts").select("id, duration_seconds").gte("created_at", todayISO);
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            let q = supabase.from("callbacks").select("id", { count: "exact", head: true }).eq("status", "pending").lte("callback_at", new Date().toISOString());
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            let q = supabase.from("appointments").select("id", { count: "exact", head: true }).gte("appointment_at", weekStart.toISOString());
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            let q = supabase.from("call_attempts").select("id, disposition, created_at, contacts(first_name, last_name)").order("created_at", { ascending: false }).limit(5);
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            let q = supabase.from("callbacks").select("id, callback_at, status, contacts(first_name, last_name)").eq("status", "pending").order("callback_at", { ascending: true }).limit(5);
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            let q = supabase.from("call_attempts").select("id, outcome, call_recording_id").gte("created_at", sevenIso);
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          (() => {
            let q = supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", sevenIso);
            if (agentFilter) q = q.eq("agent_id", agentFilter);
            return q;
          })(),
          supabase.from("dnc_entries").select("id", { count: "exact", head: true }),
          (() => {
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return supabase
              .from("technician_appointments")
              .select("id", { count: "exact", head: true })
              .gte("start_time", weekStart.toISOString())
              .not("status", "in", "(cancelled,no_show)");
          })(),
          supabase
            .from("technician_appointments")
            .select("id", { count: "exact", head: true })
            .gte("created_at", sevenIso)
            .not("status", "in", "(cancelled,no_show)"),
        ]);

        const callsData = callsTodayRes.data || [];
        const totalDuration = callsData.reduce((s, c) => s + (c.duration_seconds || 0), 0);
        const avgTalk = callsData.length > 0 ? Math.round(totalDuration / callsData.length) : 0;

        const calls7d = calls7dRes.data || [];
        const connectedSet = new Set(["connected", "appointment_booked", "callback_scheduled", "not_interested", "dnc_request", "already_customer", "wrong_number"]);
        const connects7d = calls7d.filter((c: any) => connectedSet.has(c.outcome ?? "")).length;
        const recordings7d = calls7d.filter((c: any) => c.call_recording_id).length;

        setStats({
          totalContacts: contactsRes.count ?? 0,
          activeCampaigns: campaignsRes.count ?? 0,
          callsToday: callsData.length,
          callbacksDue: callbacksRes.count ?? 0,
          appointmentsThisWeek: (appointmentsRes.count ?? 0) + (techApptsWeekRes.count ?? 0),
          avgTalkTime: avgTalk,
          attempts7d: calls7d.length,
          connects7d,
          appts7d: (appts7dRes.count ?? 0) + (techAppts7dRes.count ?? 0),
          dncCount: dncRes.count ?? 0,
          recordingsAvailable7d: recordings7d,
        });

        setRecentCalls((recentCallsRes.data || []).map((c: any) => ({
          id: c.id, disposition: c.disposition, created_at: c.created_at,
          contact_name: c.contacts ? `${c.contacts.first_name} ${c.contacts.last_name}` : "Unknown",
        })));

        setUpcomingCallbacks((upcomingCbRes.data || []).map((cb: any) => ({
          id: cb.id, callback_at: cb.callback_at, status: cb.status,
          contact_name: cb.contacts ? `${cb.contacts.first_name} ${cb.contacts.last_name}` : "Unknown",
        })));

        // Fetch agent statuses (admin only)
        if (isAdmin) {
          const { data: agentRoles } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
          if (agentRoles && agentRoles.length > 0) {
            const agentIds = agentRoles.map((r) => r.user_id);
            const { data: agentProfiles } = await supabase.from("profiles")
              .select("user_id, display_name, email, agent_status, is_active, status_updated_at")
              .in("user_id", agentIds)
              .eq("is_active", true);
            setAgents((agentProfiles || []) as AgentProfile[]);
          }
        }
      } catch (err) {
        console.error("[Dashboard] Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();

    // Poll for agent status changes every 10 seconds (instead of Realtime to avoid broadcast exposure)
    if (isAdmin) {
      const interval = setInterval(async () => {
        try {
          const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
          if (roleRows && roleRows.length > 0) {
            const agentIds = roleRows.map((r) => r.user_id);
            const { data: agentProfiles } = await supabase
              .from("profiles")
              .select("user_id, display_name, email, agent_status, status_updated_at, is_active")
              .in("user_id", agentIds)
              .eq("is_active", true);
            if (agentProfiles) setAgents(agentProfiles as AgentProfile[]);
          }
        } catch (err) {
          console.error("[Dashboard] Agent poll error:", err);
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin, isAgent]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const connectRate7d = stats.attempts7d > 0 ? (stats.connects7d / stats.attempts7d) * 100 : 0;
  const bookingRate7d = stats.connects7d > 0 ? (stats.appts7d / stats.connects7d) * 100 : 0;
  const recordingRate7d = stats.attempts7d > 0 ? (stats.recordingsAvailable7d / stats.attempts7d) * 100 : 0;

  const statCards = [
    { label: "Total Contacts", value: stats.totalContacts.toLocaleString(), icon: Users, change: `${stats.callsToday} calls today`, link: "/contacts" },
    { label: "Active Campaigns", value: stats.activeCampaigns.toString(), icon: Megaphone, change: "running", link: "/campaigns" },
    { label: "Calls Today", value: stats.callsToday.toString(), icon: Phone, change: `avg ${formatDuration(stats.avgTalkTime)}`, link: "/dialer" },
    { label: "Callbacks Due", value: stats.callbacksDue.toString(), icon: CalendarClock, change: stats.callbacksDue > 0 ? "overdue" : "none pending", link: "/callbacks" },
    { label: "Appointments", value: stats.appointmentsThisWeek.toString(), icon: TrendingUp, change: "this week", link: "/reports" },
    { label: "Avg Talk Time", value: formatDuration(stats.avgTalkTime), icon: Clock, change: `${stats.callsToday} calls`, link: "/reports" },
  ];

  // Agent status summary counts
  const statusCounts = AGENT_STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = agents.filter((a) => (a.agent_status || "offline") === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back to Summit Leads CRM"
        actions={isAgent ? <AgentStatusSelector /> : undefined}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="stat-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(stat.link)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leadership KPIs (last 7 days) — admin only */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Leadership KPIs</h2>
            <span className="text-xs text-muted-foreground">Last 7 days</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Dial attempts" value={stats.attempts7d.toLocaleString()} icon={Phone} accent="primary" />
            <StatCard label="Connect rate" value={`${connectRate7d.toFixed(1)}%`} icon={PhoneIncoming} accent="success" hint={`${stats.connects7d} connects`} />
            <StatCard label="Booking rate" value={`${bookingRate7d.toFixed(1)}%`} icon={Target} accent="success" hint="of connects" />
            <StatCard label="Appointments" value={stats.appts7d.toLocaleString()} icon={CalendarClock} accent="success" />
            <StatCard label="DNC entries" value={stats.dncCount.toLocaleString()} icon={ShieldOff} accent="destructive" hint="all-time" />
            <StatCard label="Recordings avail." value={`${recordingRate7d.toFixed(0)}%`} icon={Disc3} hint={`${stats.recordingsAvailable7d}/${stats.attempts7d}`} />
          </div>
        </div>
      )}

      {/* Agent Status Overview - Admin only */}
      {isAdmin && agents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="w-5 h-5" />
              Agent Status Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Status summary bar */}
            <div className="flex flex-wrap gap-3 mb-4">
              {AGENT_STATUS_OPTIONS.map((s) => (
                <div key={s.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${s.bgColor}`}>
                  <span className={`w-2 h-2 rounded-full ${s.dotColor}`} />
                  <span className={s.color}>{s.label}</span>
                  <span className={`font-bold ${s.color}`}>{statusCounts[s.value] || 0}</span>
                </div>
              ))}
            </div>

            {/* Agent table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm text-foreground">{a.display_name || a.email}</p>
                        {a.display_name && <p className="text-xs text-muted-foreground">{a.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AgentStatusBadge status={a.agent_status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.status_updated_at ? format(new Date(a.status_updated_at), "h:mm a") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {recentCalls.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentCalls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">{call.contact_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{call.disposition?.replace(/_/g, " ") || "No disposition"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(call.created_at), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Upcoming Callbacks</CardTitle></CardHeader>
          <CardContent>
            {upcomingCallbacks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming callbacks.</p>
            ) : (
              <div className="space-y-3">
                {upcomingCallbacks.map((cb) => (
                  <div key={cb.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">{cb.contact_name}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(cb.callback_at), "MMM d, h:mm a")}</p>
                    </div>
                    <Badge variant="secondary" className={isPast(new Date(cb.callback_at)) ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/10 text-warning border-warning/30"}>
                      {isPast(new Date(cb.callback_at)) ? "Overdue" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
