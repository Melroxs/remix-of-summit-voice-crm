import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, MapPin, User, Search, Wrench } from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface Appointment {
  id: string;
  appointment_at: string;
  status: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  contact_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  contacts?: { first_name: string; last_name: string; phone_e164: string | null } | null;
  campaigns?: { name: string } | null;
  source?: "sales" | "technician";
  technician_name?: string | null;
  end_at?: string | null;
}

const statusColor: Record<string, string> = {
  booked: "bg-primary/15 text-primary border-primary/30",
  confirmed: "bg-green-500/15 text-green-400 border-green-500/30",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  rescheduled: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  no_show: "bg-destructive/15 text-destructive border-destructive/30",
  replaced: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  en_route: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  on_site: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function Appointments() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("upcoming");

  useEffect(() => {
    loadAppointments();
  }, []);

  async function loadAppointments() {
    setLoading(true);
    const [salesRes, techRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*, contacts(first_name,last_name,phone_e164), campaigns(name)")
        .order("appointment_at", { ascending: true }),
      supabase
        .from("technician_appointments")
        .select(
          "id, technician_id, contact_id, campaign_id, lead_address, start_time, end_time, status, notes, technicians(name), contacts(first_name,last_name,phone_e164), campaigns(name)"
        )
        .order("start_time", { ascending: true }),
    ]);
    const sales: Appointment[] = ((salesRes.data as unknown as Appointment[]) ?? []).map(
      (a) => ({ ...a, source: "sales" }),
    );
    const tech: Appointment[] = ((techRes.data as unknown as Array<{
      id: string; technician_id: string; contact_id: string | null; campaign_id: string | null;
      lead_address: string | null; start_time: string; end_time: string; status: string;
      notes: string | null;
      technicians?: { name: string } | null;
      contacts?: { first_name: string; last_name: string; phone_e164: string | null } | null;
      campaigns?: { name: string } | null;
    }>) ?? []).map((t) => ({
      id: t.id,
      appointment_at: t.start_time,
      end_at: t.end_time,
      status: t.status,
      address: t.lead_address,
      city: null, state: null, zip_code: null,
      notes: t.notes,
      contact_id: t.contact_id ?? "",
      agent_id: null,
      campaign_id: t.campaign_id,
      contacts: t.contacts ?? null,
      campaigns: t.campaigns ?? null,
      source: "technician",
      technician_name: t.technicians?.name ?? null,
    }));
    const combined = [...sales, ...tech].sort(
      (a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime(),
    );
    setItems(combined);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    const item = items.find((i) => i.id === id);
    if (item?.source === "technician") {
      await supabase
        .from("technician_appointments")
        .update({ status: status as never })
        .eq("id", id);
    } else {
      await supabase.from("appointments").update({ status: status as never }).eq("id", id);
    }
    loadAppointments();
  }

  const filtered = useMemo(() => {
    const now = new Date();
    return items.filter((a) => {
      const at = new Date(a.appointment_at);
      if (rangeFilter === "today" && !isToday(at)) return false;
      if (rangeFilter === "tomorrow" && !isTomorrow(at)) return false;
      if (rangeFilter === "week" && !isThisWeek(at, { weekStartsOn: 1 })) return false;
      if (rangeFilter === "upcoming" && at < now) return false;
      if (rangeFilter === "past" && at >= now) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${a.contacts?.first_name ?? ""} ${a.contacts?.last_name ?? ""}`.toLowerCase();
        const loc = `${a.address ?? ""} ${a.city ?? ""} ${a.zip_code ?? ""}`.toLowerCase();
        if (!name.includes(q) && !loc.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, rangeFilter]);

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    filtered.forEach((a) => {
      const key = format(new Date(a.appointment_at), "EEEE, MMM d, yyyy");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "appointment" : "appointments"}
          </p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={rangeFilter} onValueChange={setRangeFilter}>
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="past">Past</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rescheduled">Rescheduled</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
            <SelectItem value="scheduled">Scheduled (tech)</SelectItem>
            <SelectItem value="en_route">En route</SelectItem>
            <SelectItem value="on_site">On site</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : grouped.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarClock className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No appointments match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, list]) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {day}
              </h2>
              <div className="space-y-2">
                {list.map((a) => (
                  <Card key={a.id} className="p-4 hover:border-primary/40 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center gap-3 md:w-32 shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex flex-col items-center justify-center">
                          <span className="text-xs text-muted-foreground leading-none">
                            {format(new Date(a.appointment_at), "MMM").toUpperCase()}
                          </span>
                          <span className="text-lg font-bold text-primary leading-none mt-0.5">
                            {format(new Date(a.appointment_at), "d")}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold">
                            {format(new Date(a.appointment_at), "h:mm a")}
                          </div>
                          <Badge
                            variant="outline"
                            className={statusColor[a.status ?? "booked"] ?? ""}
                          >
                            {a.status ?? "booked"}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {a.source === "technician" ? (
                            <Wrench className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <User className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">
                            {a.contacts?.first_name} {a.contacts?.last_name}
                          </span>
                          {a.contacts?.phone_e164 && (
                            <span className="text-xs text-muted-foreground">
                              {a.contacts.phone_e164}
                            </span>
                          )}
                          {a.source === "technician" && (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              Tech
                            </Badge>
                          )}
                        </div>
                        {a.source === "technician" && a.technician_name && (
                          <div className="text-xs text-muted-foreground">
                            Technician: {a.technician_name}
                            {a.end_at && (
                              <span> · ends {format(new Date(a.end_at), "h:mm a")}</span>
                            )}
                          </div>
                        )}
                        {(a.address || a.city) && (
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                              {[a.address, a.city, a.state, a.zip_code]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {a.campaigns?.name && (
                          <div className="text-xs text-muted-foreground">
                            Campaign: {a.campaigns.name}
                          </div>
                        )}
                        {a.notes && (
                          <p className="text-sm text-foreground/80 mt-1 line-clamp-2">
                            {a.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {a.status === "booked" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "confirmed")}>
                            Confirm
                          </Button>
                        )}
                        {a.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "completed")}>
                            Complete
                          </Button>
                        )}
                        {isAdmin && a.status !== "no_show" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "no_show")}>
                            No-show
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}