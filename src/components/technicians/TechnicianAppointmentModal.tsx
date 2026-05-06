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

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [leadAddress, setLeadAddress] = useState("");
  const [requiredSkill, setRequiredSkill] = useState("");
  const [status, setStatus] = useState<TechApptStatus>("scheduled");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setTechnicianId(appointment.technician_id);
      setStart(toLocalInputValue(appointment.start_time));
      setEnd(toLocalInputValue(appointment.end_time));
      setLeadAddress(appointment.lead_address ?? "");
      setRequiredSkill(appointment.required_skill ?? "");
      setStatus(appointment.status);
      setNotes(appointment.notes ?? "");
    } else {
      const base = defaultDate ?? new Date();
      const startD = new Date(base);
      if (!defaultDate) startD.setHours(9, 0, 0, 0);
      const endD = new Date(startD);
      endD.setHours(startD.getHours() + 1);
      setTechnicianId(defaultTechnicianId ?? "");
      setStart(toLocalInputValue(startD.toISOString()));
      setEnd(toLocalInputValue(endD.toISOString()));
      setLeadAddress("");
      setRequiredSkill("");
      setStatus("scheduled");
      setNotes("");
    }
  }, [open, appointment, defaultDate, defaultTechnicianId]);

  const selectedTech = useMemo(
    () => technicians.find((t) => t.id === technicianId),
    [technicians, technicianId],
  );

  const validation = useMemo(() => {
    if (!selectedTech || !start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
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
  }, [selectedTech, start, end, requiredSkill]);

  const submit = async () => {
    if (!technicianId) {
      toast.error("Select a technician");
      return;
    }
    if (validation) {
      toast.error(validation);
      return;
    }
    await save.mutateAsync({
      id: appointment?.id,
      technician_id: technicianId,
      contact_id: appointment?.contact_id ?? null,
      campaign_id: appointment?.campaign_id ?? null,
      appointment_id: appointment?.appointment_id ?? null,
      lead_address: leadAddress.trim() || null,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
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
      <DialogContent className="max-w-lg">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
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