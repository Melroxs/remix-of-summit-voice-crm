import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Phone, ShieldCheck, MapPin, Shuffle, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CampaignPhoneNumber } from "@/hooks/use-campaign-phones";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  campaignId: string;
  phones: CampaignPhoneNumber[];
  onRefresh: () => void;
}

export default function CampaignPhonePool({ campaignId, phones, onRefresh }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState("telnyx");
  const [saving, setSaving] = useState(false);
  const [existingCallerId, setExistingCallerId] = useState<string>("");
  const [companyCallerIds, setCompanyCallerIds] = useState<Array<{ id: string; phone_e164: string }>>([]);
  const { activeCompanyId } = useAuth();

  // Verify caller ID (dry run)
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    to: string | null;
    from: string | null;
    caller_id_phone: string | null;
    caller_id_area_code: string | null;
    caller_id_strategy: "local_presence" | "rotation_fallback" | "manual_override" | "no_match";
    lead_area_code: string | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!dialogOpen || !activeCompanyId) return;
    supabase
      .from("caller_ids")
      .select("id, phone_e164")
      .eq("company_id", activeCompanyId)
      .eq("is_active", true)
      .then(({ data }) => setCompanyCallerIds(data || []));
  }, [dialogOpen, activeCompanyId]);

  const handleAdd = async () => {
    if (!existingCallerId && !phoneNumber.trim()) return;
    if (!activeCompanyId) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    setSaving(true);

    let callerIdToLink = existingCallerId;
    if (!callerIdToLink) {
      // Create a brand new caller_id for this company
      const { data: created, error: createErr } = await supabase
        .from("caller_ids")
        .insert({
          company_id: activeCompanyId,
          phone_e164: phoneNumber.trim(),
          provider,
        })
        .select("id")
        .single();
      if (createErr || !created) {
        toast({ title: "Error", description: createErr?.message || "Failed to add number", variant: "destructive" });
        setSaving(false);
        return;
      }
      callerIdToLink = created.id;
    }

    const { error } = await supabase.from("campaign_caller_ids").insert({
      campaign_id: campaignId,
      caller_id: callerIdToLink,
      rotation_order: phones.length,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Number added" });
      setDialogOpen(false);
      setPhoneNumber("");
      setExistingCallerId("");
      onRefresh();
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    // Toggle the underlying caller_id activity (id here = campaign_caller_ids.id; find caller_id)
    const phone = phones.find((p) => p.id === id);
    if (!phone) return;
    await supabase.from("caller_ids").update({ is_active: !isActive }).eq("id", phone.caller_id);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("campaign_caller_ids").delete().eq("id", id);
    toast({ title: "Number removed" });
    onRefresh();
  };

  const handleVerify = async () => {
    const trimmed = verifyPhone.trim();
    if (!/^\+\d{8,15}$/.test(trimmed)) {
      toast({ title: "Invalid phone", description: "Use E.164 format, e.g. +14805551234", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    const { data, error } = await supabase.functions.invoke("telnyx-create-call", {
      body: {
        campaign_id: campaignId,
        dry_run: true,
        test_phone_e164: trimmed,
      },
    });
    setVerifying(false);
    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      setVerifyResult({
        to: trimmed, from: null, caller_id_phone: null, caller_id_area_code: null,
        caller_id_strategy: "no_match", lead_area_code: null, error: error.message,
      });
      return;
    }
    setVerifyResult(data);
  };

  const strategyMeta = (s: string) => {
    if (s === "local_presence") return { label: "Local presence match", icon: MapPin, className: "text-emerald-600 dark:text-emerald-400" };
    if (s === "rotation_fallback") return { label: "Rotation fallback (LRU)", icon: Shuffle, className: "text-amber-600 dark:text-amber-400" };
    if (s === "manual_override") return { label: "Manual override", icon: ShieldCheck, className: "text-blue-600 dark:text-blue-400" };
    return { label: "No caller ID matched", icon: AlertCircle, className: "text-destructive" };
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="w-5 h-5" /> Outbound Number Pool ({phones.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setVerifyOpen(true); setVerifyResult(null); }}
            disabled={phones.length === 0}
            title={phones.length === 0 ? "Add at least one number to verify" : "Run a dry-run caller-ID selection"}
          >
            <ShieldCheck className="w-4 h-4 mr-1" /> Verify caller ID
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Number
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {phones.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No outbound numbers configured. The dialer will use the default caller ID from the provider.
          </p>
        ) : (
          <div className="space-y-2">
            {phones.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6">#{i + 1}</span>
                  <span className="font-mono text-sm text-foreground">{p.phone_number}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{p.provider}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p.id, p.is_active)} />
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Outbound Number</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {companyCallerIds.length > 0 && (
              <div>
                <Label>Use existing company number</Label>
                <Select value={existingCallerId} onValueChange={setExistingCallerId}>
                  <SelectTrigger><SelectValue placeholder="Pick from your number pool" /></SelectTrigger>
                  <SelectContent>
                    {companyCallerIds
                      .filter((c) => !phones.some((p) => p.caller_id === c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.phone_e164}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Or add a brand-new number below.</p>
              </div>
            )}
            <div>
              <Label>Phone Number (E.164)</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => { setPhoneNumber(e.target.value); if (e.target.value) setExistingCallerId(""); }}
                placeholder="+14805551234"
                disabled={!!existingCallerId}
              />
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider} disabled={!!existingCallerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnyx">Telnyx</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || (!phoneNumber.trim() && !existingCallerId)}>
              {saving ? "Adding..." : "Add Number"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> Verify caller ID selection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Test lead phone (E.164)</Label>
              <Input
                value={verifyPhone}
                onChange={(e) => setVerifyPhone(e.target.value)}
                placeholder="+14805551234"
              />
              <p className="text-xs text-muted-foreground mt-1">
                No real call is placed. We just run the selection logic and show which number would be used.
              </p>
            </div>

            {verifyResult && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                {(() => {
                  const meta = strategyMeta(verifyResult.caller_id_strategy);
                  const Icon = meta.icon;
                  return (
                    <div className={`flex items-center gap-2 font-medium ${meta.className}`}>
                      <Icon className="w-4 h-4" /> {meta.label}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-[140px_1fr] gap-y-1 font-mono text-xs">
                  <span className="text-muted-foreground">Lead area code</span>
                  <span>{verifyResult.lead_area_code ?? "—"}</span>
                  <span className="text-muted-foreground">Selected from</span>
                  <span>{verifyResult.from ?? "—"}</span>
                  <span className="text-muted-foreground">Caller-ID area</span>
                  <span>{verifyResult.caller_id_area_code ?? "—"}</span>
                  <span className="text-muted-foreground">Dialing to</span>
                  <span>{verifyResult.to ?? "—"}</span>
                </div>
                {verifyResult.error && (
                  <p className="text-xs text-destructive">{verifyResult.error}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(false)}>Close</Button>
            <Button onClick={handleVerify} disabled={verifying || !verifyPhone.trim()}>
              {verifying ? "Verifying…" : "Run verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
