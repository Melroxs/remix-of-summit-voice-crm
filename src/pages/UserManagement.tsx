import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, Shield, Phone as PhoneIcon, Eye, Users, Pencil, Trash2, Power, PowerOff, AlertTriangle, Filter, Wrench } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AgentStatusBadge } from "@/components/agents/AgentStatusSelector";
import DeleteConfirmDialog from "@/components/contacts/DeleteConfirmDialog";
import UnassignedProfilesBanner from "@/components/admin/UnassignedProfilesBanner";

interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  agent_status: string | null;
  deactivated_at: string | null;
  roles: string[];
}

export default function UserManagement() {
  const { session, user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [clientAccounts, setClientAccounts] = useState<{ id: string; name: string }[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string; user_id: string | null }[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [techMode, setTechMode] = useState<"link" | "create">("link");
  const [newTechName, setNewTechName] = useState("");
  const [newTechPhone, setNewTechPhone] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("agent");
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedClientAccount, setSelectedClientAccount] = useState("");
  const [creating, setCreating] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name, is_active, created_at, agent_status, deactivated_at")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    allRoles?.forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push(r.role);
      roleMap.set(r.user_id, existing);
    });

    setUsers(profiles.map((p: any) => ({ ...p, is_active: p.is_active ?? true, roles: roleMap.get(p.user_id) || [] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    supabase.from("campaigns").select("id, name").order("name").then(({ data }) => setCampaigns(data || []));
    supabase.from("client_accounts").select("id, name").order("name").then(({ data }) => setClientAccounts(data || []));
    supabase.from("technicians").select("id, name, user_id").order("name").then(({ data }) => setTechnicians(data || []));
  }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newEmail || !newPassword || !newRole) {
      toast({ title: "Missing fields", description: "Email, password and role are required.", variant: "destructive" }); return;
    }
    if (newRole === "technician" && techMode === "link" && !selectedTechnicianId) {
      toast({ title: "Select technician", description: "Pick an unlinked technician record or create a new one.", variant: "destructive" }); return;
    }
    if (newRole === "technician" && techMode === "create" && !newTechName.trim()) {
      toast({ title: "Technician name required", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      let techIdForCreate = selectedTechnicianId;

      // If creating a new technician inline, insert it first
      if (newRole === "technician" && techMode === "create") {
        const { data: prof } = await supabase.from("profiles").select("company_id").eq("user_id", user!.id).maybeSingle();
        const companyId = prof?.company_id;
        if (!companyId) throw new Error("No company found for current admin");
        const { data: techIns, error: techErr } = await supabase
          .from("technicians")
          .insert({
            name: newTechName.trim(),
            phone: newTechPhone.trim() || null,
            email: newEmail,
            company_id: companyId,
          })
          .select("id")
          .single();
        if (techErr) throw new Error(techErr.message);
        techIdForCreate = techIns!.id;
      }

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newEmail,
          password: newPassword,
          display_name: newName || newEmail.split("@")[0],
          role: newRole,
          campaign_ids: (newRole === "agent" || newRole === "team_leader") ? selectedCampaigns : [],
          client_account_id: newRole === "client" ? selectedClientAccount : null,
          technician_id: newRole === "technician" ? techIdForCreate : null,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "User created", description: `${newEmail} added as ${newRole}` });
      setShowCreate(false); resetForm();
      await fetchUsers();
      // refresh technicians list so the newly linked record shows correctly
      supabase.from("technicians").select("id, name, user_id").order("name").then(({ data }) => setTechnicians(data || []));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    setCreating(true);
    try {
      if (newName !== editingUser.display_name) {
        await supabase.from("profiles").update({ display_name: newName }).eq("user_id", editingUser.user_id);
      }
      toast({ title: "Updated" }); setEditingUser(null); resetForm(); await fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const action = deactivateTarget.is_active ? "deactivate" : "activate";
      const { data, error } = await supabase.functions.invoke("manage-user", { body: { target_user_id: deactivateTarget.user_id, action } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: action === "deactivate" ? "User deactivated" : "User reactivated" });
      setDeactivateTarget(null); await fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setDeactivating(false); }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { target_user_id: deleteTarget.user_id, action: "delete" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "User permanently deleted", description: `${deleteTarget.display_name || deleteTarget.email} has been removed from the system.` });
      setDeleteTarget(null); await fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openEdit = (u: UserRow) => { setEditingUser(u); setNewName(u.display_name || ""); };
  const resetForm = () => {
    setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("agent");
    setSelectedCampaigns([]); setSelectedClientAccount("");
    setSelectedTechnicianId(""); setTechMode("link"); setNewTechName(""); setNewTechPhone("");
    setEditingUser(null);
  };
  const isSelf = (u: UserRow) => u.user_id === user?.id;

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Shield className="w-3 h-3" />;
      case "agent": return <PhoneIcon className="w-3 h-3" />;
      case "team_leader": return <Shield className="w-3 h-3" />;
      case "client": return <Eye className="w-3 h-3" />;
      case "technician": return <Wrench className="w-3 h-3" />;
      default: return null;
    }
  };

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "team_leader": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "agent": return "bg-primary/10 text-primary border-primary/20";
      case "client": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "technician": return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      default: return "";
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "inactive" && u.is_active) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage admins, agents, and clients</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }}><UserPlus className="w-4 h-4 mr-2" />Add User</Button>
      </div>

      <UnassignedProfilesBanner />

      <div className="flex gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="team_leader">Team Leader</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="technician">Technician</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" />All Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agent Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-36">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      {u.display_name || "—"}
                      {isSelf(u) && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="outline" className={`text-xs ${roleBadgeColor(r)}`}>
                            {roleIcon(r)}<span className="ml-1 capitalize">{r}</span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={u.is_active ? "text-green-400 border-green-400/20" : "text-red-400 border-red-400/20"}>
                        {u.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.roles.includes("agent") ? <AgentStatusBadge status={u.agent_status} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(u)} title={u.is_active ? "Deactivate" : "Reactivate"} disabled={isSelf(u) && u.is_active}>
                          {u.is_active ? <PowerOff className="w-4 h-4 text-destructive" /> : <Power className="w-4 h-4 text-green-400" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(u)} title="Delete permanently" disabled={isSelf(u)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deactivate/Activate Dialog */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {deactivateTarget?.is_active ? "Deactivate User" : "Reactivate User"}
            </DialogTitle>
            <DialogDescription>
              {deactivateTarget?.is_active
                ? "This will immediately revoke login access. Historical records will be preserved."
                : "This will restore login access. Campaign reassignment needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="p-3 bg-muted rounded-md space-y-1">
              <p className="text-sm font-medium text-foreground">{deactivateTarget?.display_name || deactivateTarget?.email}</p>
              <p className="text-xs text-muted-foreground">{deactivateTarget?.email}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant={deactivateTarget?.is_active ? "destructive" : "default"} onClick={handleDeactivate} disabled={deactivating || (!!deactivateTarget?.is_active && isSelf(deactivateTarget!))}>
              {deactivating ? "Processing..." : deactivateTarget?.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Permanently Delete User"
        description="This will permanently remove this user from the system, revoke all access, and anonymize their historical records. This cannot be undone."
        itemName={`${deleteTarget?.display_name || deleteTarget?.email || ""}`}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Display Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Doe" /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" /></div>
            <div className="space-y-2"><Label>Password *</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" minLength={6} /></div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="team_leader">Team Leader</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newRole === "agent" || newRole === "team_leader") && campaigns.length > 0 && (
              <div className="space-y-2">
                <Label>Assign to Campaigns</Label>
                <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto border border-border rounded-md p-2">
                  {campaigns.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedCampaigns.includes(c.id)}
                        onChange={(e) => { if (e.target.checked) setSelectedCampaigns([...selectedCampaigns, c.id]); else setSelectedCampaigns(selectedCampaigns.filter(id => id !== c.id)); }}
                        className="rounded border-border" />{c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {newRole === "client" && (
              <div className="space-y-2">
                <Label>Client Account</Label>
                <Select value={selectedClientAccount} onValueChange={setSelectedClientAccount}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{clientAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {newRole === "technician" && (
              <div className="space-y-3 rounded-md border border-border p-3 bg-muted/20">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={techMode === "link" ? "default" : "outline"}
                    onClick={() => setTechMode("link")}
                    className="flex-1"
                  >
                    Link existing
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={techMode === "create" ? "default" : "outline"}
                    onClick={() => setTechMode("create")}
                    className="flex-1"
                  >
                    Create new
                  </Button>
                </div>

                {techMode === "link" ? (
                  <div className="space-y-2">
                    <Label>Technician Record</Label>
                    <Select value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                      <SelectTrigger><SelectValue placeholder="Select unlinked technician" /></SelectTrigger>
                      <SelectContent>
                        {technicians.filter((t) => !t.user_id).length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No unlinked technicians</div>
                        ) : technicians.filter((t) => !t.user_id).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Only technicians not yet linked to a user appear.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label>Technician Name *</Label>
                      <Input value={newTechName} onChange={(e) => setNewTechName(e.target.value)} placeholder="e.g. Mike Johnson" />
                    </div>
                    <div className="space-y-2">
                      <Label>Technician Phone</Label>
                      <Input value={newTechPhone} onChange={(e) => setNewTechPhone(e.target.value)} placeholder="+15551234567" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A new technician record will be created and linked to this login.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) { setEditingUser(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Email</Label><Input value={editingUser?.email || ""} disabled className="bg-muted" /></div>
            <div className="space-y-2"><Label>Display Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex gap-1">{editingUser?.roles.map((r) => (
                <Badge key={r} variant="outline" className={`text-xs ${roleBadgeColor(r)}`}><span className="capitalize">{r}</span></Badge>
              ))}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingUser(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={creating}>{creating ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
