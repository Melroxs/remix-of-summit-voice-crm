import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Users, ChevronLeft, ChevronRight, Megaphone, Trash2 } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";
import ContactModal from "@/components/contacts/ContactModal";
import ContactProfileDrawer from "@/components/contacts/ContactProfileDrawer";
import DeleteConfirmDialog from "@/components/contacts/DeleteConfirmDialog";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

export default function Contacts() {
  const { role, isAdmin } = useAuth();
  const isClient = role === "client";
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [targetCampaign, setTargetCampaign] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let countQuery = supabase.from("contacts").select("id", { count: "exact", head: true });
    let query = supabase.from("contacts").select("*").order("created_at", { ascending: false }).range(from, to);

    if (search) {
      const filter = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_e164.ilike.%${search}%`;
      query = query.or(filter);
      countQuery = countQuery.or(filter);
    }

    const [{ data }, { count }] = await Promise.all([query, countQuery]);
    setContacts(data || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { setPage(0); }, [search]);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
  }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map(c => c.id)));
  };

  const handleBulkAssign = async () => {
    if (!targetCampaign || selected.size === 0) return;
    setAssigning(true);
    const { data: existing } = await supabase.from("campaign_contacts").select("contact_id").eq("campaign_id", targetCampaign);
    const existingIds = new Set((existing || []).map(e => e.contact_id));
    const newIds = [...selected].filter(id => !existingIds.has(id));
    if (newIds.length === 0) {
      toast({ title: "Already assigned", description: "All selected contacts are already in this campaign." });
      setAssigning(false); return;
    }
    const rows = newIds.map(contact_id => ({ campaign_id: targetCampaign, contact_id }));
    const { error } = await supabase.from("campaign_contacts").insert(rows);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      const skipped = selected.size - newIds.length;
      toast({ title: "Assigned", description: `${newIds.length} contacts added${skipped > 0 ? ` (${skipped} already existed)` : ""}` });
      setShowAssignDialog(false); setSelected(new Set()); setTargetCampaign("");
    }
    setAssigning(false);
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    const BATCH = 500;
    let totalDeleted = 0;
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        await supabase.from("callbacks").delete().in("contact_id", batch);
        await supabase.from("appointments").delete().in("contact_id", batch);
        await supabase.from("campaign_contacts").delete().in("contact_id", batch);
        await supabase.from("call_logs").update({ contact_id: null }).in("contact_id", batch);
        const { count, error } = await supabase.from("contacts").delete({ count: "exact" }).in("id", batch);
        if (error) throw error;
        totalDeleted += count || 0;
      }
      toast({ title: "Deleted", description: `${totalDeleted} contacts removed.` });
      setSelected(new Set()); setShowBulkDelete(false); fetchContacts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteAll = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("delete-all-contacts");
      if (error || !data?.success) {
        toast({ title: "Error", description: data?.error || error?.message || "Failed to delete contacts.", variant: "destructive" });
        return;
      }
      toast({ title: "All Contacts Deleted", description: `${data.deleted_contacts} contacts removed from the CRM.` });
      setShowDeleteAll(false);
      fetchContacts();
    } catch {
      toast({ title: "Error", description: "Unexpected error.", variant: "destructive" });
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-primary/10 text-primary", contacted: "bg-warning/10 text-warning",
      qualified: "bg-success/10 text-success", converted: "bg-success/20 text-success",
      dead: "bg-destructive/10 text-destructive",
    };
    return map[status] || "";
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">{totalCount.toLocaleString()} contacts</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && !isClient && (
            <>
              <Button variant="outline" onClick={() => setShowAssignDialog(true)}>
                <Megaphone className="w-4 h-4 mr-2" />Assign {selected.size}
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setShowBulkDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" />Delete {selected.size}
              </Button>
            </>
          )}
          {isAdmin && totalCount > 0 && selected.size === 0 && (
            <Button variant="outline" className="text-destructive" onClick={() => setShowDeleteAll(true)}>
              <Trash2 className="w-4 h-4 mr-2" />Delete All
            </Button>
          )}
          {!isClient && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Contact
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {!isClient && <TableHead className="w-10"><Checkbox checked={contacts.length > 0 && selected.size === contacts.length} onCheckedChange={toggleSelectAll} /></TableHead>}
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner/Renter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">
                  <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No contacts found.</p>
                </TableCell></TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedContactId(c.id)}>
                    {!isClient && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {c.first_name} {c.last_name}
                      {c.title && <span className="text-muted-foreground text-xs ml-2">{c.title}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatPhoneDisplay(c.phone_e164 || c.phone_raw || "")}</TableCell>
                    <TableCell className="text-sm">{[c.city, c.state].filter(Boolean).join(", ")}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor(c.lead_status)}>{c.lead_status}</Badge></TableCell>
                    <TableCell className="text-sm">{c.owner_renter || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}><ChevronLeft className="w-4 h-4 mr-1" />Prev</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <ContactModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchContacts(); }} />
      )}

      {selectedContactId && (
        <ContactProfileDrawer
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onDeleted={() => { setSelectedContactId(null); fetchContacts(); }}
          onUpdated={() => fetchContacts()}
        />
      )}

      <DeleteConfirmDialog
        open={showBulkDelete}
        title="Delete Selected Contacts"
        description="This will permanently remove all selected contacts and their associated data."
        itemName={`${selected.size} contacts`}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />

      <DeleteConfirmDialog
        open={showDeleteAll}
        title="Delete ALL Contacts"
        description={`This will permanently remove all ${totalCount.toLocaleString()} contacts from the CRM, including their campaign assignments, callbacks, appointments, and queue entries.`}
        itemName={`${totalCount.toLocaleString()} contacts`}
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteAll(false)}
      />

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign {selected.size} Contacts to Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Duplicates will be skipped automatically.</p>
            <Select value={targetCampaign} onValueChange={setTargetCampaign}>
              <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
              <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={assigning || !targetCampaign}>{assigning ? "Assigning..." : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
