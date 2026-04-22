import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    campaign_id: string | null;
  };
  onCancel: () => void;
  onDeleted: () => void;
}

export default function ImportDeleteDialog({ job, onCancel, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-import", {
        body: { import_job_id: job.id },
      });

      if (error || !data?.success) {
        toast({
          title: "Delete failed",
          description: data?.error || error?.message || "Could not delete import list.",
          variant: "destructive",
        });
        setDeleting(false);
        return;
      }

      toast({
        title: "Import List Deleted",
        description: `Removed ${data.deleted_contacts} contacts from "${data.filename}".`,
      });
      onDeleted();
    } catch {
      toast({ title: "Error", description: "Unexpected error deleting import.", variant: "destructive" });
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
            Delete Imported Lead List
          </DialogTitle>
          <DialogDescription>
            This will permanently delete all contacts created from this import and remove them from campaigns, dialer queues, callbacks, and appointments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-md space-y-1">
            <p className="text-sm font-medium text-foreground">{job.filename}</p>
            <p className="text-xs text-muted-foreground">
              Uploaded {new Date(job.created_at).toLocaleDateString()} • {job.successful_rows ?? 0} contacts imported
            </p>
            <p className="text-xs text-destructive mt-1 font-medium">
              This action is permanent and cannot be undone.
            </p>
          </div>

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
            {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</> : "Delete Lead List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
