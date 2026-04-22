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
import { CalendarClock } from "lucide-react";

interface Props {
  contactId: string;
  contactName: string;
  campaignId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CallbackModal({ contactId, contactName, campaignId, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  // Default to tomorrow at 10:00 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split("T")[0];

  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("0");

  const handleSave = async () => {
    if (!date || !time) {
      toast({ title: "Date & time required", variant: "destructive" });
      return;
    }
    setLoading(true);

    const callbackAt = new Date(`${date}T${time}`).toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("callbacks").insert({
      contact_id: contactId,
      campaign_id: campaignId,
      agent_id: user?.id || null,
      callback_at: callbackAt,
      notes: notes || null,
      priority: parseInt(priority) || 0,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Also update campaign_contact with callback_at
      if (campaignId) {
        await supabase
          .from("campaign_contacts")
          .update({ callback_at: callbackAt, dial_status: "pending" as any })
          .eq("contact_id", contactId)
          .eq("campaign_id", campaignId);
      }
      toast({ title: "Callback scheduled", description: `${contactName} — ${date} at ${time}` });
      onSaved();
    }
    setLoading(false);
  };


  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Schedule Callback
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Schedule a callback for <span className="font-medium text-foreground">{contactName}</span>
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
            <Label>Priority (0 = normal)</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              min="0"
              max="10"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for callback, best time to reach, etc."
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Schedule Callback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
