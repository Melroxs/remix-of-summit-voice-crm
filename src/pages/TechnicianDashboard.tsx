import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, addDays, isAfter, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wrench,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Mail,
  Navigation,
  User,
  Briefcase,
  AlertCircle,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";

interface Technician {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  home_address: string | null;
  skills: string[];
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  is_active: boolean;
  user_id: string | null;
}

interface TechAppt {
  id: string;
  technician_id: string;
  start_time: string;
  end_time: string;
  status: string;
  lead_address: string | null;
  required_skill: string | null;
  notes: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  appointment_id: string | null;
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    phone_e164: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    timezone: string | null;
  } | null;
  appointment?: {
    id: string;
    appointment_at: string;
    appointment_type: string;
    job_type: string | null;
    urgency: string;
    notes: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;
  campaign?: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-primary/15 text-primary border-primary/30",
  en_route: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  on_site: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  completed: "bg-green-500/15 text-green-300 border-green-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_OPTIONS = ["scheduled", "en_route", "on_site", "completed", "cancelled", "no_show"];

export default function TechnicianDashboard() {
  const { user, isAdmin, isTechnician } = useAuth();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

  // Load technicians (admins see all, technicians see only themselves via RLS)
  const { data: technicians = [], isLoading: loadingTechs } = useQuery({
    queryKey: ["technician-dashboard-techs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technicians")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Technician[];
    },
  });

  // Auto-select: technician role -> own record; admin -> first
  const activeTech = useMemo(() => {
    if (selectedTechId) return technicians.find((t) => t.id === selectedTechId) ?? null;
    if (isTechnician && user) {
      return technicians.find((t) => t.user_id === user.id) ?? null;
    }
    return technicians[0] ?? null;
  }, [technicians, selectedTechId, isTechnician, user]);

  const { data: appointments = [], refetch } = useQuery({
    queryKey: ["tech-dash-appts", activeTech?.id],
    enabled: !!activeTech?.id,
    queryFn: async () => {
      const { data: base, error: baseErr } = await supabase
        .from("technician_appointments")
        .select("*")
        .eq("technician_id", activeTech!.id)
        .order("start_time", { ascending: true });
      if (baseErr) throw baseErr;

      const contactIds = Array.from(new Set((base ?? []).map((a) => a.contact_id).filter(Boolean) as string[]));
      const apptIds = Array.from(new Set((base ?? []).map((a) => a.appointment_id).filter(Boolean) as string[]));
      const campIds = Array.from(new Set((base ?? []).map((a) => a.campaign_id).filter(Boolean) as string[]));

      const [contactsRes, apptsRes, campsRes] = await Promise.all([
        contactIds.length
          ? supabase.from("contacts").select("id, first_name, last_name, phone_e164, email, address, city, state, zip_code, timezone").in("id", contactIds)
          : Promise.resolve({ data: [] as any[] }),
        apptIds.length
          ? supabase.from("appointments").select("id, appointment_at, appointment_type, job_type, urgency, notes, address, city, state, zip_code").in("id", apptIds)
          : Promise.resolve({ data: [] as any[] }),
        campIds.length
          ? supabase.from("campaigns").select("id, name").in("id", campIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const cMap = new Map(((contactsRes.data ?? []) as any[]).map((c) => [c.id, c]));
      const aMap = new Map(((apptsRes.data ?? []) as any[]).map((a) => [a.id, a]));
      const kMap = new Map(((campsRes.data ?? []) as any[]).map((c) => [c.id, c]));

      return (base ?? []).map((row: any) => ({
        ...row,
        contact: row.contact_id ? cMap.get(row.contact_id) ?? null : null,
        appointment: row.appointment_id ? aMap.get(row.appointment_id) ?? null : null,
        campaign: row.campaign_id ? kMap.get(row.campaign_id) ?? null : null,
      })) as TechAppt[];
    },
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrow = addDays(todayStart, 1);
  const weekEnd = addDays(todayStart, 7);

  const todayAppts = appointments.filter((a) => {
    const s = new Date(a.start_time);
    return s >= todayStart && s < tomorrow;
  });
  const upcomingAppts = appointments.filter((a) => {
    const s = new Date(a.start_time);
    return isAfter(s, tomorrow) && isBefore(s, weekEnd);
  });
  const pastAppts = appointments
    .filter((a) => new Date(a.end_time) < todayStart)
    .slice(-10)
    .reverse();

  const stats = {
    today: todayAppts.length,
    upcoming: upcomingAppts.length,
    completed: appointments.filter((a) => a.status === "completed").length,
    pending: appointments.filter((a) => ["scheduled", "en_route", "on_site"].includes(a.status)).length,
  };

  const updateStatus = async (apptId: string, status: string) => {
    const { error } = await supabase
      .from("technician_appointments")
      .update({ status: status as "scheduled" | "en_route" | "on_site" | "completed" | "cancelled" | "no_show" })
      .eq("id", apptId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Status updated");
      refetch();
    }
  };

  if (loadingTechs) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (technicians.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Wrench className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No technician records available.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Technician Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Field schedule, appointment details, and status updates.
          </p>
        </div>
        {(isAdmin || technicians.length > 1) && (
          <Select
            value={activeTech?.id ?? ""}
            onValueChange={(v) => setSelectedTechId(v)}
          >
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue placeholder="Select technician" />
            </SelectTrigger>
            <SelectContent>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {activeTech && (
        <>
          {/* Technician profile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap">
                <Wrench className="w-5 h-5 text-primary" />
                {activeTech.name}
                {!activeTech.is_active && (
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    Inactive
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div className="space-y-2">
                {activeTech.phone && (
                  <a href={`tel:${activeTech.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                    <Phone className="w-4 h-4" />
                    <span>{activeTech.phone}</span>
                  </a>
                )}
                {activeTech.email && (
                  <a href={`mailto:${activeTech.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary break-all">
                    <Mail className="w-4 h-4" />
                    <span>{activeTech.email}</span>
                  </a>
                )}
                {activeTech.home_address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{activeTech.home_address}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    {activeTech.working_hours_start.slice(0, 5)}–{activeTech.working_hours_end.slice(0, 5)}
                  </span>
                </div>
                {activeTech.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {activeTech.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <StatTile icon={CalendarDays} label="Today" value={stats.today} />
            <StatTile icon={Clock} label="Pending" value={stats.pending} />
            <StatTile icon={Navigation} label="Upcoming (7d)" value={stats.upcoming} />
            <StatTile icon={CheckCircle2} label="Completed" value={stats.completed} />
          </div>

          {/* Today */}
          <ApptList
            title="Today"
            appts={todayAppts}
            emptyText="No appointments scheduled for today."
            onUpdateStatus={updateStatus}
          />

          {/* Upcoming */}
          <ApptList
            title="Upcoming (next 7 days)"
            appts={upcomingAppts}
            emptyText="No upcoming appointments."
            onUpdateStatus={updateStatus}
          />

          {/* Past */}
          <ApptList
            title="Recent history"
            appts={pastAppts}
            emptyText="No past appointments."
            onUpdateStatus={updateStatus}
            readOnly
          />
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wrench;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-md bg-primary/10 text-primary shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xl sm:text-2xl font-bold">{value}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </div>
    </Card>
  );
}

function ApptList({
  title,
  appts,
  emptyText,
  onUpdateStatus,
  readOnly = false,
}: {
  title: string;
  appts: TechAppt[];
  emptyText: string;
  onUpdateStatus: (id: string, status: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {appts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {appts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-md border border-border bg-muted/20"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {format(new Date(a.start_time), "MMM d, HH:mm")} –{" "}
                      {format(new Date(a.end_time), "HH:mm")}
                    </span>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[a.status] ?? ""}`}>
                      {a.status.replace("_", " ")}
                    </Badge>
                    {a.required_skill && (
                      <Badge variant="secondary" className="text-xs">
                        {a.required_skill}
                      </Badge>
                    )}
                    {a.appointment?.urgency && a.appointment.urgency !== "medium" && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          a.appointment.urgency === "high" || a.appointment.urgency === "urgent"
                            ? "bg-destructive/15 text-destructive border-destructive/30"
                            : ""
                        }`}
                      >
                        <AlertCircle className="w-3 h-3 mr-0.5" />
                        {a.appointment.urgency}
                      </Badge>
                    )}
                    {a.appointment?.appointment_type && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {a.appointment.appointment_type.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>

                  {/* Customer */}
                  {a.contact && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <User className="w-3.5 h-3.5 text-primary" />
                        {a.contact.first_name} {a.contact.last_name}
                      </div>
                      {a.contact.phone_e164 && (
                        <a
                          href={`tel:${a.contact.phone_e164}`}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Phone className="w-3 h-3" />
                          {a.contact.phone_e164}
                        </a>
                      )}
                      {a.contact.email && (
                        <a
                          href={`mailto:${a.contact.email}`}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary break-all"
                        >
                          <Mail className="w-3 h-3" />
                          {a.contact.email}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Job type & campaign */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {a.appointment?.job_type && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> {a.appointment.job_type}
                      </span>
                    )}
                    {a.campaign?.name && (
                      <span className="flex items-center gap-1">
                        <Megaphone className="w-3 h-3" /> {a.campaign.name}
                      </span>
                    )}
                  </div>

                  {a.lead_address && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="break-words">{a.lead_address}</span>
                    </div>
                  )}
                  {(a.notes || a.appointment?.notes) && (
                    <div className="text-xs text-muted-foreground mt-1.5 p-2 rounded bg-muted/30 border border-border/50">
                      {a.notes && <div className="whitespace-pre-wrap">{a.notes}</div>}
                      {a.appointment?.notes && a.appointment.notes !== a.notes && (
                        <div className="whitespace-pre-wrap mt-1 italic">
                          Sales note: {a.appointment.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap w-full sm:w-auto">
                    {a.lead_address && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-none"
                        asChild
                      >
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(a.lead_address)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation className="w-3.5 h-3.5 mr-1" />
                          Navigate
                        </a>
                      </Button>
                    )}
                    <Select
                      value={a.status}
                      onValueChange={(v) => onUpdateStatus(a.id, v)}
                    >
                      <SelectTrigger className="flex-1 sm:flex-none sm:w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {s.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}