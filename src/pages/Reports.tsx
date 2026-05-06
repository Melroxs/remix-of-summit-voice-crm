import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  Phone, CalendarClock, TrendingUp, Users, Target, Repeat, ShieldOff, Disc3,
  PhoneIncoming, BarChart3, Wrench, ClipboardList, CheckCircle2, XCircle,
} from "lucide-react";
import { ReportFilters, type DateRange, rangeFromPreset } from "@/components/reports/ReportFilters";
import { StatCard } from "@/components/reports/StatCard";
import { EmptyState } from "@/components/reports/EmptyState";
import { exportToCsv } from "@/lib/export-csv";

interface CallRow {
  id: string;
  agent_id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  disposition: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  attempt_number: number | null;
  call_recording_id: string | null;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  campaign_id: string | null;
  agent_id: string | null;
  status: string | null;
  appointment_at: string;
  created_at: string;
}

interface SessionRow {
  agent_id: string;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
}

interface TechApptRow {
  id: string;
  technician_id: string;
  campaign_id: string | null;
  contact_id: string | null;
  status: string;
  start_time: string;
  end_time: string;
  lead_address: string | null;
  required_skill: string | null;
  created_at: string;
}

interface FollowUpRow {
  id: string;
  task_type: string;
  status: string;
  due_at: string;
  completed_at: string | null;
  agent_id: string | null;
  created_at: string;
}

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const CONNECTED_OUTCOMES = new Set([
  "connected",
  "appointment_booked",
  "callback_scheduled",
  "not_interested",
  "dnc_request",
  "already_customer",
  "wrong_number",
]);

const CONVERSATION_OUTCOMES = new Set([
  "connected",
  "appointment_booked",
  "callback_scheduled",
  "not_interested",
  "already_customer",
]);

