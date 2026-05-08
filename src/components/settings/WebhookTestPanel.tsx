import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Webhook, RefreshCw, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface WebhookEvent {
  id: string;
  source: string;
  event_type: string | null;
  status: string;
  payload: any;
  error: string | null;
  created_at: string;
}

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/telnyx-webhook`;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "processed") return "default";
  if (s === "error") return "destructive";
  if (s === "ignored") return "outline";
  return "secondary";
};

export default function WebhookTestPanel() {
  const { toast } = useToast();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_events" as any)
      .select("*")
      .eq("source", "telnyx")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      toast({ title: "Failed to load webhook events", description: error.message, variant: "destructive" });
    } else {
      setEvents((data as any) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchEvents();
    const ch = supabase
      .channel("webhook_events_panel")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webhook_events" }, () => fetchEvents())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchEvents]);

  const last = events[0];

  const copyUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Telnyx Webhook Test</CardTitle>
        </div>
        <Button size="sm" variant="outline" onClick={fetchEvents} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Webhook URL — paste this into your Telnyx Voice API Application</p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-foreground break-all flex-1">{WEBHOOK_URL}</code>
            <Button size="icon" variant="ghost" onClick={copyUrl} className="h-7 w-7 shrink-0">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Last received</p>
          {!last ? (
            <p className="text-sm text-muted-foreground">
              No webhook events received yet. Place a test call or check that the webhook URL is set in Telnyx.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusVariant(last.status)} className="capitalize">{last.status}</Badge>
                <span className="font-mono text-xs text-foreground">{last.event_type ?? "unknown"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}
                  {" · "}{new Date(last.created_at).toLocaleString()}
                </span>
              </div>
              {last.error && <p className="text-xs text-destructive">Error: {last.error}</p>}
            </div>
          )}
        </div>

        {events.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recent events (last 10)</p>
            <div className="border border-border rounded-md divide-y divide-border max-h-64 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={statusVariant(e.status)} className="capitalize text-[10px] py-0 px-1.5">{e.status}</Badge>
                    <span className="font-mono truncate text-foreground">{e.event_type ?? "unknown"}</span>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
