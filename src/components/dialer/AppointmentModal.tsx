import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, MapPin, Video, User } from "lucide-react";

interface Props {
  contactId: string;
  contactName: string;
  campaignId: string | null;
  callAttemptId?: string | null;
  contactAddress?: string | null;
  contactCity?: string | null;
  contactState?: string | null;
  contactZip?: string | null;
  initialAppointment?: any;
  onClose: () => void;
  onSaved: () => void;
}

const JOB_TYPES = [
  { value: "full_replacement", label: "Full roof replacement" },
  { value: "partial_replacement", label: "Partial replacement" },
  { value: "leak_repair", label: "Leak repair" },
  { value: "storm_damage", label: "Storm damage repair" },
  { value: "inspection_only", label: "Inspection / estimate only" },
  { value: "gutter_work", label: "Gutter / fascia work" },
  { value: "other", label: "Other" },
];

const URGENCIES = [
  { value: "low", label: "Low — flexible" },
  { value: "medium", label: "Medium — within a month" },
  { value: "high", label: "High — within 2 weeks" },
  { value: "urgent", label: "Urgent — active leak" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function AppointmentModal({
  contactId, contactName, campaignId, callAttemptId,
  contactAddress, contactCity, contactState, contactZip,
  initialAppointment, onClose, onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [appointmentType, setAppointmentType] = useState<"on_site_inspection" | "virtual_consultation">(
    initialAppointment?.appointment_type ?? "on_site_inspection"
  );
  const [date, setDate] = useState(
    initialAppointment ? new Date(initialAppointment.appointment_at).toISOString().split("T")[0] : ""
  );
  const [time, setTime] = useState(
    initialAppointment
      ? new Date(initialAppointment.appointment_at).toTimeString().slice(0, 5)
      : ""
  );
  const [tz, setTz] = useState<string>(
    initialAppointment?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "America/New_York"
  );
  const [address, setAddress] = useState(initialAppointment?.address ?? contactAddress ?? "");
  const [city, setCity] = useState(initialAppointment?.city ?? contactCity ?? "");
  const [state, setState] = useState(initialAppointment?.state ?? contactState ?? "");
  const [zipCode, setZipCode] = useState(initialAppointment?.zip_code ?? contactZip ?? "");
  const [jobType, setJobType] = useState<string>(initialAppointment?.job_type ?? "inspection_only");
  const [urgency, setUrgency] = useState<string>(initialAppointment?.urgency ?? "medium");
  const [closerId, setCloserId] = useState<string>(initialAppointment?.closer_user_id ?? "__none__");
  const [handoffNotes, setHandoffNotes] = useState(initialAppointment?.handoff_notes ?? "");
  const [notes, setNotes] = useState(initialAppointment?.notes ?? "");
  const [closers, setClosers] = useState<{ user_id: string; display_name: string | null }[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => setClosers((data || []) as any));
  }, []);

  const handleSave = async () => {
    if (!date || !time) {
      toast({ title: "Date & time required", variant: "destructive" });
      return;
    }
    setLoading(true);

    const appointmentAt = new Date(`${date}T${time}`).toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    const payload: any = {
      contact_id: contactId,
      campaign_id: campaignId,
      agent_id: user?.id || null,
      appointment_at: appointmentAt,
      appointment_type: appointmentType,
      timezone: tz,
      address: address || null,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      job_type: jobType,
      urgency,
      closer_user_id: closerId !== "__none__" ? closerId : null,
      handoff_notes: handoffNotes || null,
      notes: notes || null,
      booked_from_call_id: callAttemptId || null,
    };

    let error;
    if (initialAppointment?.id) {
      const res = await supabase
        .from("appointments")
        .update({ ...payload, status: "rescheduled" as any })
        .eq("id", initialAppointment.id);
      error = res.error;
    } else {
      const res = await supabase.from("appointments").insert(payload);
      error = res.error;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: initialAppointment ? "Appointment updated" : "Appointment booked",
        description: `${contactName} — ${date} at ${time}`,
      });
      onSaved();
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-green-400" />
            {initialAppointment ? "Reschedule Appointment" : "Book Appointment"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          For <span className="font-medium text-foreground">{contactName}</span>
        </p>

        <div className="space-y-4 mt-2">
          {/* Type */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAppointmentType("on_site_inspection")}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                appointmentType === "on_site_inspection"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <MapPin className="w-4 h-4" /> On-site inspection
              </div>
              <p className="text-xs text-muted-foreground mt-1">Closer visits the property</p>
            </button>
            <button
              type="button"
              onClick={() => setAppointmentType("virtual_consultation")}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                appointmentType === "virtual_consultation"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <Video className="w-4 h-4" /> Virtual consultation
              </div>
              <p className="text-xs text-muted-foreground mt-1">Video / phone meeting</p>
            </button>
          </div>

          {/* Date / time / tz */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={tz} onValueChange={setTz}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z.replace("America/", "").replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Address (only if on-site) */}
          {appointmentType === "on_site_inspection" && (
            <>
              <div className="space-y-2">
                <Label>Property Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Zip</Label>
                  <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Job + urgency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Job type</Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCIES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Closer assignment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><User className="w-3 h-3" /> Assign closer</Label>
            <Select value={closerId} onValueChange={setCloserId}>
              <SelectTrigger><SelectValue placeholder="No closer assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No closer assigned</SelectItem>
                {closers.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.display_name || c.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Closer handoff notes</Label>
            <Textarea
              value={handoffNotes}
              onChange={(e) => setHandoffNotes(e.target.value)}
              placeholder="Key points the closer needs to know..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Appointment notes</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes, special instructions..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : initialAppointment ? "Update" : "Book Appointment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
