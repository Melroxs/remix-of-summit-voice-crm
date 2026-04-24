import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, ListChecks, Settings2, Radio, Shield, BarChart3 } from "lucide-react";
import NumberHealthDashboard from "@/components/settings/NumberHealthDashboard";
import LeadScoringPanel from "@/components/settings/LeadScoringPanel";
import CallerIdPoolDashboard from "@/components/settings/CallerIdPoolDashboard";

interface ClientAccount { id: string; name: string; created_at: string; }
interface DispositionRow { id: string; code: string; label: string; active: boolean; sort_order: number; requires_callback_datetime: boolean; requires_appointment_modal: boolean; }
interface TelephonyProvider { id: string; name: string; provider_type: string; is_active: boolean; default_outbound_number: string | null; public_config: any; created_at: string; }

export default function CrmSettings() {
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ClientAccount | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [dispositions, setDispositions] = useState<DispositionRow[]>([]);
  const [dispositionsLoading, setDispositionsLoading] = useState(true);

  const [providers, setProviders] = useState<TelephonyProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerDialog, setProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<TelephonyProvider | null>(null);
  const [providerForm, setProviderForm] = useState({ name: "", provider_type: "telnyx", default_outbound_number: "", is_active: true });

  const fetchAccounts = async () => {
    const { data } = await supabase.from("client_accounts").select("*").order("created_at", { ascending: false });
    setAccounts(data || []); setAccountsLoading(false);
  };

  const fetchDispositions = async () => {
    const { data } = await supabase.from("dispositions").select("*").order("sort_order", { ascending: true });
    setDispositions((data || []).map((d: any) => ({
      id: d.id, code: d.code, label: d.label, active: d.active ?? true, sort_order: d.sort_order ?? 0,
      requires_callback_datetime: d.requires_callback_datetime ?? false, requires_appointment_modal: d.requires_appointment_modal ?? false,
    }))); setDispositionsLoading(false);
  };

  const fetchProviders = async () => {
    const { data } = await supabase.from("telephony_providers").select("id, name, provider_type, is_active, default_outbound_number, public_config, created_at").order("created_at", { ascending: false });
    setProviders((data || []) as unknown as TelephonyProvider[]); setProvidersLoading(false);
  };

  useEffect(() => { fetchAccounts(); fetchDispositions(); fetchProviders(); }, []);

  const openCreate = () => { setEditingAccount(null); setName(""); setDialogOpen(true); };
  const openEdit = (a: ClientAccount) => { setEditingAccount(a); setName(a.name); setDialogOpen(true); };
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (editingAccount) {
      const { error } = await supabase.from("client_accounts").update({ name: name.trim() }).eq("id", editingAccount.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Updated" });
    } else {
      const { error } = await supabase.from("client_accounts").insert({ name: name.trim() });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Created" });
    }
    setSaving(false); setDialogOpen(false); fetchAccounts();
  };
  const handleDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("client_accounts").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); fetchAccounts(); }
  };

  const openProviderCreate = () => {
    setEditingProvider(null);
    setProviderForm({ name: "", provider_type: "telnyx", default_outbound_number: "", is_active: true });
    setProviderDialog(true);
  };
  const openProviderEdit = (p: TelephonyProvider) => {
    setEditingProvider(p);
    setProviderForm({ name: p.name, provider_type: p.provider_type, default_outbound_number: p.default_outbound_number || "", is_active: p.is_active });
    setProviderDialog(true);
  };
  const handleSaveProvider = async () => {
    if (!providerForm.name.trim()) return;
    setSaving(true);
    const payload: any = {
      name: providerForm.name.trim(),
      provider_type: providerForm.provider_type,
      default_outbound_number: providerForm.default_outbound_number || null,
      is_active: providerForm.is_active,
    };
    if (editingProvider) {
      const { error } = await supabase.from("telephony_providers").update(payload).eq("id", editingProvider.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Provider updated" });
    } else {
      const { error } = await supabase.from("telephony_providers").insert(payload);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Provider created" });
    }
    setSaving(false); setProviderDialog(false); fetchProviders();
  };
  const handleDeleteProvider = async (id: string) => {
    const { error } = await supabase.from("telephony_providers").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Provider deleted" }); fetchProviders(); }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your CRM, telephony, and dialer settings</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="telephony">Telephony</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="dialer">Dialer</TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent value="general" className="space-y-6">
          {/* Client Accounts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Client Accounts</CardTitle></div>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
            </CardHeader>
            <CardContent>
              {accountsLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : accounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No client accounts yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Created</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Dispositions */}
          <Card>
            <CardHeader><div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Dispositions</CardTitle></div></CardHeader>
            <CardContent>
              {dispositionsLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : dispositions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No dispositions configured.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Code</TableHead><TableHead>Callback</TableHead><TableHead>Appointment</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dispositions.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.label}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{d.code}</TableCell>
                        <TableCell>{d.requires_callback_datetime ? "✓" : "—"}</TableCell>
                        <TableCell>{d.requires_appointment_modal ? "✓" : "—"}</TableCell>
                        <TableCell><span className={d.active ? "text-green-400" : "text-muted-foreground"}>{d.active ? "Active" : "Inactive"}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TELEPHONY TAB */}
        <TabsContent value="telephony" className="space-y-6">
          {/* Telephony Providers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Telephony Providers</CardTitle></div>
              <Button size="sm" onClick={openProviderCreate}><Plus className="h-4 w-4 mr-1" />Add Provider</Button>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs mb-3">
                Configure telephony providers for your campaigns. Each campaign can use a different provider with its own number pool.
                Provider credentials are managed securely via backend secrets — never exposed to the browser.
              </p>
              {providersLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : providers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No telephony providers configured.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Default Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{p.provider_type}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{p.default_outbound_number || "—"}</TableCell>
                        <TableCell><span className={p.is_active ? "text-green-400" : "text-muted-foreground"}>{p.is_active ? "Active" : "Inactive"}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openProviderEdit(p)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteProvider(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Telnyx Config Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Telnyx Configuration</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Telnyx WebRTC credentials and API keys are stored as backend secrets and fetched at runtime.
                They are never exposed to the browser.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-muted-foreground text-xs">WebRTC Login</Label><p className="font-mono text-foreground">••••••••••</p></div>
                <div><Label className="text-muted-foreground text-xs">WebRTC Password</Label><p className="font-mono text-foreground">••••••••••</p></div>
                <div><Label className="text-muted-foreground text-xs">API Key</Label><p className="font-mono text-foreground">••••••••••</p></div>
                <div><Label className="text-muted-foreground text-xs">Voice Profile ID</Label><p className="font-mono text-foreground">••••••••••</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Twilio Config Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Twilio Configuration</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Twilio is available as a campaign-level provider. Configure credentials via backend secrets.
                Twilio WebRTC calling requires a TwiML app and token endpoint to be set up.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-muted-foreground text-xs">Account SID</Label><p className="font-mono text-foreground">Not configured</p></div>
                <div><Label className="text-muted-foreground text-xs">Auth Token</Label><p className="font-mono text-foreground">Not configured</p></div>
                <div><Label className="text-muted-foreground text-xs">TwiML App SID</Label><p className="font-mono text-foreground">Not configured</p></div>
                <div><Label className="text-muted-foreground text-xs">Status</Label><p className="text-amber-400 text-xs">Requires setup</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTELLIGENCE TAB */}
        <TabsContent value="intelligence" className="space-y-6">
          <CallerIdPoolDashboard />
          <NumberHealthDashboard />
          <LeadScoringPanel />
        </TabsContent>

        {/* DIALER TAB */}
        <TabsContent value="dialer" className="space-y-6">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Dialer Defaults</CardTitle></div></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><Label className="text-muted-foreground text-xs">Default Wrap-Up Time</Label><p className="text-foreground">15 seconds</p></div>
                <div><Label className="text-muted-foreground text-xs">Max Attempts per Lead</Label><p className="text-foreground">5</p></div>
                <div><Label className="text-muted-foreground text-xs">Retry Delay (No Answer)</Label><p className="text-foreground">5 minutes</p></div>
                <div><Label className="text-muted-foreground text-xs">Retry Delay (Voicemail)</Label><p className="text-foreground">10 minutes</p></div>
                <div><Label className="text-muted-foreground text-xs">Default Queue Strategy</Label><p className="text-foreground">Round Robin</p></div>
                <div><Label className="text-muted-foreground text-xs">Default Dial Mode</Label><p className="text-foreground">Click to Call</p></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Number Rotation Strategies</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-foreground">Round Robin</p>
                  <p className="text-muted-foreground text-xs">Cycles through numbers sequentially. Simple and predictable.</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-foreground">Random</p>
                  <p className="text-muted-foreground text-xs">Selects a random number from the pool each time.</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-foreground">Health-Based</p>
                  <p className="text-muted-foreground text-xs">Prefers healthier numbers. Fatigued and cooling numbers are deprioritized. Best for spam avoidance.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Client Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAccount ? "Edit Client Account" : "Create Client Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Account Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Solar" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Telephony Provider Dialog */}
      <Dialog open={providerDialog} onOpenChange={setProviderDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProvider ? "Edit Provider" : "Add Telephony Provider"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={providerForm.name} onChange={(e) => setProviderForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Telnyx Production" /></div>
            <div>
              <Label>Provider Type</Label>
              <Select value={providerForm.provider_type} onValueChange={(v) => setProviderForm(f => ({ ...f, provider_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnyx">Telnyx</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Default Outbound Number</Label><Input value={providerForm.default_outbound_number} onChange={(e) => setProviderForm(f => ({ ...f, default_outbound_number: e.target.value }))} placeholder="+14805551234" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={providerForm.is_active} onCheckedChange={(v) => setProviderForm(f => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveProvider} disabled={saving || !providerForm.name.trim()}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
