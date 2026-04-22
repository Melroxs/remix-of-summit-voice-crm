import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck } from "lucide-react";

interface Props {
  contactId: string;
  contactName: string;
  campaignId: string | null;
  contactAddress?: string | null;
  contactCity?: string | null;
  contactState?: string | null;
  contactZip?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AppointmentModal({
  contactId,
  contactName,
  campaignId,
  contactAddress,
  contactCity,
  contactState,
  contactZip,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState(contactAddress || "");
  const [city, setCity] = useState(contactCity || "");
  const [state, setState] = useState(contactState || "");
  const [zipCode, setZipCode] = useState(contactZip || "");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!date || !time) {
      toast({ title: "Date & time required", variant: "destructive" });
      return;
    }
    setLoading(true);

    const appointmentAt = new Date(`${date}T${time}`).toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("appointments").insert({
      contact_id: contactId,
      campaign_id: campaignId,
      agent_id: user?.id || null,
      appointment_at: appointmentAt,
      address: address || null,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      notes: notes || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Appointment booked", description: `${contactName} — ${date} at ${time}` });
      onSaved();
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-green-400" />
            Book Appointment
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Book an appointment for <span className="font-medium text-foreground">{contactName}</span>
        </p>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
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

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Appointment details, special instructions..."
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Book Appointment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
