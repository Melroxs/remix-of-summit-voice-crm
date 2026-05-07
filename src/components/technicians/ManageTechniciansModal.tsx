import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Search, UserPlus } from "lucide-react";
import {
  useTechnicians,
  useDeleteTechnician,
  type Technician,
} from "@/hooks/use-technicians";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (t: Technician) => void;
  onAdd: () => void;
}

export default function ManageTechniciansModal({ open, onOpenChange, onEdit, onAdd }: Props) {
  const { data: technicians = [], isLoading } = useTechnicians();
  const del = useDeleteTechnician();
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Technician | null>(null);

  const filtered = technicians.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.email ?? "").toLowerCase().includes(q) ||
      (t.phone ?? "").toLowerCase().includes(q) ||
      t.skills.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Technicians</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, phone, skill..."
                className="pl-8"
              />
            </div>
            <Button
              onClick={() => {
                onOpenChange(false);
                onAdd();
              }}
            >
              <UserPlus className="w-4 h-4 mr-1.5" /> Add
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No technicians found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Contact</th>
                    <th className="text-left px-3 py-2">Hours</th>
                    <th className="text-left px-3 py-2">Skills</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{t.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div>{t.email || "—"}</div>
                        <div className="text-xs">{t.phone || ""}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {t.working_hours_start.slice(0, 5)}–{t.working_hours_end.slice(0, 5)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {t.skills.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                          {t.skills.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{t.skills.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {t.is_active ? (
                          <Badge className="bg-green-500/20 text-green-300 border-green-500/40">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              onOpenChange(false);
                              onEdit(t);
                            }}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setConfirmDelete(t)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove technician?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{confirmDelete?.name}</strong> and any of their
              appointments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}