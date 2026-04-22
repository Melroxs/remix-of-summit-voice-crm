import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function CampaignModal({ onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [wrapUp, setWrapUp] = useState("15");
  const [maxAttempts, setMaxAttempts] = useState("5");

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("campaigns").insert({
      name: name.trim(),
      wrap_up_seconds: parseInt(wrapUp) || 15,
      max_attempts: parseInt(maxAttempts) || 5,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Campaign created" });
      onSaved();
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Solar Q1 2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Wrap-up Time (seconds)</Label>
              <Input type="number" value={wrapUp} onChange={(e) => setWrapUp(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max Attempts</Label>
              <Input type="number" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Creating..." : "Create Campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
