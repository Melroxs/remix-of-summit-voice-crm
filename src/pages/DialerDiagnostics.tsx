import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTelnyxRtc } from "@/hooks/use-telnyx-rtc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  return (
    <div className="flex items-start justify-between p-3 rounded bg-muted/30">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
      </div>
      {ok === null ? <Loader2 className="w-4 h-4 animate-spin" /> :
        ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
        <XCircle className="w-5 h-5 text-destructive" />}
    </div>
  );
}

export default function DialerDiagnostics() {
  const { connState, connError } = useTelnyxRtc(true);
  const [mic, setMic] = useState<boolean | null>(null);
  const [hasQueue, setHasQueue] = useState<boolean | null>(null);
  const [hasOutbound, setHasOutbound] = useState<boolean | null>(null);
  const [recentEvents, setRecentEvents] = useState<number | null>(null);
  const [recentRecordings, setRecentRecordings] = useState<number | null>(null);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((s) => { setMic(true); s.getTracks().forEach((t) => t.stop()); })
      .catch(() => setMic(false));

    const today = new Date().toISOString().slice(0, 10);
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { count } = await supabase
        .from("daily_lead_assignments")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", data.user.id)
        .eq("assigned_date", today);
      setHasQueue((count || 0) > 0);
    });

    supabase.from("caller_ids").select("id", { count: "exact", head: true }).eq("is_active", true)
      .then(({ count }) => setHasOutbound((count || 0) > 0));

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    supabase.from("call_events").select("id", { count: "exact", head: true }).gte("occurred_at", since)
      .then(({ count }) => setRecentEvents(count || 0));
    supabase.from("call_recordings").select("id", { count: "exact", head: true }).gte("created_at", since)
      .then(({ count }) => setRecentRecordings(count || 0));
  }, []);

  return (
    <div className="space-y-6 animate-slide-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Dialer Diagnostics</h1>
        <p className="text-muted-foreground text-sm">End-to-end checks for the Telnyx dialer.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">System checks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row ok={connState === "ready"} label="Telnyx WebRTC connected" detail={connError || `state: ${connState}`} />
          <Row ok={mic} label="Microphone permission" detail={mic === false ? "Browser denied microphone access" : undefined} />
          <Row ok={hasOutbound} label="Outbound caller ID configured" detail={hasOutbound === false ? "No active caller IDs in caller_ids table" : undefined} />
          <Row ok={hasQueue} label="Today's queue assigned" detail={hasQueue === false ? "No leads assigned to you today" : undefined} />
          <Row ok={recentEvents !== null && recentEvents > 0} label="Webhook events received (last hour)" detail={`${recentEvents ?? 0} events`} />
          <Row ok={recentRecordings !== null && recentRecordings >= 0} label="Recordings pipeline" detail={`${recentRecordings ?? 0} recordings stored in last hour`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Action</CardTitle></CardHeader>
        <CardContent>
          <Button asChild><a href="/my-queue">Open my calling queue</a></Button>
        </CardContent>
      </Card>
    </div>
  );
}