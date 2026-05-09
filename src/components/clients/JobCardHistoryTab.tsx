import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Briefcase, CheckCircle2, XCircle, AlertCircle, Camera, FileText } from "lucide-react";

const STATUS_VARIANT: Record<string, any> = {
  open: "default",
  in_progress: "secondary",
  quote: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

const DISPOSITION_LABEL: Record<string, string> = {
  no_sale: "No Sale",
  roof_replacement: "Roof Replacement",
  solar_installation: "Solar Installation",
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
      {cards?.map((c: any) => (
        <Card
          key={c.id}
          className="p-4 cursor-pointer hover:border-primary transition-colors"
          onClick={() => setOpenId(c.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{c.job_number}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.sale_disposition ? DISPOSITION_LABEL[c.sale_disposition] : (c.job_type || "—")} • Scheduled {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
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
  const { user } = useAuth();
  const qc = useQueryClient();

  // Counts of photos & notes attached to this job card — required to advance
  const { data: counts } = useQuery({
    queryKey: ["job_card_progress", card.id],
    queryFn: async () => {
      const [photos, notes] = await Promise.all([
        supabase.from("client_photos").select("id", { count: "exact", head: true }).eq("job_card_id", card.id),
        supabase.from("client_notes").select("id", { count: "exact", head: true }).eq("job_card_id", card.id),
      ]);
      return { photos: photos.count ?? 0, notes: notes.count ?? 0 };
    },
  });

  const hasPhotos = (counts?.photos ?? 0) >= 1;
  const hasNotes = (counts?.notes ?? 0) >= 1;
  const canAdvance = hasPhotos && hasNotes;

  const [disposition, setDisposition] = useState<string>(card.sale_disposition || "");
  const quoteInit = card.quote_details || {};
  const [quote, setQuote] = useState({
    scope: quoteInit.scope || "",
    materials: quoteInit.materials || "",
    timeline: quoteInit.timeline || "",
    sale_amount: card.sale_amount ?? "",
    notes: card.notes || "",
  });

  const advance = useMutation({
    mutationFn: async () => {
      if (!disposition) throw new Error("Choose a disposition");
      if (!canAdvance) throw new Error("Upload at least one photo and add at least one note before advancing.");
      const newStatus = disposition === "no_sale" ? "cancelled" : "quote";
      const payload: any = {
        sale_disposition: disposition,
        status: newStatus,
        advanced_at: new Date().toISOString(),
        advanced_by: user?.id || null,
        completed_at: disposition === "no_sale" ? new Date().toISOString() : null,
      };
      const { error } = await supabase.from("job_cards").update(payload).eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_card_progress", card.id] });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Cannot advance", description: e.message, variant: "destructive" }),
  });

  const saveQuote = useMutation({
    mutationFn: async (action: "save" | "complete") => {
      const payload: any = {
        sale_amount: quote.sale_amount === "" ? null : Number(quote.sale_amount),
        notes: quote.notes || null,
        quote_details: {
          scope: quote.scope,
          materials: quote.materials,
          timeline: quote.timeline,
        },
      };
      if (action === "complete") {
        if (!quote.scope || !quote.sale_amount) throw new Error("Scope and sale amount are required to complete the quote.");
        payload.status = "completed";
        payload.completed_at = new Date().toISOString();
      }
      const { error } = await supabase.from("job_cards").update(payload).eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: onSaved,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle className="flex items-center justify-between">
          <span>{card.job_number}</span>
          <Badge variant={STATUS_VARIANT[card.status]}>{card.status.replace("_", " ")}</Badge>
        </SheetTitle>
      </SheetHeader>

      {/* Stage 1: Open — pick disposition + require photos & notes */}
      {card.status === "open" && (
        <div className="space-y-4">
          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">Required to advance</div>
            <RequirementRow ok={hasPhotos} icon={<Camera className="w-4 h-4" />} label="Upload at least 1 photo" sub={`${counts?.photos ?? 0} uploaded`} />
            <RequirementRow ok={hasNotes} icon={<FileText className="w-4 h-4" />} label="Add at least 1 note" sub={`${counts?.notes ?? 0} added`} />
            {!canAdvance && (
              <p className="text-xs text-muted-foreground pt-1">
                Use the Notes and Job Card Photos tabs (attach photos to this job card) before advancing.
              </p>
            )}
          </Card>

          <div className="space-y-2">
            <Label>Sales disposition</Label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { v: "no_sale", label: "No Sale", desc: "Close this job card", icon: <XCircle className="w-4 h-4 text-destructive" /> },
                { v: "roof_replacement", label: "Roof Replacement", desc: "Move to quote stage", icon: <CheckCircle2 className="w-4 h-4 text-primary" /> },
                { v: "solar_installation", label: "Solar Installation", desc: "Move to quote stage", icon: <CheckCircle2 className="w-4 h-4 text-primary" /> },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setDisposition(opt.v)}
                  className={`text-left p-3 rounded-md border transition-colors ${
                    disposition === opt.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {opt.icon}
                    {opt.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 ml-6">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!disposition || !canAdvance || advance.isPending}
            onClick={() => advance.mutate()}
          >
            {advance.isPending
              ? "Advancing..."
              : disposition === "no_sale"
              ? "Close Job Card"
              : "Advance to Quote Stage"}
          </Button>
        </div>
      )}

      {/* Stage 2: Quote — capture full details */}
      {card.status === "quote" && (
        <div className="space-y-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Disposition</div>
            <div className="font-medium">{DISPOSITION_LABEL[card.sale_disposition] || "—"}</div>
          </Card>
          <div className="space-y-1.5">
            <Label>Scope of work *</Label>
            <Textarea rows={3} value={quote.scope} onChange={(e) => setQuote({ ...quote, scope: e.target.value })} placeholder="Describe the work to be done..." />
          </div>
          <div className="space-y-1.5">
            <Label>Materials / system specs</Label>
            <Textarea rows={2} value={quote.materials} onChange={(e) => setQuote({ ...quote, materials: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Timeline</Label>
            <Input value={quote.timeline} onChange={(e) => setQuote({ ...quote, timeline: e.target.value })} placeholder="e.g. 2-3 weeks" />
          </div>
          <div className="space-y-1.5">
            <Label>Sale amount *</Label>
            <Input type="number" step="0.01" value={quote.sale_amount as any} onChange={(e) => setQuote({ ...quote, sale_amount: e.target.value as any })} />
          </div>
          <div className="space-y-1.5">
            <Label>Internal notes</Label>
            <Textarea rows={3} value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={saveQuote.isPending} onClick={() => saveQuote.mutate("save")}>
              Save draft
            </Button>
            <Button className="flex-1" disabled={saveQuote.isPending} onClick={() => saveQuote.mutate("complete")}>
              Complete Quote
            </Button>
          </div>
        </div>
      )}

      {/* Final stages */}
      {(card.status === "completed" || card.status === "cancelled") && (
        <div className="space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {card.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <XCircle className="w-5 h-5 text-destructive" />}
              <span className="font-medium">{card.status === "completed" ? "Job card completed" : "Job card closed"}</span>
            </div>
            {card.sale_disposition && (
              <div className="text-sm"><span className="text-muted-foreground">Disposition:</span> {DISPOSITION_LABEL[card.sale_disposition]}</div>
            )}
            {card.sale_amount != null && (
              <div className="text-sm"><span className="text-muted-foreground">Sale amount:</span> ${Number(card.sale_amount).toLocaleString()}</div>
            )}
            {card.quote_details?.scope && (
              <div className="text-sm"><span className="text-muted-foreground">Scope:</span> {card.quote_details.scope}</div>
            )}
            {card.notes && <div className="text-sm whitespace-pre-wrap text-muted-foreground">{card.notes}</div>}
          </Card>
        </div>
      )}
    </div>
  );
}

function RequirementRow({ ok, icon, label, sub }: { ok: boolean; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
      <span className="flex items-center gap-1.5 flex-1">{icon}{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}
