import { useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Plug, PlugZap, Loader2 } from "lucide-react";

type RegStatus = "idle" | "connecting" | "connected" | "error";

export default function TelnyxTokenTest() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [regStatus, setRegStatus] = useState<RegStatus>("idle");
  const [regError, setRegError] = useState<string | null>(null);
  const [client, setClient] = useState<TelnyxRTC | null>(null);

  const requestToken = async () => {
    setFetching(true);
    setToken(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "telnyx-credential-token",
        { body: {} },
      );
      if (error) throw error;
      if (!data?.token) throw new Error("No token in response");
      setToken(data.token);
      toast({ title: "Token minted", description: "Telnyx JWT received successfully." });
    } catch (err: any) {
      toast({
        title: "Token request failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  const verifyDialer = async () => {
    if (!token) return;
    setRegStatus("connecting");
    setRegError(null);
    try {
      // Disconnect any prior client
      if (client) {
        try { client.disconnect(); } catch { /* ignore */ }
      }
      const c = new TelnyxRTC({ login_token: token });
      c.on("telnyx.ready", () => setRegStatus("connected"));
      c.on("telnyx.error", (err: any) => {
        setRegStatus("error");
        setRegError(err?.message || "Telnyx error");
      });
      c.on("telnyx.socket.close", () => {
        setRegStatus((prev) => (prev === "connected" ? "idle" : prev));
      });
      setClient(c);
      c.connect();
    } catch (err: any) {
      setRegStatus("error");
      setRegError(err?.message || String(err));
    }
  };

  const disconnect = () => {
    if (client) {
      try { client.disconnect(); } catch { /* ignore */ }
    }
    setClient(null);
    setRegStatus("idle");
    setRegError(null);
  };

  const statusColor =
    regStatus === "connected" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    regStatus === "connecting" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
    regStatus === "error" ? "bg-destructive/15 text-destructive border-destructive/30" :
    "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Telnyx Token Test</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Admin-only diagnostic — request a Telnyx WebRTC token and verify it registers in the browser dialer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">1. Request Token</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Calls the <code className="font-mono">telnyx-credential-token</code> edge function which mints a short-lived JWT
            from your configured <code className="font-mono">TELNYX_CREDENTIAL_ID</code>.
          </p>
          <Button onClick={requestToken} disabled={fetching}>
            {fetching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Requesting…</> : "Request Telnyx Token"}
          </Button>
          {token && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Token (truncated)</p>
              <p className="font-mono text-xs break-all text-foreground">
                {token.slice(0, 32)}…{token.slice(-16)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Length: {token.length} chars</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">2. Verify in Browser Dialer</CardTitle>
          </div>
          <Badge variant="outline" className={`text-xs capitalize ${statusColor}`}>{regStatus}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Connects a Telnyx WebRTC client using the token above and waits for the <code className="font-mono">telnyx.ready</code> event.
          </p>
          <div className="flex gap-2">
            <Button onClick={verifyDialer} disabled={!token || regStatus === "connecting"}>
              <Plug className="h-4 w-4 mr-2" />
              {regStatus === "connecting" ? "Connecting…" : "Connect with Token"}
            </Button>
            {(regStatus === "connected" || regStatus === "error") && (
              <Button variant="outline" onClick={disconnect}>Disconnect</Button>
            )}
          </div>
          {regStatus === "connected" && (
            <p className="text-xs text-emerald-400">
              ✅ WebRTC client registered with Telnyx. The token is valid and the browser dialer can place calls.
            </p>
          )}
          {regStatus === "error" && regError && (
            <p className="text-xs text-destructive">❌ {regError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}