import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneToE164 } from "@/lib/phone";
import { contactSchema, firstZodMessage } from "@/lib/validation";
import { logEvent } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import PhoneE164Preview from "./PhoneE164Preview";

interface Props {
  contact: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditContactModal({ contact, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    title: contact.title || "",
    address: contact.address || "",
    city: contact.city || "",
    state: contact.state || "",
    zip_code: contact.zip_code || "",
    county: contact.county || "",
    phone_raw: contact.phone_raw || "",
    owner_renter: contact.owner_renter || "",
    credit_rating: contact.credit_rating || "",
    home_value: contact.home_value || "",
    household_income: contact.household_income || "",
    cool_notes: contact.cool_notes || "",
  });

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handlePhoneBlur = () => {
    const trimmed = (form.phone_raw || "").trim();
    if (!trimmed) return;
    const n = normalizePhoneToE164(trimmed);
    if (n.valid && form.phone_raw !== n.e164) {
      setForm((f) => ({ ...f, phone_raw: n.e164 }));
    }
  };

  const phoneValidation = useMemo(() => {
    const trimmed = (form.phone_raw || "").trim();
    if (!trimmed) return { valid: false, error: "Phone number is required" };
    const n = normalizePhoneToE164(trimmed);
    return n.valid
      ? { valid: true, error: "" }
      : { valid: false, error: n.error || "Invalid phone number" };
  }, [form.phone_raw]);

  const handleSave = async () => {
    if (!phoneValidation.valid) {
      setFieldErrors((prev) => ({ ...prev, phone_raw: phoneValidation.error }));
      toast({ title: "Invalid phone number", description: phoneValidation.error, variant: "destructive" });
      return;
    }
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Check the form", description: firstZodMessage(parsed.error), variant: "destructive" });
      return;
    }
    setLoading(true);
    let phone_e164 = "";
    let phone_raw = form.phone_raw?.trim() || "";
    if (phone_raw) {
      const result = normalizePhoneToE164(phone_raw);
      if (!result.valid) {
        toast({ title: "Invalid phone number", description: result.error, variant: "destructive" });
        setLoading(false);
        return;
      }
      phone_e164 = result.e164;
      phone_raw = result.e164;
    }
    const { error } = await supabase
      .from("contacts")
      .update({ ...form, phone_raw, phone_e164 })
      .eq("id", contact.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contact updated" });
      logEvent({ type: "contact.updated", entity_type: "contact", entity_id: contact.id }).catch(() => {});
      onSaved();
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name *</Label>
            <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Last Name *</Label>
            <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone *</Label>
            <Input
              value={form.phone_raw}
              onChange={(e) => update("phone_raw", e.target.value)}
              onBlur={handlePhoneBlur}
              placeholder="(602) 555-1234"
              aria-invalid={!phoneValidation.valid}
              className={!phoneValidation.valid && form.phone_raw ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            <PhoneE164Preview rawValue={form.phone_raw} />
            {fieldErrors.phone_raw && (
              <p className="text-xs text-destructive">{fieldErrors.phone_raw}</p>
            )}
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Zip Code</Label>
            <Input value={form.zip_code} onChange={(e) => update("zip_code", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>County</Label>
            <Input value={form.county} onChange={(e) => update("county", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Owner / Renter</Label>
            <Input value={form.owner_renter} onChange={(e) => update("owner_renter", e.target.value)} placeholder="Owner or Renter" />
          </div>
          <div className="space-y-2">
            <Label>Credit Rating</Label>
            <Input value={form.credit_rating} onChange={(e) => update("credit_rating", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Home Value</Label>
            <Input value={form.home_value} onChange={(e) => update("home_value", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Household Income</Label>
            <Input value={form.household_income} onChange={(e) => update("household_income", e.target.value)} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Cool Notes</Label>
            <Textarea value={form.cool_notes} onChange={(e) => update("cool_notes", e.target.value)} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !phoneValidation.valid}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
