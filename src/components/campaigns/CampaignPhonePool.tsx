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
import { Plus, Trash2, Phone } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="w-5 h-5" /> Outbound Number Pool ({phones.length})
        </CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Number
        </Button>
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
    </Card>
  );
}
