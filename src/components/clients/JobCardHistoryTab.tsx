import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Briefcase } from "lucide-react";

const STATUS_VARIANT: Record<string, any> = {
  open: "default",
  in_progress: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

export default function JobCardHistoryTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: cards } = useQuery({
    queryKey: ["job_cards", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_cards")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const card = cards?.find((c) => c.id === openId) || null;

  return (
    <div className="space-y-2">
      {(cards?.length ?? 0) === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No job cards yet.
        </Card>
      )}
      {cards?.map((c) => (
        <Card
          key={c.id}
          className="p-4 cursor-pointer hover:border-primary transition-colors"
          onClick={() => setOpenId(c.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{c.job_number}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.job_type || "—"} • Scheduled {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[c.status] || "default"}>{c.status.replace("_", " ")}</Badge>
          </div>
        </Card>
      ))}

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {card && (
            <JobCardEditor
              card={card}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["job_cards", clientId] });
                toast({ title: "Job card updated" });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function JobCardEditor({ card, onSaved }: { card: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    status: card.status,
    job_type: card.job_type || "",
    sale_amount: card.sale_amount ?? "",
    notes: card.notes || "",
    scheduled_at: card.scheduled_at ? new Date(card.scheduled_at).toISOString().slice(0, 16) : "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        status: form.status,
        job_type: form.job_type || null,
        sale_amount: form.sale_amount === "" ? null : Number(form.sale_amount),
        notes: form.notes || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        completed_at: form.status === "completed" ? new Date().toISOString() : card.completed_at,
      };
      const { error } = await supabase.from("job_cards").update(payload).eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: onSaved,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle>{card.job_number}</SheetTitle>
      </SheetHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Job type</Label>
          <Input value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Scheduled at</Label>
          <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Sale amount</Label>
          <Input type="number" step="0.01" value={form.sale_amount as any} onChange={(e) => setForm({ ...form, sale_amount: e.target.value as any })} />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}