import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useSaveTechAppointment,
  useDeleteTechAppointment,
  type TechAppointment,
  type TechApptStatus,
} from "@/hooks/use-technician-appointments";
import { useTechnicians } from "@/hooks/use-technicians";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointment?: TechAppointment | null;
  defaultDate?: Date;
  defaultTechnicianId?: string;
}

const STATUSES: TechApptStatus[] = [
  "scheduled",
  "en_route",
  "on_site",
  "completed",
  "cancelled",
  "no_show",
];

// 30-min time slots from 06:00 to 21:30
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 21; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function combineDateTime(d: Date | undefined, t: string): Date | null {
  if (!d || !t) return null;
  const [h, m] = t.split(":").map(Number);
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

interface ContactLite {
  id: string;
  first_name: string;
  last_name: string;
  phone_e164: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export default function TechnicianAppointmentModal({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  defaultTechnicianId,
}: Props) {
  const { data: technicians = [] } = useTechnicians();
  const save = useSaveTechAppointment();
  const del = useDeleteTechAppointment();

  const [technicianId, setTechnicianId] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState<string>("10:00");
  const [leadAddress, setLeadAddress] = useState("");
  const [requiredSkill, setRequiredSkill] = useState("");
  const [status, setStatus] = useState<TechApptStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState<string>("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<ContactLite[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setTechnicianId(appointment.technician_id);
      const s = new Date(appointment.start_time);
      const e = new Date(appointment.end_time);
      setStartDate(s);
      setStartTime(`${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`);
      setEndDate(e);
      setEndTime(`${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`);
      setLeadAddress(appointment.lead_address ?? "");
      setRequiredSkill(appointment.required_skill ?? "");
      setStatus(appointment.status);
      setNotes(appointment.notes ?? "");
      setContactId(appointment.contact_id ?? null);
      setContactLabel("");
    } else {
      const base = defaultDate ?? new Date();
      setTechnicianId(defaultTechnicianId ?? "");
      setStartDate(base);
      setStartTime("09:00");
      setEndDate(base);
      setEndTime("10:00");
      setLeadAddress("");
      setRequiredSkill("");
      setStatus("scheduled");
      setNotes("");
      setContactId(null);
      setContactLabel("");
    }
  }, [open, appointment, defaultDate, defaultTechnicianId]);

  // Hydrate previously-linked contact details when editing
  useEffect(() => {
    if (!open || !contactId || contactLabel) return;
    supabase
      .from("contacts")
      .select("id, first_name, last_name, phone_e164, address, city, state, zip_code")
      .eq("id", contactId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setContactLabel(`${data.first_name} ${data.last_name}`.trim());
      });
  }, [open, contactId, contactLabel]);

  // Search contacts when picker is open
  useEffect(() => {
    if (!leadPickerOpen) return;
    let cancelled = false;
    setSearchingLeads(true);
    const term = leadSearch.trim();
    const run = async () => {
      let q = supabase
        .from("contacts")
        .select("id, first_name, last_name, phone_e164, address, city, state, zip_code")
        .order("updated_at", { ascending: false })
        .limit(25);
      if (term) {
        const s = term.replace(/[,()]/g, " ");
        q = q.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_e164.ilike.%${s}%,address.ilike.%${s}%,city.ilike.%${s}%`,
        );
      }
      const { data } = await q;
      if (!cancelled) {
        setLeadResults((data ?? []) as ContactLite[]);
        setSearchingLeads(false);
      }
    };
    const t = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [leadSearch, leadPickerOpen]);

  const pickLead = (c: ContactLite) => {
    setContactId(c.id);
    setContactLabel(`${c.first_name} ${c.last_name}`.trim());
    const addr = [c.address, c.city, c.state, c.zip_code].filter(Boolean).join(", ");
    if (addr) setLeadAddress(addr);
    setLeadPickerOpen(false);
  };

  const clearLead = () => {
    setContactId(null);
    setContactLabel("");
  };

  const selectedTech = useMemo(
    () => technicians.find((t) => t.id === technicianId),
    [technicians, technicianId],
  );

  const startDt = useMemo(() => combineDateTime(startDate, startTime), [startDate, startTime]);
  const endDt = useMemo(() => combineDateTime(endDate, endTime), [endDate, endTime]);

  const validation = useMemo(() => {
    if (!selectedTech || !startDt || !endDt) return null;
    const s = startDt;
    const e = endDt;
    if (e <= s) return "End time must be after start time";
    if (requiredSkill && !selectedTech.skills.includes(requiredSkill)) {
      return `Technician does not have skill "${requiredSkill}"`;
    }
    if (!selectedTech.working_days.includes(s.getDay())) {
      return "Technician does not work on this day";
    }
    const startMins = s.getHours() * 60 + s.getMinutes();
    const endMins = e.getHours() * 60 + e.getMinutes();
    const [whSH, whSM] = selectedTech.working_hours_start.split(":").map(Number);
    const [whEH, whEM] = selectedTech.working_hours_end.split(":").map(Number);
    const whStart = whSH * 60 + whSM;
    const whEnd = whEH * 60 + whEM;
    if (startMins < whStart || endMins > whEnd) {
      return `Outside working hours (${selectedTech.working_hours_start.slice(0, 5)}–${selectedTech.working_hours_end.slice(0, 5)})`;
    }
    return null;
  }, [selectedTech, startDt, endDt, requiredSkill]);

  const submit = async () => {
    if (!technicianId) {
      toast.error("Select a technician");
      return;
    }
    if (!startDt || !endDt) {
      toast.error("Pick start and end date/time");
      return;
    }
    if (validation) {
      toast.error(validation);
      return;
    }
    await save.mutateAsync({
      id: appointment?.id,
      technician_id: technicianId,
      contact_id: contactId,
      campaign_id: appointment?.campaign_id ?? null,
      appointment_id: appointment?.appointment_id ?? null,
      lead_address: leadAddress.trim() || null,
      start_time: startDt.toISOString(),
      end_time: endDt.toISOString(),
      required_skill: requiredSkill.trim() || null,
      status,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  const remove = async () => {
    if (!appointment) return;
    await del.mutateAsync(appointment.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Edit appointment" : "New appointment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Technician</Label>
            <Select value={technicianId} onValueChange={setTechnicianId}>
              <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
              <SelectContent>
                {technicians.filter((t) => t.is_active).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.skills.length ? ` — ${t.skills.join(", ")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead picker */}
          <div>
            <Label>Lead</Label>
            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className={cn(!contactLabel && "text-muted-foreground")}>
                    {contactLabel || "Search and select a lead..."}
                  </span>
                  <Search className="w-4 h-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[480px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name, phone, address..."
                    value={leadSearch}
                    onValueChange={setLeadSearch}
                  />
                  <CommandList>
                    {searchingLeads ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">Searching...</div>
                    ) : (
                      <>
                        <CommandEmpty>No leads found.</CommandEmpty>
                        <CommandGroup>
                          {leadResults.map((c) => {
                            const addr = [c.address, c.city, c.state].filter(Boolean).join(", ");
                            return (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => pickLead(c)}
                                className="flex flex-col items-start gap-0.5"
                              >
                                <span className="text-sm font-medium">
                                  {c.first_name} {c.last_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {c.phone_e164 ?? "—"}{addr ? ` · ${addr}` : ""}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {contactId && (
              <button
                type="button"
                onClick={clearLead}
                className="text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                Clear lead
              </button>
            )}
          </div>

          {/* Start / End with popover calendar + time slot */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start font-normal",
                        !startDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => {
                        setStartDate(d ?? undefined);
                        if (d && (!endDate || endDate < d)) setEndDate(d);
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start font-normal",
                        !endDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => setEndDate(d ?? undefined)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <Label>Lead address</Label>
            <Textarea value={leadAddress} onChange={(e) => setLeadAddress(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Required skill</Label>
              <Input
                value={requiredSkill}
                onChange={(e) => setRequiredSkill(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TechApptStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {validation && (
            <p className="text-sm text-destructive">{validation}</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {appointment && (
            <Button variant="destructive" onClick={remove} disabled={del.isPending}>Delete</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || !!validation}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}