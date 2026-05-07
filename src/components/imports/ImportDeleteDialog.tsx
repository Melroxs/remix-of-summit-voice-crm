import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  job: {
    id: string;
    filename: string;
    total_rows: number | null;
    successful_rows: number | null;
    created_at: string;
    campaign_id?: string | null;
  };
  onCancel: () => void;
  onDeleted: () => void;
}

export default function ImportDeleteDialog({ job, onCancel, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<"record_only" | "record_and_contacts">("record_only");
  const [affectedCount, setAffectedCount] = useState<number | null>(null);

  // Look up real number of contacts that would be deleted.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("lead_import_id", job.id)
      .then(({ count }) => { if (!cancelled) setAffectedCount(count ?? 0); });
    return () => { cancelled = true; };
  }, [job.id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-import", {
        body: { lead_import_id: job.id, mode },
      });
      if (error || !data?.success) {
        toast({
          title: "Delete failed",
          description: data?.error || error?.message || "Could not delete import.",
          variant: "destructive",
        });
        setDeleting(false);
        return;
      }
      toast({
        title: mode === "record_only" ? "Upload record deleted" : "Upload and contacts deleted",
        description:
          mode === "record_only"
            ? `Removed upload "${data.filename}". Contacts kept.`
            : `Removed ${data.deleted_contacts} contacts from "${data.filename}".`,
      });
      onDeleted();
    } catch {
      toast({ title: "Error", description: "Unexpected error deleting upload.", variant: "destructive" });
      setDeleting(false);
    }
  };

  const canConfirm = confirmText === "DELETE";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Delete Upload Batch
          </DialogTitle>
          <DialogDescription>
            Choose what should be deleted. Call history is always preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-md space-y-1">
            <p className="text-sm font-medium text-foreground">{job.filename}</p>
            <p className="text-xs text-muted-foreground">
              Uploaded {new Date(job.created_at).toLocaleDateString()} • {job.successful_rows ?? 0} rows imported
            </p>
            <p className="text-xs text-muted-foreground">
              Currently linked contacts: <span className="font-mono text-foreground">{affectedCount ?? "…"}</span>
            </p>
          </div>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="space-y-2">
            <div className="flex items-start gap-2 p-2 border border-border rounded-md">
              <RadioGroupItem value="record_only" id="mode-a" className="mt-1" />
              <div>
                <Label htmlFor="mode-a" className="font-medium">A. Delete upload record only</Label>
                <p className="text-xs text-muted-foreground">Removes the upload entry. All contacts stay in the CRM.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 border border-border rounded-md">
              <RadioGroupItem value="record_and_contacts" id="mode-b" className="mt-1" />
              <div>
                <Label htmlFor="mode-b" className="font-medium">B. Delete upload record AND all contacts from this batch</Label>
                <p className="text-xs text-muted-foreground">
                  Removes {affectedCount ?? "…"} contacts, their queue assignments, callbacks and appointments. Call history is unlinked but kept.
                </p>
              </div>
            </div>
          </RadioGroup>

          <div>
            <label className="text-sm text-muted-foreground">
              Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="mt-1"
              disabled={deleting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!canConfirm || deleting}>
            {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
