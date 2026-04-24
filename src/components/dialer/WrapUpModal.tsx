import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Sparkles, Phone, CalendarCheck, Clock, X, Loader2 } from "lucide-react";
import QualificationForm, { QualificationData, emptyQualification } from "./QualificationForm";
import {
  validateCompleteDialAttempt,
  DialerValidationError,
} from "@/lib/dialer-service";

interface DispositionOption {
  code: string;
  label: string;
  color: string;
}

const DISPOSITIONS: DispositionOption[] = [
  { code: "appointment_booked", label: "Appointment booked", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  { code: "callback", label: "Callback scheduled", color: "bg-primary/10 text-primary border-primary/30" },
  { code: "not_interested", label: "Not interested", color: "bg-warning/10 text-warning border-warning/30" },
  { code: "no_answer", label: "No answer", color: "bg-muted text-muted-foreground" },
  { code: "voicemail", label: "Voicemail", color: "bg-muted text-muted-foreground" },
  { code: "wrong_number", label: "Wrong number", color: "bg-destructive/10 text-destructive border-destructive/30" },
  { code: "dnc", label: "DNC request", color: "bg-destructive/10 text-destructive border-destructive/30" },
  { code: "have_solar", label: "Already has solar/roof done", color: "bg-muted text-muted-foreground" },
];

interface Props {
  open: boolean;
  contactId: string;
  contactName: string;
  contactAddress?: string | null;
  contactCity?: string | null;
  contactState?: string | null;
  contactZip?: string | null;
  campaignId: string | null;
  callAttemptId: string | null;
  callDuration: number;
  initialNotes?: string;
  onClose: () => void;
  /** Called after disposition + qualification saved. Returns disposition code so dialer can advance. */
  onComplete: (params: {
    disposition: string;
    needsAppointmentModal: boolean;
    needsCallbackModal: boolean;
  }) => void;
}

export default function WrapUpModal({
  open, contactId, contactName, contactAddress, contactCity, contactState, contactZip,
  campaignId, callAttemptId, callDuration, initialNotes,
  onClose, onComplete,
}: Props) {
  const { toast } = useToast();
  const [disposition, setDisposition] = useState<string>("");
  const [notes, setNotes] = useState(initialNotes || "");
  const [qualification, setQualification] = useState<QualificationData>({
    ...emptyQualification,
    property_address: [contactAddress, contactCity, contactState, contactZip].filter(Boolean).join(", "),
  });
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"disposition" | "qualification" | "ai">("disposition");

  // Auto-generate AI summary as soon as wrap-up opens & we have a call attempt
  useEffect(() => {
    if (!open || !callAttemptId || aiSummary || aiLoading) return;
    setAiLoading(true);
    supabase.functions
      .invoke("ai-call-summary", { body: { call_attempt_id: callAttemptId } })
      .then(({ data, error }) => {
        if (!error && data?.summary) setAiSummary(data.summary);
      })
      .finally(() => setAiLoading(false));
  }, [open, callAttemptId, aiSummary, aiLoading]);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}m ${s % 60}s`;

  const handleSave = async () => {
    if (!disposition) {
      toast({ title: "Select a disposition", variant: "destructive" });
      return;
    }
    if (!callAttemptId) {
      toast({
        title: "Cannot save disposition",
        description: "No active call attempt — the call may not have started yet.",
        variant: "destructive",
      });
      return;
    }
    // Pre-validate against the dialer-service contract. Callback datetime is collected
    // in the follow-up CallbackModal, so we skip that check here.
    try {
      if (disposition !== "callback") {
        validateCompleteDialAttempt(callAttemptId, disposition, { notes });
      } else {
        // Just check call_attempt_id + notes shape; callback time handled downstream.
        validateCompleteDialAttempt(callAttemptId, "connected", { notes });
      }
    } catch (err) {
      const msg =
        err instanceof DialerValidationError ? err.message : "Invalid disposition";
      toast({ title: "Invalid disposition", description: msg, variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      // Save qualification only if meaningful contact was made
      const reachedDispositions = ["appointment_booked", "callback", "not_interested", "have_solar"];
      if (reachedDispositions.includes(disposition)) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("lead_qualifications").insert({
          contact_id: contactId,
          call_attempt_id: callAttemptId,
          campaign_id: campaignId,
          agent_id: user?.id || null,
          ...qualification,
        } as any);
      }

      // Update notes on the call attempt
      if (callAttemptId && notes) {
        await supabase.from("call_attempts").update({ notes }).eq("id", callAttemptId);
      }

      onComplete({
        disposition,
        needsAppointmentModal: disposition === "appointment_booked",
        needsCallbackModal: disposition === "callback",
      });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Post-call wrap-up
            <Badge variant="outline" className="ml-2 text-muted-foreground">
              <Clock className="w-3 h-3 mr-1" /> {formatDuration(callDuration)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          <Phone className="w-3 h-3 inline mr-1" />
          {contactName}
        </p>

        {/* Disposition pills — always visible */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Disposition *
          </p>
          <div className="flex flex-wrap gap-2">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.code}
                onClick={() => setDisposition(d.code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  disposition === d.code ? d.color + " ring-2 ring-offset-1 ring-offset-background ring-current" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="disposition">Notes</TabsTrigger>
            <TabsTrigger value="qualification">Qualification</TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="w-3 h-3 mr-1" /> AI summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="disposition" className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Call notes</p>
              <Textarea
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick notes from the call..."
              />
            </div>
          </TabsContent>

          <TabsContent value="qualification">
            <QualificationForm value={qualification} onChange={setQualification} compact />
          </TabsContent>

          <TabsContent value="ai" className="space-y-3">
            {aiLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                <p className="text-sm">Generating AI summary…</p>
              </div>
            )}
            {!aiLoading && !aiSummary && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                AI summary will appear once the call is logged.
              </p>
            )}
            {aiSummary && (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">Summary</p>
                  <p className="text-sm text-foreground">{aiSummary.summary}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lead quality</p>
                    <p className="text-2xl font-bold text-foreground">
                      {aiSummary.lead_quality_score ?? "—"}<span className="text-sm text-muted-foreground">/10</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sentiment</p>
                    <p className="text-sm font-medium capitalize">{aiSummary.sentiment ?? "—"}</p>
                  </div>
                </div>
                {aiSummary.recommended_action && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                    <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-1">
                      Recommended next action
                    </p>
                    <p className="text-sm text-foreground">{aiSummary.recommended_action}</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={!disposition || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarCheck className="w-4 h-4 mr-1" />}
            Save & continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
