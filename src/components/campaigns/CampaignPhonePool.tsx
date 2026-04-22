import { useState } from "react";
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

  const handleAdd = async () => {
    if (!phoneNumber.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("campaign_phone_numbers").insert({
      campaign_id: campaignId,
      phone_number: phoneNumber.trim(),
      provider,
      rotation_order: phones.length,
    } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Number added" }); setDialogOpen(false); setPhoneNumber(""); onRefresh(); }
    setSaving(false);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from("campaign_phone_numbers").update({ is_active: !isActive } as any).eq("id", id);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("campaign_phone_numbers").delete().eq("id", id);
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
            <div>
              <Label>Phone Number (E.164)</Label>
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+14805551234" />
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
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
            <Button onClick={handleAdd} disabled={saving || !phoneNumber.trim()}>
              {saving ? "Adding..." : "Add Number"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
