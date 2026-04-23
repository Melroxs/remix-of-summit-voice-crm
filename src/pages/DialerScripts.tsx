import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, Save, Trash2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface Script {
  id: string;
  campaign_id: string;
  title: string;
  body: string;
  sort_order: number | null;
}

interface Campaign {
  id: string;
  name: string;
}

export default function DialerScripts() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [active, setActive] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (campaignId) loadScripts(campaignId);
  }, [campaignId]);

  async function loadCampaigns() {
    const { data } = await supabase.from("campaigns").select("id,name").order("name");
    setCampaigns(data ?? []);
    if (data && data.length && !campaignId) setCampaignId(data[0].id);
    setLoading(false);
  }

  async function loadScripts(cid: string) {
    const { data } = await supabase
      .from("campaign_scripts")
      .select("*")
      .eq("campaign_id", cid)
      .order("sort_order", { ascending: true });
    setScripts(data ?? []);
    setActive(data?.[0] ?? null);
  }

  async function createScript() {
    if (!campaignId) return;
    const { data, error } = await supabase
      .from("campaign_scripts")
      .insert({
        campaign_id: campaignId,
        title: "New Script",
        body: "",
        sort_order: scripts.length,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await loadScripts(campaignId);
    setActive(data as Script);
  }

  async function saveScript() {
    if (!active) return;
    const { error } = await supabase
      .from("campaign_scripts")
      .update({ title: active.title, body: active.body })
      .eq("id", active.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    loadScripts(campaignId);
  }

  async function deleteScript(id: string) {
    const { error } = await supabase.from("campaign_scripts").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    loadScripts(campaignId);
  }

  function copyToClipboard() {
    if (!active?.body) return;
    navigator.clipboard.writeText(active.body);
    toast({ title: "Copied to clipboard" });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dialer Scripts</h1>
          <p className="text-sm text-muted-foreground">
            Manage call openers, rebuttals, and qualifying questions per campaign
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-full md:w-[260px]">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button onClick={createScript} disabled={!campaignId}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No campaigns yet. Create one to add scripts.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <Card className="p-2 h-fit">
            {scripts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">
                No scripts yet
              </div>
            ) : (
              <div className="space-y-1">
                {scripts.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      active?.id === s.id
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.body.slice(0, 40) || "Empty"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {active ? (
            <Card className="p-4 space-y-3">
              <Input
                value={active.title}
                onChange={(e) =>
                  setActive({ ...active, title: e.target.value })
                }
                disabled={!isAdmin}
                className="text-lg font-semibold"
              />
              <Textarea
                value={active.body}
                onChange={(e) =>
                  setActive({ ...active, body: e.target.value })
                }
                disabled={!isAdmin}
                placeholder="Write the script body. Use {{first_name}}, {{city}} as merge tags..."
                className="min-h-[400px] font-mono text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={copyToClipboard}>
                  <Copy className="w-4 h-4 mr-1" /> Copy
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => deleteScript(active.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                    <Button onClick={saveScript}>
                      <Save className="w-4 h-4 mr-1" /> Save
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Select or create a script to edit.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}