function fmtDuration(s: number | null | undefined) {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

export default function Reports() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(30));
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);

  const [calls, setCalls] = useState<CallRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [techAppts, setTechAppts] = useState<TechApptRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [callbackBacklog, setCallbackBacklog] = useState(0);
  const [dncCount, setDncCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Reference data (campaigns, profiles)
  useEffect(() => {
    Promise.all([
      supabase.from("campaigns").select("id, name").order("name"),
      supabase.from("profiles").select("user_id, display_name, email"),
      supabase.from("technicians").select("id, name").order("name"),
    ]).then(([camps, profs, techs]) => {
      setCampaigns(camps.data || []);
      setProfiles(profs.data || []);
      setTechnicians(techs.data || []);
    });
  }, []);

  // Fetch the reporting dataset
  useEffect(() => {
    const fromIso = new Date(range.from).toISOString();
    const toIso = new Date(new Date(range.to).setHours(23, 59, 59, 999)).toISOString();

    const fetchAll = async () => {
      setLoading(true);
      const buildCall = () => {
        let q = supabase
          .from("call_attempts")
          .select("id, agent_id, campaign_id, contact_id, disposition, outcome, duration_seconds, attempt_number, call_recording_id, created_at")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: true })
          .limit(5000);
        if (selectedCampaign !== "all") q = q.eq("campaign_id", selectedCampaign);
        return q;
      };
      const buildAppt = () => {
        let q = supabase
          .from("appointments")
          .select("id, campaign_id, agent_id, status, appointment_at, created_at")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(5000);
        if (selectedCampaign !== "all") q = q.eq("campaign_id", selectedCampaign);
        return q;
      };
      const buildSessions = () => {
        return supabase
          .from("dial_sessions")
          .select("agent_id, started_at, ended_at, paused_seconds")
          .gte("started_at", fromIso)
          .lte("started_at", toIso)
          .limit(5000);
      };

      const buildTechAppts = () => {
        let q = supabase
          .from("technician_appointments")
          .select("id, technician_id, campaign_id, contact_id, status, start_time, end_time, lead_address, required_skill, created_at")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(5000);
        if (selectedCampaign !== "all") q = q.eq("campaign_id", selectedCampaign);
        return q;
      };
      const buildFollowUps = () => {
        let q = supabase
          .from("follow_up_tasks")
          .select("id, task_type, status, due_at, completed_at, agent_id, created_at, campaign_id")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(5000);
        if (selectedCampaign !== "all") q = q.eq("campaign_id", selectedCampaign);
        return q;
      };

      const [callsRes, apptsRes, sessRes, contactsRes, callbacksRes, dncRes, techRes, fuRes] = await Promise.all([
        buildCall(),
        buildAppt(),
        buildSessions(),
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase
          .from("callbacks")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lte("callback_at", new Date().toISOString()),
        supabase.from("dnc_entries").select("id", { count: "exact", head: true }),
        buildTechAppts(),
        buildFollowUps(),
      ]);

      setCalls(callsRes.data || []);
      setAppointments(apptsRes.data || []);
      setSessions((sessRes.data as SessionRow[]) || []);
      setTotalContacts(contactsRes.count || 0);
      setCallbackBacklog(callbacksRes.count || 0);
      setDncCount(dncRes.count || 0);
      setTechAppts((techRes.data as TechApptRow[]) || []);
      setFollowUps((fuRes.data as FollowUpRow[]) || []);
      setLoading(false);
    };
    fetchAll();
  }, [range, selectedCampaign]);

  const campaignName = (id: string | null) =>
    id ? campaigns.find((c) => c.id === id)?.name || "Unknown" : "—";
  const agentName = (id: string | null) => {
    if (!id) return "Unassigned";
    const p = profiles.find((x) => x.user_id === id);
    return p?.display_name || p?.email?.split("@")[0] || id.slice(0, 8);
  };
  const techName = (id: string | null) =>
    id ? technicians.find((t) => t.id === id)?.name || "Unknown" : "—";

  // ----- Appointment history (sales + technician) -----
  const appointmentHistory = useMemo(() => {
    const sales = appointments.map((a) => ({
      id: a.id,
      type: "Sales" as const,
      when: a.appointment_at,
      created_at: a.created_at,
      status: a.status || "booked",
      campaign: campaignName(a.campaign_id),
      who: agentName(a.agent_id),
    }));
    const tech = techAppts.map((t) => ({
      id: t.id,
      type: "Technician" as const,
      when: t.start_time,
      created_at: t.created_at,
      status: t.status,
      campaign: campaignName(t.campaign_id),
      who: techName(t.technician_id),
    }));
    return [...sales, ...tech].sort((a, b) => b.when.localeCompare(a.when));
  }, [appointments, techAppts, campaigns, profiles, technicians]);

  // ----- Tech appointment status breakdown -----
  const techStatusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of techAppts) map.set(t.status, (map.get(t.status) || 0) + 1);
    return Array.from(map.entries()).map(([status, value]) => ({
      name: status.replace(/_/g, " "),
      value,
    }));
  }, [techAppts]);

  // ----- Follow-up task stats -----
  const followUpStats = useMemo(() => {
    const total = followUps.length;
    const completed = followUps.filter((f) => f.status === "completed").length;
    const pending = followUps.filter((f) => f.status === "pending").length;
    const overdue = followUps.filter(
      (f) => f.status === "pending" && new Date(f.due_at) < new Date(),
    ).length;
    return { total, completed, pending, overdue, completionRate: total ? (completed / total) * 100 : 0 };
  }, [followUps]);

  const apptStatusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) map.set(a.status || "booked", (map.get(a.status || "booked") || 0) + 1);
    return Array.from(map.entries()).map(([status, value]) => ({
      name: status.replace(/_/g, " "), value,
    }));
  }, [appointments]);

  // ----- Core ROI metrics -----
  const metrics = useMemo(() => {
    const totalAttempts = calls.length;
    const connects = calls.filter((c) => CONNECTED_OUTCOMES.has(c.outcome ?? "")).length;
    const conversations = calls.filter((c) => CONVERSATION_OUTCOMES.has(c.outcome ?? "")).length;
    const booked = appointments.length;
    const recordingsAvailable = calls.filter((c) => c.call_recording_id).length;

    // avg attempts to connect: per contact, count attempts up to and including the first connect
    const perContact = new Map<string, CallRow[]>();
    for (const c of calls) {
      if (!c.contact_id) continue;
      const arr = perContact.get(c.contact_id) ?? [];
      arr.push(c);
      perContact.set(c.contact_id, arr);
    }
    let attemptsToConnectSum = 0;
    let connectedContactCount = 0;
    perContact.forEach((rows) => {
      rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
      let attempts = 0;
      for (const r of rows) {
        attempts++;
        if (CONNECTED_OUTCOMES.has(r.outcome ?? "")) {
          attemptsToConnectSum += attempts;
          connectedContactCount++;
          break;
        }
      }
    });
    const avgAttemptsToConnect =
      connectedContactCount > 0 ? attemptsToConnectSum / connectedContactCount : 0;

    return {
      totalAttempts,
      connects,
      conversations,
      booked,
      recordingsAvailable,
      avgAttemptsToConnect,
      connectRate: totalAttempts > 0 ? (connects / totalAttempts) * 100 : 0,
      conversationRate: totalAttempts > 0 ? (conversations / totalAttempts) * 100 : 0,
      bookingRate: connects > 0 ? (booked / connects) * 100 : 0,
      recordingRate: totalAttempts > 0 ? (recordingsAvailable / totalAttempts) * 100 : 0,
    };
  }, [calls, appointments]);

  // ----- Outcomes by disposition -----
  const dispoBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of calls) {
      const key = c.disposition || c.outcome || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([code, value]) => ({ code, name: code.replace(/_/g, " "), value }))
      .sort((a, b) => b.value - a.value);
  }, [calls]);

  // ----- Appointments by campaign / agent -----
  const apptByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      const key = a.campaign_id ?? "none";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ name: campaignName(id === "none" ? null : id), count }))
      .sort((a, b) => b.count - a.count);
  }, [appointments, campaigns]);

  const apptByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      const key = a.agent_id ?? "none";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ name: agentName(id === "none" ? null : id), count }))
      .sort((a, b) => b.count - a.count);
  }, [appointments, profiles]);

  // ----- Daily trend -----
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { attempts: number; connects: number; appts: number }>();
    for (const c of calls) {
      const day = c.created_at.slice(0, 10);
      const e = map.get(day) || { attempts: 0, connects: 0, appts: 0 };
      e.attempts++;
      if (CONNECTED_OUTCOMES.has(c.outcome ?? "")) e.connects++;
      map.set(day, e);
    }
    for (const a of appointments) {
      const day = a.created_at.slice(0, 10);
      const e = map.get(day) || { attempts: 0, connects: 0, appts: 0 };
      e.appts++;
      map.set(day, e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...v,
      }));
  }, [calls, appointments]);

  // ----- Agent session time -----
  const agentSessions = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const duration = Math.max(0, Math.floor((end - start) / 1000) - (s.paused_seconds || 0));
      map.set(s.agent_id, (map.get(s.agent_id) || 0) + duration);
    }
    return Array.from(map.entries())
      .map(([agent_id, seconds]) => ({ agent: agentName(agent_id), seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [sessions, profiles]);

  // ----- Per-agent ROI table -----
  const agentTable = useMemo(() => {
    const map = new Map<string, { attempts: number; connects: number; appts: number; talk: number }>();
    for (const c of calls) {
      const id = c.agent_id ?? "none";
      const e = map.get(id) || { attempts: 0, connects: 0, appts: 0, talk: 0 };
      e.attempts++;
      if (CONNECTED_OUTCOMES.has(c.outcome ?? "")) e.connects++;
      e.talk += c.duration_seconds || 0;
      map.set(id, e);
    }
    for (const a of appointments) {
      const id = a.agent_id ?? "none";
      const e = map.get(id) || { attempts: 0, connects: 0, appts: 0, talk: 0 };
      e.appts++;
      map.set(id, e);
    }
    return Array.from(map.entries())
      .map(([agent_id, v]) => ({
        agent: agentName(agent_id === "none" ? null : agent_id),
        attempts: v.attempts,
        connects: v.connects,
        appts: v.appts,
        talkTime: v.talk,
        connectRate: v.attempts > 0 ? (v.connects / v.attempts) * 100 : 0,
        bookingRate: v.connects > 0 ? (v.appts / v.connects) * 100 : 0,
      }))
      .sort((a, b) => b.appts - a.appts);
  }, [calls, appointments, profiles]);

  const handleExport = () => {
    const stamp = `${range.from.toISOString().slice(0,10)}-to-${range.to.toISOString().slice(0,10)}`;
    exportToCsv(`reports-agents-${stamp}`, agentTable, [
      { key: "agent", label: "Agent" },
      { key: "attempts", label: "Dial Attempts" },
      { key: "connects", label: "Connects" },
      { key: "appts", label: "Appointments" },
      { key: "connectRate", label: "Connect Rate %" },
      { key: "bookingRate", label: "Booking Rate %" },
      { key: "talkTime", label: "Talk Time (s)" },
    ]);
    exportToCsv(`reports-appointment-history-${stamp}`, appointmentHistory.map((a) => ({
      type: a.type,
      scheduled_for: new Date(a.when).toISOString(),
      created_at: new Date(a.created_at).toISOString(),
      status: a.status,
      campaign: a.campaign,
      assignee: a.who,
    })), [
      { key: "type", label: "Type" },
      { key: "scheduled_for", label: "Scheduled For" },
      { key: "created_at", label: "Booked On" },
      { key: "status", label: "Status" },
      { key: "campaign", label: "Campaign" },
      { key: "assignee", label: "Agent / Technician" },
    ]);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Outbound roofing performance and ROI</p>
      </div>

      <ReportFilters
        range={range}
        onRangeChange={setRange}
        campaigns={campaigns}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onExport={handleExport}
        exportLabel="Export agents CSV"
      />

      {/* Top KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Leads loaded" value={totalContacts.toLocaleString()} icon={Users} loading={loading} hint="all-time" />
        <StatCard label="Dial attempts" value={metrics.totalAttempts.toLocaleString()} icon={Phone} loading={loading} accent="primary" />
        <StatCard label="Connect rate" value={`${metrics.connectRate.toFixed(1)}%`} icon={PhoneIncoming} loading={loading} accent="success" hint={`${metrics.connects} connects`} />
        <StatCard label="Conversation rate" value={`${metrics.conversationRate.toFixed(1)}%`} icon={BarChart3} loading={loading} hint={`${metrics.conversations} convos`} />
        <StatCard label="Booking rate" value={`${metrics.bookingRate.toFixed(1)}%`} icon={Target} loading={loading} accent="success" hint="of connects" />
        <StatCard label="Avg attempts → connect" value={metrics.avgAttemptsToConnect.toFixed(1)} icon={Repeat} loading={loading} />
        <StatCard label="Appointments" value={metrics.booked.toLocaleString()} icon={CalendarClock} loading={loading} accent="success" />
        <StatCard label="Callback backlog" value={callbackBacklog.toLocaleString()} icon={CalendarClock} loading={loading} accent={callbackBacklog > 0 ? "warning" : "default"} hint="overdue or due now" />
        <StatCard label="DNC entries" value={dncCount.toLocaleString()} icon={ShieldOff} loading={loading} accent="destructive" />
        <StatCard label="Recordings available" value={`${metrics.recordingRate.toFixed(0)}%`} icon={Disc3} loading={loading} hint={`${metrics.recordingsAvailable} of ${metrics.totalAttempts}`} />
        <StatCard label="Active agents" value={new Set(calls.map((c) => c.agent_id).filter(Boolean)).size} icon={Users} loading={loading} />
        <StatCard label="Total talk time" value={fmtDuration(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0))} icon={TrendingUp} loading={loading} />
        <StatCard label="Tech visits" value={techAppts.length.toLocaleString()} icon={Wrench} loading={loading} accent="primary" hint={`${techAppts.filter(t => t.status === "completed").length} completed`} />
        <StatCard label="Tech no-shows" value={techAppts.filter(t => t.status === "no_show").length.toLocaleString()} icon={XCircle} loading={loading} accent="destructive" />
        <StatCard label="Follow-ups" value={followUpStats.total.toLocaleString()} icon={ClipboardList} loading={loading} hint={`${followUpStats.overdue} overdue`} accent={followUpStats.overdue > 0 ? "warning" : "default"} />
        <StatCard label="Follow-up completion" value={`${followUpStats.completionRate.toFixed(0)}%`} icon={CheckCircle2} loading={loading} accent="success" hint={`${followUpStats.completed}/${followUpStats.total}`} />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Daily activity</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : dailyTrend.length === 0 ? (
            <EmptyState icon={BarChart3} title="No activity in this range" description="Adjust the date range or pick a different campaign." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="attempts" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Attempts" />
                <Line type="monotone" dataKey="connects" stroke="#10b981" strokeWidth={2} dot={false} name="Connects" />
                <Line type="monotone" dataKey="appts" stroke="#f59e0b" strokeWidth={2} dot={false} name="Appointments" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outcomes by disposition */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Outcomes by disposition</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : dispoBreakdown.length === 0 ? (
              <EmptyState icon={Phone} title="No call outcomes yet" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dispoBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {dispoBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Appointments by campaign */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Appointments by campaign</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : apptByCampaign.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No appointments yet" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={apptByCampaign} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Appointments by agent */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Appointments by agent</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : apptByAgent.length === 0 ? (
              <EmptyState icon={Users} title="No agent appointments yet" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={apptByAgent} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Agent session time */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Agent session time</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : agentSessions.length === 0 ? (
              <EmptyState icon={Users} title="No active sessions in range" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Active time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentSessions.map((a) => (
                    <TableRow key={a.agent}>
                      <TableCell className="font-medium">{a.agent}</TableCell>
                      <TableCell className="text-right">{fmtDuration(a.seconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-agent ROI table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Agent ROI breakdown</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : agentTable.length === 0 ? (
            <EmptyState icon={Users} title="No agent activity in range" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Connects</TableHead>
                  <TableHead className="text-right">Connect %</TableHead>
                  <TableHead className="text-right">Appts</TableHead>
                  <TableHead className="text-right">Booking %</TableHead>
                  <TableHead className="text-right">Talk time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentTable.map((a) => (
                  <TableRow key={a.agent}>
                    <TableCell className="font-medium">{a.agent}</TableCell>
                    <TableCell className="text-right">{a.attempts}</TableCell>
                    <TableCell className="text-right">{a.connects}</TableCell>
                    <TableCell className="text-right">{a.connectRate.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-green-500 border-green-500/30">{a.appts}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{a.bookingRate.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{fmtDuration(a.talkTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sales vs Technician appointment status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarClock className="w-5 h-5" />Sales appointment status</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[260px] w-full" /> : apptStatusBreakdown.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No sales appointments yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={apptStatusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {apptStatusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="w-5 h-5" />Technician visit status</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[260px] w-full" /> : techStatusBreakdown.length === 0 ? (
              <EmptyState icon={Wrench} title="No technician visits in range" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={techStatusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {techStatusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full appointment history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            Appointment history ({appointmentHistory.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : appointmentHistory.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No appointments in range" description="Sales and technician appointments will appear here once booked." />
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Scheduled for</TableHead>
                    <TableHead>Booked on</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Agent / Technician</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointmentHistory.slice(0, 200).map((a) => (
                    <TableRow key={`${a.type}-${a.id}`}>
                      <TableCell>
                        <Badge variant="outline" className={a.type === "Technician" ? "text-purple-400 border-purple-400/30" : "text-primary border-primary/30"}>
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{new Date(a.when).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{a.campaign}</TableCell>
                      <TableCell>{a.who}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{a.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {appointmentHistory.length > 200 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Showing first 200 of {appointmentHistory.length}. Export CSV for the full list.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}