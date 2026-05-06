import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, CalendarClock, TrendingUp, Users, BarChart3, Disc3, Play, Square, Sparkles,
  Wrench, MapPin, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { useRef } from "react";
import { ReportFilters, type DateRange, rangeFromPreset } from "@/components/reports/ReportFilters";
import { StatCard } from "@/components/reports/StatCard";
import { EmptyState } from "@/components/reports/EmptyState";
import { exportToCsv } from "@/lib/export-csv";

interface AppointmentRow {
  id: string;
  appointment_at: string;
  status: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  job_type: string | null;
  contact_name: string;
  campaign_name: string | null;
}

interface SummaryRow {
  id: string;
  summary: string;
  lead_quality_score: number | null;
  recommended_action: string | null;
  created_at: string;
  contact_name: string;
}

interface RecordingRow {
  id: string;
  duration_seconds: number | null;
  created_at: string;
  contact_name: string;
  has_audio: boolean;
  campaign_name: string | null;
}

interface TechApptRow {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  lead_address: string | null;
  required_skill: string | null;
  notes: string | null;
  technician_name: string;
  technician_phone: string | null;
  contact_name: string | null;
  campaign_name: string | null;
}

const CONNECTED = new Set([
  "connected", "appointment_booked", "callback_scheduled",
  "not_interested", "dnc_request", "already_customer", "wrong_number",
]);

