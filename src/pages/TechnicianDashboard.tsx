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
      const { data, error } = await supabase
        .from("technician_appointments")
        .select("*")
        .eq("technician_id", activeTech!.id)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TechAppt[];
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
      .update({ status })
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
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Technician Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Field schedule, appointment details, and status updates.
          </p>
        </div>
        {(isAdmin || technicians.length > 1) && (
          <Select
            value={activeTech?.id ?? ""}
            onValueChange={(v) => setSelectedTechId(v)}
          >
            <SelectTrigger className="w-[240px]">
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
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" />
                {activeTech.name}
                {!activeTech.is_active && (
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    Inactive
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                {activeTech.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{activeTech.phone}</span>
                  </div>
                )}
                {activeTech.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span>{activeTech.email}</span>
                  </div>
                )}
                {activeTech.home_address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 mt-0.5" />
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10 text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
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
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {appts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {appts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-md border border-border bg-muted/20"
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
                  </div>
                  {a.lead_address && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <MapPin className="w-3 h-3" /> {a.lead_address}
                    </div>
                  )}
                  {a.notes && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.notes}</div>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex gap-2 items-center">
                    {a.lead_address && (
                      <Button
                        size="sm"
                        variant="outline"
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
                      <SelectTrigger className="w-[140px] h-8 text-xs">
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