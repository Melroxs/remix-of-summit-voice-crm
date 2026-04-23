import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Headphones, Mic, PhoneForwarded, Phone, PhoneOff, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface LiveCall {
  id: string;
  agent_id: string;
  agent_name: string;
  contact_name: string;
  campaign_name: string | null;
  campaign_id: string | null;
  started_at: string;
  duration: number;
  telnyx_call_id: string | null;
  provider_used: string | null;
}

interface MonitoringSession {
  session_id: string;
  call_log_id: string;
  mode: string;
}

interface Props {
  campaignId?: string;
}

export default function LiveCallsPanel({ campaignId }: Props) {
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [activeSession, setActiveSession] = useState<MonitoringSession | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // "callLogId:action"
  const [error, setError] = useState<string | null>(null);

  const fetchLiveCalls = useCallback(async () => {
    let query = supabase
      .from("call_attempts")
      .select("id, agent_id, started_at, telnyx_call_id, campaign_id, provider_used, contacts(first_name, last_name), campaigns(name)")
      .is("ended_at", null)
      .not("started_at", "is", null)
      .order("started_at", { ascending: false });

    if (campaignId) query = query.eq("campaign_id", campaignId);

    const { data } = await query;
    const now = Date.now();
    setLiveCalls((data || []).map((c: any) => ({
      id: c.id,
      agent_id: c.agent_id,
      agent_name: "Agent", // Will be enriched below
      contact_name: c.contacts ? `${c.contacts.first_name} ${c.contacts.last_name}` : "Manual Dial",
      campaign_name: c.campaigns?.name || null,
      campaign_id: c.campaign_id,
      started_at: c.started_at,
      duration: Math.round((now - new Date(c.started_at).getTime()) / 1000),
      telnyx_call_id: c.telnyx_call_id,
      provider_used: c.provider_used,
    })));

    // Enrich with agent names
    if (data && data.length > 0) {
      const agentIds = [...new Set(data.map((c: any) => c.agent_id).filter(Boolean))];
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", agentIds);
        
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.display_name || p.email || "Agent"; });
        
        setLiveCalls(prev => prev.map(c => ({
          ...c,
          agent_name: nameMap[c.agent_id] || "Agent",
        })));
      }
    }
  }, [campaignId]);

  useEffect(() => {
    fetchLiveCalls();
    const interval = setInterval(fetchLiveCalls, 5000);
    return () => clearInterval(interval);
  }, [fetchLiveCalls]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("live-calls-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, () => {
        fetchLiveCalls();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLiveCalls]);

  const handleMonitorAction = async (action: "start" | "switch" | "end", call: LiveCall, mode?: string) => {
    const loadingKey = `${call.id}:${action}:${mode || ""}`;
    setActionLoading(loadingKey);
    setError(null);

    try {
      if (action === "start") {
        if (!call.telnyx_call_id && call.provider_used !== "twilio") {
          setError("No active telephony session for this call. The call must be connected through a telephony provider.");
          setActionLoading(null);
          return;
        }

        const { data, error: fnErr } = await supabase.functions.invoke("call-monitor", {
          body: { action: "start", call_log_id: call.id, mode },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) {
          setError(data.error);
          toast.error(data.error);
        } else {
          setActiveSession({
            session_id: data.session_id,
            call_log_id: call.id,
            mode: mode!,
          });
          toast.success(`${mode!.charAt(0).toUpperCase() + mode!.slice(1)} monitoring started`);
        }
      } else if (action === "switch" && activeSession) {
        const { data, error: fnErr } = await supabase.functions.invoke("call-monitor", {
          body: { action: "switch", session_id: activeSession.session_id, mode },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) {
          toast.error(data.error);
        } else {
          setActiveSession(prev => prev ? { ...prev, mode: mode! } : null);
          toast.success(`Switched to ${mode} mode`);
        }
      } else if (action === "end" && activeSession) {
        const { data, error: fnErr } = await supabase.functions.invoke("call-monitor", {
          body: { action: "end", session_id: activeSession.session_id },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) {
          toast.error(data.error);
        } else {
          setActiveSession(null);
          toast.success("Monitoring ended");
        }
      }
    } catch (err) {
      const msg = (err as Error).message || "Monitoring action failed";
      setError(msg);
      toast.error(msg);
    }

    setActionLoading(null);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const isMonitoringCall = (callId: string) => activeSession?.call_log_id === callId;
  const isLoading = (callId: string, action: string, mode?: string) =>
    actionLoading === `${callId}:${action}:${mode || ""}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-400" />
          Live Calls
          {liveCalls.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{liveCalls.length} active</Badge>
          )}
          {activeSession && (
            <Badge className="ml-2 text-xs bg-primary/20 text-primary border-primary/40 gap-1">
              <Headphones className="w-3 h-3" /> Monitoring ({activeSession.mode})
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {liveCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No active calls right now.</p>
        ) : (
          <div className="space-y-2">
            {liveCalls.map(call => {
              const monitoring = isMonitoringCall(call.id);
              const hasProvider = !!call.telnyx_call_id || call.provider_used === "twilio";

              return (
                <div key={call.id} className={`flex flex-col gap-2 p-3 rounded-lg border ${monitoring ? "bg-primary/5 border-primary/30" : "bg-muted/50 border-border/50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${monitoring ? "bg-primary animate-pulse" : "bg-green-500 animate-pulse"}`} />
                      <div>
                        <p className="font-medium text-sm text-foreground">{call.agent_name}</p>
                        <p className="text-xs text-muted-foreground">
                          → {call.contact_name} • {formatDuration(call.duration)}
                          {call.campaign_name && ` • ${call.campaign_name}`}
                          {call.provider_used && (
                            <span className="ml-1 opacity-60">({call.provider_used})</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {!monitoring ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          disabled={!hasProvider || !!actionLoading}
                          onClick={() => handleMonitorAction("start", call, "listen")}
                        >
                          {isLoading(call.id, "start", "listen") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Headphones className="w-3 h-3" />}
                          Listen
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          disabled={!hasProvider || !!actionLoading}
                          onClick={() => handleMonitorAction("start", call, "whisper")}
                        >
                          {isLoading(call.id, "start", "whisper") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                          Whisper
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          disabled={!hasProvider || !!actionLoading}
                          onClick={() => handleMonitorAction("start", call, "barge")}
                        >
                          {isLoading(call.id, "start", "barge") ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneForwarded className="w-3 h-3" />}
                          Barge
                        </Button>
                        {!hasProvider && (
                          <span className="text-xs text-muted-foreground self-center ml-2">No active provider session</span>
                        )}
                      </>
                    ) : (
                      <>
                        {activeSession?.mode !== "listen" && (
                          <Button variant="outline" size="sm" className="text-xs gap-1" disabled={!!actionLoading}
                            onClick={() => handleMonitorAction("switch", call, "listen")}>
                            {isLoading(call.id, "switch", "listen") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Headphones className="w-3 h-3" />}
                            Switch to Listen
                          </Button>
                        )}
                        {activeSession?.mode !== "whisper" && (
                          <Button variant="outline" size="sm" className="text-xs gap-1" disabled={!!actionLoading}
                            onClick={() => handleMonitorAction("switch", call, "whisper")}>
                            {isLoading(call.id, "switch", "whisper") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                            Switch to Whisper
                          </Button>
                        )}
                        {activeSession?.mode !== "barge" && (
                          <Button variant="outline" size="sm" className="text-xs gap-1" disabled={!!actionLoading}
                            onClick={() => handleMonitorAction("switch", call, "barge")}>
                            {isLoading(call.id, "switch", "barge") ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneForwarded className="w-3 h-3" />}
                            Switch to Barge
                          </Button>
                        )}
                        <Button variant="destructive" size="sm" className="text-xs gap-1" disabled={!!actionLoading}
                          onClick={() => handleMonitorAction("end", call)}>
                          {isLoading(call.id, "end", "") ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneOff className="w-3 h-3" />}
                          End Monitoring
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