function fmtDuration(s: number | null) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ClientPortal() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(30));
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);

  const [stats, setStats] = useState({
    totalCalls: 0,
    connects: 0,
    appointmentsBooked: 0,
    completed: 0,
    noShows: 0,
    showRate: 0,
    upcoming: 0,
  });
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [leadStatus, setLeadStatus] = useState<Record<string, number>>({});
  const [techAppts, setTechAppts] = useState<TechApptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Resolve client's accessible campaigns
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: clientUsers } = await supabase
        .from("client_users").select("client_account_id").eq("user_id", user.id);
      const accountIds = (clientUsers || []).map((c) => c.client_account_id);
      if (accountIds.length === 0) {
        setLoading(false);
        return;
      }
      const { data: camps } = await supabase
        .from("campaigns").select("id, name").in("client_account_id", accountIds).order("name");
      setCampaigns(camps || []);
      setCampaignIds((camps || []).map((c) => c.id));
    })();
  }, [user]);

  // Fetch portal data
  useEffect(() => {
    if (campaignIds.length === 0) {
      setLoading(false);
      return;
    }
    const ids = selectedCampaign === "all" ? campaignIds : [selectedCampaign];
    const fromIso = new Date(range.from).toISOString();
    const toIso = new Date(new Date(range.to).setHours(23, 59, 59, 999)).toISOString();

    const fetchAll = async () => {
      setLoading(true);
      const [callsRes, apptsRes, upcomingRes, summariesRes, recordingsRes, leadsRes] =
        await Promise.all([
          supabase
            .from("call_attempts")
            .select("id, outcome")
            .in("campaign_id", ids)
            .gte("created_at", fromIso).lte("created_at", toIso)
            .limit(5000),
          supabase
            .from("appointments")
            .select("id, status")
            .in("campaign_id", ids)
            .gte("created_at", fromIso).lte("created_at", toIso)
            .limit(5000),
          supabase
            .from("appointments")
            .select("id, appointment_at, status, address, city, state, job_type, contact_id, campaign_id")
            .in("campaign_id", ids)
            .gte("appointment_at", new Date().toISOString())
            .order("appointment_at", { ascending: true })
            .limit(20),
          supabase
            .from("ai_summaries")
            .select("id, summary, lead_quality_score, recommended_action, created_at, contact_id, campaign_id")
            .in("campaign_id", ids)
            .gte("created_at", fromIso).lte("created_at", toIso)
            .order("created_at", { ascending: false })
            .limit(15),
          supabase
            .from("call_recordings")
            .select("id, duration_seconds, created_at, telnyx_recording_id, recording_url, call_attempts!inner(campaign_id, contacts(first_name, last_name), campaigns(name))")
            .in("call_attempts.campaign_id", ids)
            .gte("created_at", fromIso).lte("created_at", toIso)
            .order("created_at", { ascending: false })
            .limit(25),
          supabase
            .from("campaign_contacts")
            .select("contact_id, contacts!inner(lead_status)")
            .in("campaign_id", ids)
            .limit(5000),
        ]);

      // Stats
      const callsArr = callsRes.data || [];
      const apptsArr = apptsRes.data || [];
      const completedCount = apptsArr.filter((a) => a.status === "completed").length;
      const noShowCount = apptsArr.filter((a) => a.status === "no_show").length;
      const connectsCount = callsArr.filter((c) => CONNECTED.has(c.outcome ?? "")).length;

      setStats({
        totalCalls: callsArr.length,
        connects: connectsCount,
        appointmentsBooked: apptsArr.length,
        completed: completedCount,
        noShows: noShowCount,
        showRate: apptsArr.length > 0 ? Math.round((completedCount / apptsArr.length) * 100) : 0,
        upcoming: upcomingRes.data?.length || 0,
      });

      // Upcoming appointments — enrich with contact + campaign names
      const upcomingData = upcomingRes.data || [];
      const summaryData = summariesRes.data || [];
      const allContactIds = Array.from(new Set([
        ...upcomingData.map((a) => a.contact_id),
        ...summaryData.map((s) => s.contact_id).filter(Boolean) as string[],
      ]));
      const { data: contactsData } = allContactIds.length
        ? await supabase.from("contacts").select("id, first_name, last_name").in("id", allContactIds)
        : { data: [] as { id: string; first_name: string; last_name: string }[] };
      const cMap = new Map((contactsData || []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));
      const campMap = new Map(campaigns.map((c) => [c.id, c.name]));

      setUpcoming(upcomingData.map((a) => ({
        id: a.id,
        appointment_at: a.appointment_at,
        status: a.status,
        address: a.address,
        city: a.city,
        state: a.state,
        job_type: a.job_type,
        contact_name: cMap.get(a.contact_id) || "Unknown",
        campaign_name: campMap.get(a.campaign_id || "") || null,
      })));

      setSummaries(summaryData.map((s: any) => ({
        id: s.id,
        summary: s.summary,
        lead_quality_score: s.lead_quality_score,
        recommended_action: s.recommended_action,
        created_at: s.created_at,
        contact_name: cMap.get(s.contact_id) || "Unknown",
      })));

      setRecordings((recordingsRes.data || []).map((r: any) => ({
        id: r.id,
        duration_seconds: r.duration_seconds,
        created_at: r.created_at,
        contact_name: r.call_attempts?.contacts
          ? `${r.call_attempts.contacts.first_name} ${r.call_attempts.contacts.last_name}`
          : "Unknown",
        has_audio: Boolean(r.telnyx_recording_id || r.recording_url),
        campaign_name: r.call_attempts?.campaigns?.name || null,
      })));

      // Lead status counts
      const counts: Record<string, number> = {};
      for (const row of (leadsRes.data || []) as any[]) {
        const s = row.contacts?.lead_status || "new";
        counts[s] = (counts[s] || 0) + 1;
      }
      setLeadStatus(counts);

      // Technician appointments — same company as the client's campaigns
      const { data: techAppointmentsData } = await supabase
        .from("technician_appointments")
        .select("id, start_time, end_time, status, lead_address, required_skill, notes, technician_id, contact_id, campaign_id")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(50);

      const techIds = Array.from(new Set((techAppointmentsData || []).map((t) => t.technician_id)));
      const techContactIds = Array.from(new Set(
        (techAppointmentsData || []).map((t) => t.contact_id).filter(Boolean) as string[],
      ));
      const [{ data: techData }, { data: techContacts }] = await Promise.all([
        techIds.length
          ? supabase.from("technicians").select("id, name, phone").in("id", techIds)
          : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
        techContactIds.length
          ? supabase.from("contacts").select("id, first_name, last_name").in("id", techContactIds)
          : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
      ]);
      const tMap = new Map((techData || []).map((t) => [t.id, t]));
      const tcMap = new Map((techContacts || []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

      // Restrict to client's accessible campaigns (or unassigned-to-campaign rows in same company)
      const allowedCampaignIds = new Set(ids);
      setTechAppts((techAppointmentsData || [])
        .filter((t) => !t.campaign_id || allowedCampaignIds.has(t.campaign_id))
        .map((t) => ({
          id: t.id,
          start_time: t.start_time,
          end_time: t.end_time,
          status: t.status,
          lead_address: t.lead_address,
          required_skill: t.required_skill,
          notes: t.notes,
          technician_name: tMap.get(t.technician_id)?.name || "Unknown",
          technician_phone: tMap.get(t.technician_id)?.phone || null,
          contact_name: t.contact_id ? tcMap.get(t.contact_id) || null : null,
          campaign_name: t.campaign_id ? campMap.get(t.campaign_id) || null : null,
        })));

      setLoading(false);
    };
    fetchAll();
  }, [campaignIds, selectedCampaign, range, campaigns]);

  const getSecureUrl = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("get-recording-url", {
      body: { call_recording_id: id },
    });
    if (error || !data?.url) return null;
    return data.url as string;
  };

  const handlePlay = async (rec: RecordingRow) => {
    if (playingId === rec.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingId(rec.id);
    const url = await getSecureUrl(rec.id);
    if (!url) { setPlayingId(null); return; }
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audioRef.current = audio;
  };

  const handleExport = () => {
    exportToCsv(
      `client-appointments-${range.from.toISOString().slice(0,10)}-to-${range.to.toISOString().slice(0,10)}`,
      upcoming.map((a) => ({
        date: format(new Date(a.appointment_at), "yyyy-MM-dd HH:mm"),
        contact: a.contact_name,
        status: a.status || "booked",
        job_type: a.job_type || "",
        address: [a.address, a.city, a.state].filter(Boolean).join(", "),
        campaign: a.campaign_name || "",
      })),
      [
        { key: "date", label: "Appointment" },
        { key: "contact", label: "Contact" },
        { key: "status", label: "Status" },
        { key: "job_type", label: "Job type" },
        { key: "address", label: "Address" },
        { key: "campaign", label: "Campaign" },
      ],
    );
  };

  const leadStatusEntries = useMemo(() => Object.entries(leadStatus).sort((a, b) => b[1] - a[1]), [leadStatus]);

  if (campaignIds.length === 0 && !loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Campaign performance overview</p>
        </div>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Users}
              title="No campaigns linked to your account yet"
              description="Once your account team links a campaign, you'll see appointments, summaries, and recordings here."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Portal</h1>
        <p className="text-muted-foreground text-sm mt-1">Your campaign performance and booked appointments</p>
      </div>

      <ReportFilters
        range={range}
        onRangeChange={setRange}
        campaigns={campaigns}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onExport={handleExport}
        exportLabel="Export appointments"
      />

      {/* Daily snapshot KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Calls made" value={stats.totalCalls.toLocaleString()} icon={Phone} loading={loading} accent="primary" />
        <StatCard label="Connects" value={stats.connects.toLocaleString()} icon={TrendingUp} loading={loading} accent="success" />
        <StatCard label="Appointments" value={stats.appointmentsBooked.toLocaleString()} icon={CalendarClock} loading={loading} accent="success" />
        <StatCard label="Completed" value={stats.completed.toLocaleString()} icon={Users} loading={loading} accent="success" />
        <StatCard label="Show rate" value={`${stats.showRate}%`} icon={BarChart3} loading={loading} hint={`${stats.noShows} no-shows`} accent={stats.showRate >= 70 ? "success" : "warning"} />
        <StatCard label="Upcoming" value={stats.upcoming.toLocaleString()} icon={CalendarClock} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Upcoming appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No upcoming appointments" description="Newly booked appointments will appear here." />
            ) : (
              <div className="space-y-2">
                {upcoming.map((a) => (
                  <div key={a.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{a.contact_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(a.appointment_at), "EEE MMM d, h:mm a")}
                          {a.job_type && ` • ${a.job_type}`}
                        </p>
                        {(a.address || a.city) && (
                          <p className="text-xs text-muted-foreground/80 truncate">
                            {[a.address, a.city, a.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{a.status || "booked"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead status visibility */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Lead pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : leadStatusEntries.length === 0 ? (
              <EmptyState icon={Users} title="No leads in this campaign yet" />
            ) : (
              <div className="space-y-2">
                {leadStatusEntries.map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-2 bg-muted/40 rounded">
                    <span className="text-sm text-foreground capitalize">{status.replace(/_/g, " ")}</span>
                    <span className="font-semibold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI summaries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Recent call summaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : summaries.length === 0 ? (
            <EmptyState icon={Sparkles} title="No summaries yet" description="AI-generated call summaries will appear here after calls complete." />
          ) : (
            <div className="space-y-3">
              {summaries.map((s) => (
                <div key={s.id} className="p-3 bg-muted/40 rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-medium text-sm text-foreground">{s.contact_name}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, h:mm a")}</p>
                    </div>
                    {s.lead_quality_score != null && (
                      <Badge variant="outline" className="shrink-0">Quality {s.lead_quality_score}/10</Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90 leading-snug">{s.summary}</p>
                  {s.recommended_action && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium text-foreground">Next:</span> {s.recommended_action}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recordings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Disc3 className="w-5 h-5" />
            Call recordings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : recordings.length === 0 ? (
            <EmptyState icon={Disc3} title="No recordings available yet" />
          ) : (
            <div className="space-y-2">
              {recordings.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={!r.has_audio}
                      onClick={() => handlePlay(r)}
                    >
                      {playingId === r.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{r.contact_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmtDuration(r.duration_seconds)} • {format(new Date(r.created_at), "MMM d, h:mm a")}
                        {r.campaign_name && ` • ${r.campaign_name}`}
                      </p>
                    </div>
                  </div>
                  {!r.has_audio && <Badge variant="outline" className="text-xs">Pending</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}