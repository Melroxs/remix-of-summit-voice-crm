import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "opening_score", label: "Opening / Introduction" },
  { key: "script_adherence_score", label: "Script Adherence" },
  { key: "qualification_score", label: "Qualification Accuracy" },
  { key: "objection_handling_score", label: "Objection Handling" },
  { key: "communication_score", label: "Communication Clarity" },
  { key: "compliance_score", label: "Compliance" },
  { key: "closing_score", label: "Closing / Booking" },
] as const;

interface Props {
  callLogId: string;
  agentId: string;
  campaignId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function QaScoringForm({ callLogId, agentId, campaignId, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map(c => [c.key, 3]))
  );
  const [notes, setNotes] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvement, setImprovement] = useState("");
  const [saving, setSaving] = useState(false);

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / CATEGORIES.length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("qa_scores").insert({
      call_log_id: callLogId,
      agent_id: agentId,
      scored_by: user.id,
      campaign_id: campaignId || null,
      ...scores,
      notes: notes || null,
      strengths: strengths || null,
      improvement_feedback: improvement || null,
    } as any);

    if (error) {
      toast.error("Failed to save QA score");
      console.error(error);
    } else {
      toast.success("QA score saved");
      onSaved?.();
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QA Call Scoring</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{cat.label}</Label>
                <span className="text-sm font-bold text-primary">{scores[cat.key]}/5</span>
              </div>
              <Slider
                value={[scores[cat.key]]}
                onValueChange={([v]) => setScores(prev => ({ ...prev, [cat.key]: v }))}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
            </div>
          ))}

          <div className="pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">
              Total Score: <span className="text-primary text-lg">{totalScore.toFixed(1)}</span> / 5.0
            </p>
          </div>

          <div>
            <Label>Strengths</Label>
            <Textarea value={strengths} onChange={e => setStrengths(e.target.value)} placeholder="What did the agent do well?" rows={2} />
          </div>
          <div>
            <Label>Areas for Improvement</Label>
            <Textarea value={improvement} onChange={e => setImprovement(e.target.value)} placeholder="What could be improved?" rows={2} />
          </div>
          <div>
            <Label>Additional Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any other observations..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Score"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
