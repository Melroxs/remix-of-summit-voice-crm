import { QueueContact } from "@/hooks/use-dialer-queue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, MapPin, Home, DollarSign, CreditCard, Phone, Pencil, Mail } from "lucide-react";
import { formatPhoneDisplay, normalizePhoneToE164 } from "@/lib/phone";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  lead: (QueueContact & { email?: string | null }) | null;
}

type EditState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
};

export default function LeadCard({ lead }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditState | null>(null);

  useEffect(() => {
    // Exit edit mode if the lead changes
    setEditing(false);
    setForm(null);
  }, [lead?.contact_id]);

  const startEdit = () => {
    if (!lead) return;
    setForm({
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      phone: lead.phone_e164 ?? lead.phone_raw ?? "",
      email: (lead as any).email ?? "",
      address: lead.address ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      zip_code: lead.zip_code ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const saveEdit = async () => {
    if (!lead || !form) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
      };

      const phoneInput = form.phone.trim();
      if (phoneInput) {
        const norm = normalizePhoneToE164(phoneInput);
        if (!norm.valid) {
          toast.error(norm.error || "Invalid phone number");
          setSaving(false);
          return;
        }
        updates.phone_e164 = norm.e164;
        updates.phone_raw = phoneInput;
      } else {
        updates.phone_e164 = null;
        updates.phone_raw = null;
      }

      const { error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", lead.contact_id);
      if (error) throw error;

      // Mutate the lead object in place so display reflects changes immediately
      // without altering the parent's queue state.
      Object.assign(lead, {
        first_name: updates.first_name,
        last_name: updates.last_name,
        email: updates.email,
        address: updates.address,
        city: updates.city,
        state: updates.state,
        zip_code: updates.zip_code,
        phone_e164: updates.phone_e164,
        phone_raw: updates.phone_raw,
      });

      toast.success("Lead updated");
      setEditing(false);
      setForm(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update lead");
    } finally {
      setSaving(false);
    }
  };

  if (!lead) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Active Lead
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No active lead</p>
            <p className="text-muted-foreground text-xs mt-1">Click "Next Lead" to load from queue</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const phone = lead.phone_e164
    ? formatPhoneDisplay(lead.phone_e164)
    : lead.phone_raw || "No phone";

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            {lead.first_name} {lead.last_name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Attempt #{lead.attempts + 1}
            </Badge>
            {!editing && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Edit lead"
                onClick={startEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {editing && form ? (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">First name</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-1">
              <Label className="text-xs">City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="text-xs">State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="text-xs">Zip</Label>
              <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      ) : (
      <CardContent className="space-y-3">
        {lead.title && (
          <p className="text-xs text-muted-foreground">{lead.title}</p>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Phone className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-foreground">{phone}</span>
        </div>

        {(lead as any).email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{(lead as any).email}</span>
          </div>
        )}

        {(lead.address || lead.city || lead.state) && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
            <span className="text-muted-foreground">
              {[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          {lead.owner_renter && (
            <div className="flex items-center gap-1.5">
              <Home className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.owner_renter}</span>
            </div>
          )}
          {lead.home_value && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.home_value}</span>
            </div>
          )}
          {lead.credit_rating && (
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.credit_rating}</span>
            </div>
          )}
          {lead.household_income && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.household_income}</span>
            </div>
          )}
        </div>

        {lead.cool_notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
            {lead.cool_notes}
          </p>
        )}
      </CardContent>
      )}
    </Card>
  );
}
