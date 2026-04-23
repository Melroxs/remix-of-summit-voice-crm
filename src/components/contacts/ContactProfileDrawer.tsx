import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2 } from "lucide-react";
import { Lock } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";
import EditContactModal from "./EditContactModal";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import ContactActivityTimeline from "@/components/dialer/ContactActivityTimeline";
import { toast } from "@/hooks/use-toast";

interface Props {
  contactId: string;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export default function ContactProfileDrawer({ contactId, onClose, onDeleted, onUpdated }: Props) {
  const [contact, setContact] = useState<any>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchContact = async () => {
    const { data } = await supabase.from("contacts").select("*").eq("id", contactId).single();
    setContact(data);
    if (data?.locked_to_agent_id) {
      const { data: profile } = await supabase
        .from("profiles").select("display_name").eq("user_id", data.locked_to_agent_id).maybeSingle();
      setOwnerName(profile?.display_name || "Agent");
    } else {
      setOwnerName(null);
    }
  };

  useEffect(() => {
    fetchContact();
  }, [contactId]);

  const handleDelete = async () => {
    await supabase.from("campaign_contacts").delete().eq("contact_id", contactId);
    await supabase.from("callbacks").delete().eq("contact_id", contactId);
    await supabase.from("appointments").delete().eq("contact_id", contactId);
    await supabase.from("call_attempts").update({ contact_id: null }).eq("contact_id", contactId);
    const { error } = await supabase.from("contacts").delete().eq("id", contactId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contact deleted" });
      setShowDelete(false);
      onDeleted?.();
      onClose();
    }
  };

  if (!contact) return null;

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between pr-8">
              <span>{contact.first_name} {contact.last_name}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-4">
            {ownerName && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-md">
                <Lock className="w-4 h-4 text-primary" />
                <span className="text-sm">Owned by <strong>{ownerName}</strong> after live connect</span>
              </div>
            )}
            {/* Contact Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {contact.title && <div><span className="text-muted-foreground">Title:</span> {contact.title}</div>}
              {contact.phone_e164 && <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{formatPhoneDisplay(contact.phone_e164)}</span></div>}
              {contact.address && <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {contact.address}</div>}
              {(contact.city || contact.state || contact.zip_code) && (
                <div className="col-span-2"><span className="text-muted-foreground">Location:</span> {[contact.city, contact.state, contact.zip_code].filter(Boolean).join(", ")}</div>
              )}
              {contact.county && <div><span className="text-muted-foreground">County:</span> {contact.county}</div>}
              {contact.owner_renter && <div><span className="text-muted-foreground">Owner/Renter:</span> {contact.owner_renter}</div>}
              {contact.credit_rating && <div><span className="text-muted-foreground">Credit:</span> {contact.credit_rating}</div>}
              {contact.home_value && <div><span className="text-muted-foreground">Home Value:</span> {contact.home_value}</div>}
              {contact.household_income && <div><span className="text-muted-foreground">Income:</span> {contact.household_income}</div>}
              <div className="col-span-2">
                <Badge variant="secondary" className="text-xs">{contact.lead_status}</Badge>
              </div>
              {contact.cool_notes && (
                <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <p className="mt-1 text-xs whitespace-pre-wrap">{contact.cool_notes}</p></div>
              )}
            </div>

            <Separator />

            {/* Unified Activity Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Activity History</h3>
              <ContactActivityTimeline contactId={contactId} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showEdit && (
        <EditContactModal
          contact={contact}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); fetchContact(); onUpdated?.(); }}
        />
      )}

      <DeleteConfirmDialog
        open={showDelete}
        title="Delete Contact"
        description="This will permanently remove this contact from the system, including campaign assignments, callbacks, and appointments."
        itemName={`${contact.first_name} ${contact.last_name}`}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  );
}
