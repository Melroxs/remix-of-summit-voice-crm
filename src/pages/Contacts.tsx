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
import { Search, Plus, Users, ChevronLeft, ChevronRight, Megaphone, Trash2, Lock, Filter } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";
import ContactModal from "@/components/contacts/ContactModal";
import ContactProfileDrawer from "@/components/contacts/ContactProfileDrawer";
import DeleteConfirmDialog from "@/components/contacts/DeleteConfirmDialog";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

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

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<string>("all"); // all | locked | unlocked
  const [agents, setAgents] = useState<Record<string, string>>({}); // user_id -> display_name

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [countyFilter, setCountyFilter] = useState("");
  const [areaCodeFilter, setAreaCodeFilter] = useState("");
  const [ownerRenterFilter, setOwnerRenterFilter] = useState("all");
  const [creditFilter, setCreditFilter] = useState("");
  const [homeValueFilter, setHomeValueFilter] = useState("");
  const [householdIncomeFilter, setHouseholdIncomeFilter] = useState("");
  const [createdFromFilter, setCreatedFromFilter] = useState("");
  const [createdToFilter, setCreatedToFilter] = useState("");
  const [importBatchFilter, setImportBatchFilter] = useState<string>("all");
  const [importBatches, setImportBatches] = useState<{ id: string; filename: string }[]>([]);

  // Per-contact ops data (attempts, last_call, next_callback) keyed by contact_id
  const [opsData, setOpsData] = useState<Record<string, { attempts: number; last_called_at: string | null; next_callback_at: string | null }>>({});

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
      const filter = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_e164.ilike.%${search}%,email.ilike.%${search}%`;
      query = query.or(filter);
      countQuery = countQuery.or(filter);
    }
    if (statusFilter !== "all") {
      query = query.eq("lead_status", statusFilter as any);
      countQuery = countQuery.eq("lead_status", statusFilter as any);
    }
    if (ownershipFilter === "locked") {
      query = query.not("locked_to_agent_id", "is", null);
      countQuery = countQuery.not("locked_to_agent_id", "is", null);
    } else if (ownershipFilter === "unlocked") {
      query = query.is("locked_to_agent_id", null);
      countQuery = countQuery.is("locked_to_agent_id", null);
    }
    const applyText = (col: string, val: string) => {
      if (!val.trim()) return;
      query = query.ilike(col, `%${val.trim()}%`);
      countQuery = countQuery.ilike(col, `%${val.trim()}%`);
    };
    applyText("city", cityFilter);
    applyText("state", stateFilter);
    applyText("zip_code", zipFilter);
    applyText("county", countyFilter);
    applyText("credit_rating", creditFilter);
    applyText("home_value", homeValueFilter);
    applyText("household_income", householdIncomeFilter);
    if (areaCodeFilter.trim()) {
      const ac = areaCodeFilter.replace(/\D/g, "");
      const pat = `+1${ac}%`;
      query = query.ilike("phone_e164", pat);
      countQuery = countQuery.ilike("phone_e164", pat);
    }
    if (ownerRenterFilter !== "all") {
      query = query.eq("owner_renter", ownerRenterFilter);
      countQuery = countQuery.eq("owner_renter", ownerRenterFilter);
    }
    if (createdFromFilter) {
      query = query.gte("created_at", createdFromFilter);
      countQuery = countQuery.gte("created_at", createdFromFilter);
    }
    if (createdToFilter) {
      query = query.lte("created_at", createdToFilter);
      countQuery = countQuery.lte("created_at", createdToFilter);
    }
    if (importBatchFilter !== "all") {
      query = query.eq("lead_import_id", importBatchFilter);
      countQuery = countQuery.eq("lead_import_id", importBatchFilter);
    }
    if (campaignFilter !== "all") {
      const { data: links } = await supabase
        .from("campaign_contacts")
        .select("contact_id")
        .eq("campaign_id", campaignFilter)
        .limit(5000);
      const ids = (links || []).map((l) => l.contact_id);
      if (ids.length === 0) {
        setContacts([]); setTotalCount(0); setLoading(false); return;
      }
      query = query.in("id", ids);
      countQuery = countQuery.in("id", ids);
    }

    const [{ data }, { count }] = await Promise.all([query, countQuery]);
    setContacts(data || []);
    setTotalCount(count ?? 0);

    // Fetch ops data for visible page
    const visibleIds = (data || []).map((c) => c.id);
    if (visibleIds.length > 0) {
      const [ccRes, cbRes, agRes] = await Promise.all([
        supabase.from("campaign_contacts")
          .select("contact_id, attempts, last_called_at")
          .in("contact_id", visibleIds),
        supabase.from("callbacks")
          .select("contact_id, callback_at")
          .in("contact_id", visibleIds)
          .eq("status", "pending")
          .order("callback_at", { ascending: true }),
        supabase.from("profiles")
          .select("user_id, display_name")
          .in("user_id", (data || []).map((c) => c.locked_to_agent_id).filter(Boolean) as string[]),
      ]);

      const ops: Record<string, { attempts: number; last_called_at: string | null; next_callback_at: string | null }> = {};
      for (const row of ccRes.data || []) {
        const existing = ops[row.contact_id];
        ops[row.contact_id] = {
          attempts: Math.max(existing?.attempts ?? 0, row.attempts ?? 0),
          last_called_at: !existing?.last_called_at || (row.last_called_at && row.last_called_at > existing.last_called_at)
            ? row.last_called_at : existing.last_called_at,
          next_callback_at: existing?.next_callback_at ?? null,
        };
      }
      for (const cb of cbRes.data || []) {
        if (!ops[cb.contact_id]) ops[cb.contact_id] = { attempts: 0, last_called_at: null, next_callback_at: cb.callback_at };
        else if (!ops[cb.contact_id].next_callback_at) ops[cb.contact_id].next_callback_at = cb.callback_at;
      }
      setOpsData(ops);

      const agentMap: Record<string, string> = {};
      for (const a of agRes.data || []) agentMap[a.user_id] = a.display_name || "Agent";
      setAgents((prev) => ({ ...prev, ...agentMap }));
    } else {
      setOpsData({});
    }
    setLoading(false);
  }, [
    search, page, statusFilter, campaignFilter, ownershipFilter,
    cityFilter, stateFilter, zipFilter, countyFilter, areaCodeFilter,
    ownerRenterFilter, creditFilter, homeValueFilter, householdIncomeFilter,
    createdFromFilter, createdToFilter, importBatchFilter,
  ]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { setPage(0); }, [
    search, statusFilter, campaignFilter, ownershipFilter,
    cityFilter, stateFilter, zipFilter, countyFilter, areaCodeFilter,
    ownerRenterFilter, creditFilter, homeValueFilter, householdIncomeFilter,
    createdFromFilter, createdToFilter, importBatchFilter,
  ]);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
    supabase.from("lead_imports").select("id, filename").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setImportBatches((data as any) || []));
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
        await supabase.from("call_attempts").update({ contact_id: null }).in("contact_id", batch);
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="dead">Dead</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ownershipFilter} onValueChange={setOwnershipFilter}>
              <SelectTrigger className="w-[140px]"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ownership</SelectItem>
                <SelectItem value="locked">Owned (locked)</SelectItem>
                <SelectItem value="unlocked">Available</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {!isClient && <TableHead className="w-10"><Checkbox checked={contacts.length > 0 && selected.size === contacts.length} onCheckedChange={toggleSelectAll} /></TableHead>}
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last Call</TableHead>
                <TableHead>Next Callback</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">
                  <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No contacts found.</p>
                </TableCell></TableRow>
              ) : (
                contacts.map((c) => {
                  const ops = opsData[c.id];
                  const ownerName = c.locked_to_agent_id ? (agents[c.locked_to_agent_id] || "Locked") : null;
                  return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedContactId(c.id)}>
                    {!isClient && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {c.first_name} {c.last_name}
                      {c.title && <span className="text-muted-foreground text-xs ml-2">{c.title}</span>}
                      {c.tags && c.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.tags.slice(0, 3).map((t: string) => (
                            <Badge key={t} variant="outline" className="text-[10px] py-0 px-1 h-4">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatPhoneDisplay(c.phone_e164 || c.phone_raw || "")}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor(c.lead_status)}>{c.lead_status}</Badge></TableCell>
                    <TableCell className="text-right text-sm font-mono">{ops?.attempts ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ops?.last_called_at ? formatDistanceToNow(new Date(ops.last_called_at), { addSuffix: true }) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ops?.next_callback_at ? new Date(ops.next_callback_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ownerName ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                          <Lock className="w-3 h-3 mr-1" />{ownerName}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );})
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
