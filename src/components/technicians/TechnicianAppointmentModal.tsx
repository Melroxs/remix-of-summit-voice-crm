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
import { getTravelTime } from "@/lib/routing";
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
  defaultContactId?: string | null;
  defaultContactLabel?: string;
  defaultLeadAddress?: string;
  defaultCampaignId?: string | null;
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
  defaultContactId,
  defaultContactLabel,
  defaultLeadAddress,
  defaultCampaignId,
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

  // Availability + routing: sort day's appointments and check the new job fits in a valid gap
  interface AvailabilityInfo {
    prev: { id: string; address: string | null; end: Date; travelMin: number | null } | null;
    next: { id: string; address: string | null; start: Date; travelMin: number | null } | null;
    overlap: {
      id: string;
      address: string | null;
      start: Date;
      end: Date;
      travelMin: number | null;
    } | null;
    originLabel: "previous appointment" | "home address" | null;
    originAddress: string | null;
    travelInMin: number | null; // drive into the new job
    travelOutMin: number | null; // drive from new job to next
    departBy: Date | null;
    arriveNextBy: Date | null;
    conflict: string | null; // overlap / not enough travel time
  }
  const [avail, setAvail] = useState<AvailabilityInfo | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

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
      setLeadAddress(defaultLeadAddress ?? "");
      setRequiredSkill("");
      setStatus("scheduled");
      setNotes("");
      setContactId(defaultContactId ?? null);
      setContactLabel(defaultContactLabel ?? "");
    }
  }, [open, appointment, defaultDate, defaultTechnicianId, defaultContactId, defaultContactLabel, defaultLeadAddress]);

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

  // Sort the day's existing appointments for this technician, find the prev/next around the
  // proposed slot, compute drive times, and verify the gap is large enough on both sides.
  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      setAvail(null);
      setAvailError(null);
      if (!selectedTech || !startDt || !endDt || !leadAddress.trim()) return;

      const dayStart = new Date(startDt);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(startDt);
      dayEnd.setHours(23, 59, 59, 999);

      let q = supabase
        .from("technician_appointments")
        .select("id, lead_address, start_time, end_time, status")
        .eq("technician_id", selectedTech.id)
        .gte("start_time", dayStart.toISOString())
        .lte("start_time", dayEnd.toISOString())
        .not("status", "in", "(cancelled,no_show)")
        .order("start_time", { ascending: true });
      if (appointment?.id) q = q.neq("id", appointment.id);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setAvailError(error.message);
        return;
      }

      const sorted = (data ?? [])
        .map((a) => ({
          id: a.id as string,
          address: (a.lead_address as string | null) ?? null,
          start: new Date(a.start_time as string),
          end: new Date(a.end_time as string),
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Direct overlap with any existing appointment
      const overlap = sorted.find(
        (a) => a.start < endDt && a.end > startDt,
      );
      if (overlap) {
        const originAddress =
          selectedTech.home_address?.trim() || null;
        const overlapDriveMin = overlap.address
          ? await getTravelTime(
              originAddress || leadAddress.trim(),
              overlap.address.trim(),
            )
          : null;
        if (cancelled) return;
        setAvail({
          prev: null,
          next: null,
          overlap: {
            id: overlap.id,
            address: overlap.address,
            start: overlap.start,
            end: overlap.end,
            travelMin: overlapDriveMin,
          },
          originLabel: null,
          originAddress: null,
          travelInMin: null,
          travelOutMin: null,
          departBy: null,
          arriveNextBy: null,
          conflict: `Overlaps existing appointment at ${format(overlap.start, "HH:mm")}–${format(overlap.end, "HH:mm")}`,
        });
        return;
      }

      const prev = [...sorted].reverse().find((a) => a.end <= startDt) ?? null;
      const next = sorted.find((a) => a.start >= endDt) ?? null;

      const originAddress =
        prev?.address?.trim() || selectedTech.home_address?.trim() || null;
      const originLabel: AvailabilityInfo["originLabel"] = prev?.address
        ? "previous appointment"
        : selectedTech.home_address
          ? "home address"
          : null;

      setAvailLoading(true);
      const [travelInMin, travelOutMin] = await Promise.all([
        originAddress ? getTravelTime(originAddress, leadAddress.trim()) : Promise.resolve(null),
        next?.address
          ? getTravelTime(leadAddress.trim(), next.address.trim())
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setAvailLoading(false);

      // Gap validation
      let conflict: string | null = null;
      if (prev && travelInMin != null) {
        const gapMin = (startDt.getTime() - prev.end.getTime()) / 60000;
        if (travelInMin > gapMin) {
          conflict = `Not enough travel time from previous job (${travelInMin} min drive, only ${Math.floor(gapMin)} min gap)`;
        }
      }
      if (!conflict && next && travelOutMin != null) {
        const gapMin = (next.start.getTime() - endDt.getTime()) / 60000;
        if (travelOutMin > gapMin) {
          conflict = `Not enough travel time to next job (${travelOutMin} min drive, only ${Math.floor(gapMin)} min gap)`;
        }
      }

      const departBy =
        travelInMin != null ? new Date(startDt.getTime() - travelInMin * 60000) : null;
      const arriveNextBy =
        next && travelOutMin != null
          ? new Date(endDt.getTime() + travelOutMin * 60000)
          : null;

      setAvail({
        prev: prev
          ? { id: prev.id, address: prev.address, end: prev.end, travelMin: travelInMin }
          : null,
        next: next
          ? { id: next.id, address: next.address, start: next.start, travelMin: travelOutMin }
          : null,
        overlap: null,
        originLabel,
        originAddress,
        travelInMin,
        travelOutMin,
        departBy,
        arriveNextBy,
        conflict,
      });
    };
    compute();
    return () => { cancelled = true; };
  }, [selectedTech, startDt?.getTime(), endDt?.getTime(), leadAddress, appointment?.id]);

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

  const blockingError = validation || avail?.conflict || null;

  const submit = async () => {
    if (!technicianId) {
      toast.error("Select a technician");
      return;
    }
    if (!startDt || !endDt) {
      toast.error("Pick start and end date/time");
      return;
    }
    if (blockingError) {
      toast.error(blockingError);
      return;
    }
    await save.mutateAsync({
      id: appointment?.id,
      technician_id: technicianId,
      contact_id: contactId,
      campaign_id: appointment?.campaign_id ?? defaultCampaignId ?? null,
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
          {avail?.conflict && (
            <p className="text-sm text-destructive">{avail.conflict}</p>
          )}

          {/* Availability + travel */}
          {selectedTech && leadAddress.trim() && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="font-medium text-foreground">Schedule check</div>
              {availLoading ? (
                <div className="text-muted-foreground">Calculating route &amp; availability…</div>
              ) : availError ? (
                <div className="text-muted-foreground">{availError}</div>
              ) : avail ? (
                <>
                  {/* Overlap details */}
                  {avail.overlap && (
                    <div className="rounded border border-destructive/50 bg-destructive/10 p-2 space-y-0.5">
                      <div className="font-medium text-destructive">
                        Conflict: {format(avail.overlap.start, "HH:mm")}–{format(avail.overlap.end, "HH:mm")}
                      </div>
                      {avail.overlap.address && (
                        <div className="text-muted-foreground truncate" title={avail.overlap.address}>
                          At: {avail.overlap.address}
                        </div>
                      )}
                      {avail.overlap.travelMin != null && (
                        <div className="text-muted-foreground">
                          ~{avail.overlap.travelMin} min drive to that job
                        </div>
                      )}
                    </div>
                  )}
                  {/* Inbound leg */}
                  {!avail.overlap && (
                  <div className="text-foreground">
                    {avail.travelInMin != null ? (
                      <>
                        ~{avail.travelInMin} min drive from {avail.originLabel}
                        {avail.prev && (
                          <> (prev ends {format(avail.prev.end, "HH:mm")})</>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        No drive estimate inbound (
                        {avail.originAddress ? "routing failed" : "no origin set"})
                      </span>
                    )}
                  </div>
                  )}
                  {!avail.overlap && avail.originAddress && (
                    <div className="text-muted-foreground truncate" title={avail.originAddress}>
                      From: {avail.originAddress}
                    </div>
                  )}
                  {!avail.overlap && avail.departBy && (
                    <div className="text-muted-foreground">
                      Suggested depart by: {format(avail.departBy, "MMM d, HH:mm")}
                    </div>
                  )}

                  {/* Outbound leg */}
                  {!avail.overlap && avail.next && (
                    <div className="pt-1 border-t border-border/50">
                      <div className="text-foreground">
                        Next job at {format(avail.next.start, "HH:mm")}
                        {avail.travelOutMin != null && (
                          <> · ~{avail.travelOutMin} min drive after this</>
                        )}
                      </div>
                      {avail.arriveNextBy && (
                        <div className="text-muted-foreground">
                          Would arrive next by: {format(avail.arriveNextBy, "HH:mm")}
                        </div>
                      )}
                    </div>
                  )}
                  {!avail.overlap && !avail.next && !avail.prev && (
                    <div className="text-muted-foreground">
                      No other appointments scheduled this day.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">
                  Pick a technician, date/time, and lead address.
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {appointment && (
            <Button variant="destructive" onClick={remove} disabled={del.isPending}>Delete</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || !!blockingError}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}