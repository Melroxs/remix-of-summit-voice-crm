import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  UserPlus,
  CalendarDays,
  Pencil,
} from "lucide-react";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { useTechnicians, type Technician } from "@/hooks/use-technicians";
import {
  useTechAppointments,
  type TechAppointment,
} from "@/hooks/use-technician-appointments";
import TechnicianModal from "@/components/technicians/TechnicianModal";
import TechnicianAppointmentModal from "@/components/technicians/TechnicianAppointmentModal";
import ManageTechniciansModal from "@/components/technicians/ManageTechniciansModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const HOUR_START = 7;
const HOUR_END = 19;
const SLOT_HEIGHT = 48; // px per hour

const statusColor: Record<string, string> = {
  scheduled: "bg-primary/20 border-primary/40 text-primary",
  en_route: "bg-amber-500/20 border-amber-500/40 text-amber-300",
  on_site: "bg-purple-500/20 border-purple-500/40 text-purple-300",
  completed: "bg-green-500/20 border-green-500/40 text-green-300",
  cancelled: "bg-muted border-border text-muted-foreground",
  no_show: "bg-destructive/20 border-destructive/40 text-destructive",
};

export default function TechnicianCalendar() {
  const { role } = useAuth();
  const isClient = role === "client";
  const isTechnician = role === "technician";
  const readOnly = isClient || isTechnician;
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<TechAppointment | null>(null);
  const [defaultTechId, setDefaultTechId] = useState<string | undefined>();
  const [manageOpen, setManageOpen] = useState(false);

  const { data: technicians = [], isLoading: loadingTechs } = useTechnicians();
  const dayStart = useMemo(() => startOfDay(date).toISOString(), [date]);
  const dayEnd = useMemo(() => addDays(startOfDay(date), 1).toISOString(), [date]);
  const { data: appointments = [] } = useTechAppointments(dayStart, dayEnd);

  const activeTechs = technicians.filter((t) => t.is_active);

  const openNewAppt = (techId?: string) => {
    setEditingAppt(null);
    setDefaultTechId(techId);
    setApptModalOpen(true);
  };

  const openEditAppt = (a: TechAppointment) => {
    setEditingAppt(a);
    setDefaultTechId(undefined);
    setApptModalOpen(true);
  };

  const openEditTech = (t: Technician) => {
    setEditingTech(t);
    setTechModalOpen(true);
  };

  const apptsByTech = useMemo(() => {
    const map = new Map<string, TechAppointment[]>();
    appointments
      .filter((a) => isSameDay(new Date(a.start_time), date))
      .forEach((a) => {
        const arr = map.get(a.technician_id) ?? [];
        arr.push(a);
        map.set(a.technician_id, arr);
      });
    return map;
  }, [appointments, date]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  const blockStyle = (a: TechAppointment) => {
    const s = new Date(a.start_time);
    const e = new Date(a.end_time);
    const startHrs = s.getHours() + s.getMinutes() / 60;
    const endHrs = e.getHours() + e.getMinutes() / 60;
    const top = (startHrs - HOUR_START) * SLOT_HEIGHT;
    const height = Math.max(24, (endHrs - startHrs) * SLOT_HEIGHT);
    return { top: `${top}px`, height: `${height}px` };
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isTechnician ? "My Calendar" : "Technician Calendar"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isClient
              ? "View scheduled on-site technician visits for your campaigns."
              : isTechnician
              ? "Full day view of your scheduled jobs and appointments."
              : "Schedule on-site technicians and track field appointments."}
          </p>
        </div>
        {!readOnly && <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <UserPlus className="w-4 h-4 mr-1.5" /> Add Technician
                <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  setEditingTech(null);
                  setTechModalOpen(true);
                }}
              >
                <UserPlus className="w-4 h-4 mr-2" /> New Technician
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManageOpen(true)}>
                <Users className="w-4 h-4 mr-2" /> Manage Technicians
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => openNewAppt()}>
            <Plus className="w-4 h-4 mr-1.5" /> Appointment
          </Button>
        </div>}
      </header>

      {/* Date nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-3 py-1.5 rounded-md bg-muted/30 text-sm font-medium min-w-[180px] text-center">
            {format(date, "EEEE, MMM d, yyyy")}
          </div>
          <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(startOfDay(new Date()))}>
            Today
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
        </div>
      </div>

      {loadingTechs ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : activeTechs.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-4">
            {isClient ? "No technicians configured yet." : "No active technicians yet."}
          </p>
          {!readOnly && (
            <Button onClick={() => { setEditingTech(null); setTechModalOpen(true); }}>
              <UserPlus className="w-4 h-4 mr-1.5" /> Add your first technician
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div className="flex min-w-fit">
            {/* Hours column */}
            <div className="w-16 shrink-0 border-r border-border">
              <div className="h-14 border-b border-border" />
              {hours.map((h) => (
                <div
                  key={h}
                  className="text-[10px] text-muted-foreground text-right pr-2 -mt-2"
                  style={{ height: `${SLOT_HEIGHT}px` }}
                >
                  {h.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Technician columns */}
            {activeTechs.map((tech) => {
              const appts = apptsByTech.get(tech.id) ?? [];
              return (
                <div key={tech.id} className="w-56 shrink-0 border-r border-border last:border-r-0">
                  {/* Header */}
                  <div className="h-14 border-b border-border px-2 py-1.5 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{tech.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {tech.working_hours_start.slice(0, 5)}–{tech.working_hours_end.slice(0, 5)}
                      </div>
                      {tech.skills.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {tech.skills.slice(0, 2).map((s) => (
                            <Badge key={s} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => openEditTech(tech)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Time grid */}
                  <div
                    className={`relative ${readOnly ? "" : "cursor-pointer"}`}
                    style={{ height: `${(HOUR_END - HOUR_START + 1) * SLOT_HEIGHT}px` }}
                    onClick={(e) => {
                      if (readOnly) return;
                      if ((e.target as HTMLElement).closest("[data-appt]")) return;
                      openNewAppt(tech.id);
                    }}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="border-b border-border/40"
                        style={{ height: `${SLOT_HEIGHT}px` }}
                      />
                    ))}
                    {appts.map((a) => (
                      <div
                        key={a.id}
                        data-appt
                        onClick={(e) => { e.stopPropagation(); if (!readOnly) openEditAppt(a); }}
                        className={`absolute left-1 right-1 rounded-md border px-1.5 py-1 overflow-hidden text-[11px] ${readOnly ? "" : "cursor-pointer hover:opacity-90"} ${statusColor[a.status]}`}
                        style={blockStyle(a)}
                      >
                        <div className="font-semibold truncate">
                          {format(new Date(a.start_time), "HH:mm")}–{format(new Date(a.end_time), "HH:mm")}
                        </div>
                        {a.lead_address && (
                          <div className="truncate opacity-80">{a.lead_address}</div>
                        )}
                        {a.required_skill && (
                          <div className="truncate opacity-70">{a.required_skill}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <TechnicianModal
        open={techModalOpen}
        onOpenChange={setTechModalOpen}
        technician={editingTech}
      />
      <TechnicianAppointmentModal
        open={apptModalOpen}
        onOpenChange={setApptModalOpen}
        appointment={editingAppt}
        defaultDate={date}
        defaultTechnicianId={defaultTechId}
      />
      <ManageTechniciansModal
        open={manageOpen}
        onOpenChange={setManageOpen}
        onEdit={(t) => {
          setEditingTech(t);
          setTechModalOpen(true);
        }}
        onAdd={() => {
          setEditingTech(null);
          setTechModalOpen(true);
        }}
      />
    </div>
  );
}