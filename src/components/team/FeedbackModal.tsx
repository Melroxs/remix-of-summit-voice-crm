import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  agentId: string;
  agentName: string;
  callLogId?: string;
  campaignId?: string;
  onClose: () => void;
}

export default function FeedbackModal({ agentId, agentName, callLogId, campaignId, onClose }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState("coaching");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!message.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase.from("notes").insert({
      agent_id: agentId,
      feedback_by: user.id,
      call_attempt_id: callLogId || null,
      campaign_id: campaignId || null,
      feedback_type: type,
      message: message.trim(),
    } as any);

    if (error) {
      toast.error("Failed to save feedback");
    } else {
      toast.success("Feedback sent");
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback for {agentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coaching">Coaching</SelectItem>
                <SelectItem value="praise">Praise</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your feedback..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !message.trim()}>
            {saving ? "Sending..." : "Send Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
