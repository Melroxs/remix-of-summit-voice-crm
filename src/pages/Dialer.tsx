import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Phone, PhoneOff, Clock, FileText, ChevronRight,
  SkipForward, Loader2, Wifi, WifiOff,
  AlertTriangle, Zap, StopCircle, Timer,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDialerQueue } from "@/hooks/use-dialer-queue";
import { useTelnyx } from "@/hooks/use-telnyx";
import { useAgentStatus, isCallableStatus, getStatusMeta } from "@/hooks/use-agent-status";
import { useCampaignPhones } from "@/hooks/use-campaign-phones";
import { AgentStatusSelector } from "@/components/agents/AgentStatusSelector";
import { formatPhoneDisplay } from "@/lib/phone";
import LeadCard from "@/components/dialer/LeadCard";
import ContactActivityTimeline from "@/components/dialer/ContactActivityTimeline";
import DispositionPanel from "@/components/dialer/DispositionPanel";
import CallbackModal from "@/components/dialer/CallbackModal";
import AppointmentModal from "@/components/dialer/AppointmentModal";
import WrapUpModal from "@/components/dialer/WrapUpModal";
import DialPad from "@/components/dialer/DialPad";
import AudioControls from "@/components/dialer/AudioControls";
import DtmfPad from "@/components/dialer/DtmfPad";
import { RetryCountdown } from "@/components/dialer/RetryCountdown";

type DialModeType = "click_to_call" | "power_dial" | "auto_dial";

export default function Dialer() {
  const { user, profile, refreshProfile } = useAuth();
  const { updateStatus } = useAgentStatus();

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string; dial_mode: string | null }[]>([]);
  const [notes, setNotes] = useState("");
  const [callTimer, setCallTimer] = useState(0);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [pendingDisposition, setPendingDisposition] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [lastCallAttemptId, setLastCallAttemptId] = useState<string | null>(null);
  const [campaignScripts, setCampaignScripts] = useState<{ id: string; title: string; body: string }[]>([]);
  const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);

  const [manualCallActive, setManualCallActive] = useState(false);
  const [manualDialedRaw, setManualDialedRaw] = useState("");
  const [manualDialedE164, setManualDialedE164] = useState("");
  const [manualMatchedContact, setManualMatchedContact] = useState<import("@/hooks/use-dialer-queue").QueueContact | null>(null);

  // Power dial state
  const [powerDialActive, setPowerDialActive] = useState(false);
  const [powerDialPaused, setPowerDialPaused] = useState(false);
  const [lastOutboundNumber, setLastOutboundNumber] = useState<string | null>(null);
  const powerDialRef = useRef(false);

  /** Flag: when true the next currentLead change should auto-dial. */
  const autoDialPendingRef = useRef(false);

  /** Prevent overlapping disposition saves. */
  const disposingRef = useRef(false);

  const agentStatus = profile?.agent_status || "offline";
  const agentReady = isCallableStatus(agentStatus);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const campaignDialMode: DialModeType = (selectedCampaign?.dial_mode as DialModeType) || "click_to_call";
  const isPowerMode = campaignDialMode === "power_dial" || campaignDialMode === "auto_dial";

  const { currentLead, stats, loading, fetchNextLead, disposeLead, skipLead, fetchStats } =
    useDialerQueue(campaignId);

  const { phones, getNextOutboundNumber, markUsed } = useCampaignPhones(campaignId);

  const {
    connectionState, clientReady, callState, muted, held, errorMessage,
    makeCall, hangup, toggleMute, toggleHold, sendDTMF,
  } = useTelnyx({
    onCallStarted: () => {
      toast({ title: "Call connected", description: manualCallActive ? `Speaking with ${formatPhoneDisplay(manualDialedE164)}` : "You are now speaking with the lead." });
      if (user) updateStatus(user.id, "on_call").catch(() => {});
      refreshProfile();
    },
    onCallEnded: (duration) => {
      setCallDuration(duration);
      toast({ title: "Call ended", description: `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s` });

      if (manualCallActive) {
        // Fire-and-forget manual call log
        supabase.auth.getSession().then(({ data: session }) => {
          const userId = session?.session?.user?.id;
          supabase.from("call_attempts").insert({
            agent_id: userId || null,
            campaign_id: campaignId,
            contact_id: manualMatchedContact?.contact_id || null,
            started_at: new Date(Date.now() - duration * 1000).toISOString(),
            ended_at: new Date().toISOString(),
            duration_seconds: duration,
            call_source: "manual",
            manual_dialed_number: manualDialedRaw,
            manual_dialed_e164: manualDialedE164,
            outbound_number_used: lastOutboundNumber,
            provider_used: "telnyx",
            dial_mode_used: "manual",
            notes: notes || null,
          } as any).select("id").single().then(({ data }) => {
            if (data?.id) setLastCallAttemptId(data.id);
          });
        });
        setManualCallActive(false);
        setManualDialedRaw("");
        setManualDialedE164("");
        setManualMatchedContact(null);
      }

      if (user) updateStatus(user.id, "wrap_up").catch(() => {});
      refreshProfile();

      // Open post-call wrap-up modal for queue calls (not manual)
      if (currentLead && duration > 5) {
        setShowWrapUp(true);
      }
    },
    onError: (msg) => {
      toast({ title: "Call error", description: msg, variant: "destructive" });
      setManualCallActive(false);
    },
  });

  const onCall = callState === "active" || callState === "connecting" || callState === "ringing";
  const canMakeCalls = clientReady && agentReady && !onCall;

  // Load campaigns once
  useEffect(() => {
    supabase.from("campaigns").select("id, name, status, dial_mode")
      .in("status", ["active", "draft"]).order("name")
      .then(({ data }) => setCampaigns((data || []) as any[]));
  }, []);

  useEffect(() => {
    if (!campaignId) { setCampaignScripts([]); return; }
    supabase.from("campaign_scripts").select("id, title, body")
      .eq("campaign_id", campaignId).order("sort_order")
      .then(({ data }) => setCampaignScripts((data || []) as any[]));
  }, [campaignId]);

  // Call timer — only ticks while call is active
  useEffect(() => {
    if (callState !== "active") { setCallTimer(0); return; }
    const interval = setInterval(() => setCallTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const activeContactId = currentLead?.contact_id || manualMatchedContact?.contact_id || null;

  const getOutboundCallerId = useCallback(async (): Promise<string | null> => {
    const poolNumber = await getNextOutboundNumber();
    if (poolNumber) {
      markUsed(poolNumber.id);
      setLastOutboundNumber(poolNumber.phone_number);
      return poolNumber.phone_number;
    }
    setLastOutboundNumber(null);
    return null;
  }, [getNextOutboundNumber, markUsed]);

  // -----------------------------------------------------------------------
  // Auto-dial trigger: watches for currentLead changes when power dial is on
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!autoDialPendingRef.current || !currentLead || onCall || !clientReady) return;
    autoDialPendingRef.current = false;

    const phone = currentLead.phone_e164 || currentLead.phone_raw;
    if (!phone) {
      console.log("[Dialer] ⚠️ Lead has no phone — skipping auto-dial");
      return;
    }

    // Small delay for UI to render before dialing
    const timer = setTimeout(async () => {
      if (onCall) return;
      console.log(`[Dialer] ⚡ Auto-dialing ${currentLead.first_name} ${currentLead.last_name}`);
      await getOutboundCallerId();
      makeCall(phone);
    }, 800);
    return () => clearTimeout(timer);
  }, [currentLead, onCall, clientReady, getOutboundCallerId, makeCall]);

  // -----------------------------------------------------------------------
  // Core handlers
  // -----------------------------------------------------------------------
  const handleLoadNext = useCallback(async () => {
    if (!agentReady) { toast({ title: "Not ready", description: "Set your status to Ready.", variant: "destructive" }); return; }
    await fetchNextLead();
    setNotes("");
  }, [fetchNextLead, agentReady]);

  const handleStartCall = useCallback(async () => {
    if (!currentLead) return;
    if (!agentReady) { toast({ title: "Not ready", variant: "destructive" }); return; }
    const phone = currentLead.phone_e164 || currentLead.phone_raw;
    if (!phone) { toast({ title: "No phone number", variant: "destructive" }); return; }
    await getOutboundCallerId();
    makeCall(phone);
  }, [currentLead, agentReady, makeCall, getOutboundCallerId]);

  const handleManualDial = useCallback(async (e164: string, raw: string) => {
    if (!canMakeCalls) return;
    setManualCallActive(true);
    setManualDialedRaw(raw);
    setManualDialedE164(e164);
    try {
      const { data: matched } = await supabase
        .from("contacts").select("*").eq("phone_e164", e164).limit(1).maybeSingle();
      if (matched) {
        setManualMatchedContact({
          id: "", contact_id: matched.id, first_name: matched.first_name, last_name: matched.last_name,
          phone_e164: matched.phone_e164, phone_raw: matched.phone_raw, address: matched.address,
          city: matched.city, state: matched.state, zip_code: matched.zip_code, county: matched.county,
          title: matched.title, owner_renter: matched.owner_renter, home_value: matched.home_value,
          household_income: matched.household_income, credit_rating: matched.credit_rating,
          cool_notes: matched.cool_notes, timezone: matched.timezone, lead_status: matched.lead_status,
          attempts: 0, dial_status: null,
        });
      } else { setManualMatchedContact(null); }
    } catch { setManualMatchedContact(null); }
    await getOutboundCallerId();
    makeCall(e164);
  }, [canMakeCalls, makeCall, getOutboundCallerId]);

  const handleEndCall = () => { hangup(); };

  const triggerAiSummary = useCallback((callLogId: string | null) => {
    if (!callLogId) return;
    supabase.functions.invoke("ai-call-summary", { body: { call_attempt_id: callLogId } }).catch(() => {});
  }, []);

  /**
   * Advance to next lead. If power dial is active, set the auto-dial flag
   * so the useEffect above triggers the call automatically.
   */
  const advanceToNext = useCallback(async () => {
    if (powerDialRef.current && isPowerMode) {
      autoDialPendingRef.current = true;
    }
    await fetchNextLead();
    setNotes("");
  }, [fetchNextLead, isPowerMode]);

  const handleDispose = useCallback(async (code: string) => {
    if (!currentLead || disposingRef.current) return;
    disposingRef.current = true;

    try {
      hangup();
      if (code === "callback") { setPendingDisposition(code); setShowCallbackModal(true); return; }
      if (code === "appointment_booked") { setPendingDisposition(code); setShowAppointmentModal(true); return; }

      const t0 = performance.now();
      const callLogId = await disposeLead(code, notes);
      const elapsed = (performance.now() - t0).toFixed(0);
      console.log(`[Dialer] 📋 Disposition saved in ${elapsed}ms`);

      toast({ title: "Disposition saved", description: `${currentLead.first_name} ${currentLead.last_name} — ${code.replace("_", " ")}` });
      triggerAiSummary(callLogId);

      await advanceToNext();
    } finally {
      disposingRef.current = false;
    }
  }, [currentLead, notes, disposeLead, hangup, advanceToNext, triggerAiSummary]);

  const handleModalSaved = useCallback(async () => {
    if (!currentLead || !pendingDisposition) return;
    setShowCallbackModal(false);
    setShowAppointmentModal(false);
    disposingRef.current = true;
    try {
      const callLogId = await disposeLead(pendingDisposition, notes);
      setPendingDisposition(null);
      toast({ title: "Disposition saved" });
      triggerAiSummary(callLogId);
      await advanceToNext();
    } finally {
      disposingRef.current = false;
    }
  }, [currentLead, pendingDisposition, notes, disposeLead, advanceToNext, triggerAiSummary]);

  const handleModalClose = useCallback(() => {
    setShowCallbackModal(false);
    setShowAppointmentModal(false);
    setPendingDisposition(null);
    disposingRef.current = false;
  }, []);

  const handleSkip = useCallback(async () => {
    hangup();
    await skipLead();
    setNotes("");
    if (powerDialRef.current && isPowerMode) {
      autoDialPendingRef.current = true;
    }
    await fetchNextLead();
  }, [skipLead, fetchNextLead, hangup, isPowerMode]);

  // Power dial controls
  const startPowerDial = useCallback(async () => {
    if (!campaignId || !agentReady || !clientReady) {
      toast({ title: "Cannot start", description: "Ensure campaign is selected, status is Ready, and telephony is connected.", variant: "destructive" });
      return;
    }
    powerDialRef.current = true;
    setPowerDialActive(true);
    setPowerDialPaused(false);
    autoDialPendingRef.current = true;
    toast({ title: "Power Dial started", description: "The system will automatically dial the next lead after each disposition." });
    await fetchNextLead();
    setNotes("");
  }, [campaignId, agentReady, clientReady, fetchNextLead]);

  const stopPowerDial = useCallback(() => {
    powerDialRef.current = false;
    autoDialPendingRef.current = false;
    setPowerDialActive(false);
    setPowerDialPaused(false);
    toast({ title: "Power Dial stopped" });
  }, []);

  // Stop power dial if agent goes non-ready
  useEffect(() => {
    if (powerDialActive && !agentReady && !onCall) {
      setPowerDialPaused(true);
      autoDialPendingRef.current = false;
    }
  }, [agentReady, powerDialActive, onCall]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const statusMeta = getStatusMeta(agentStatus);
  const dialDisabledReason = !clientReady ? "Telnyx not connected" : !agentReady ? "Set status to Ready" : onCall ? "Call in progress" : undefined;

  return (
    <div className="animate-slide-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dialer</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {campaignId ? "Dial through your campaign queue or manually" : "Select a campaign or dial manually"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {campaignId && (
            <Badge variant="outline" className={
              isPowerMode ? "text-amber-400 border-amber-400/30" : "text-muted-foreground"
            }>
              {campaignDialMode === "power_dial" ? "⚡ Power Dial" : campaignDialMode === "auto_dial" ? "⚡ Auto Dial" : "📞 Click to Call"}
            </Badge>
          )}
          {campaignScripts.length > 0 && (
            <Sheet open={scriptDrawerOpen} onOpenChange={setScriptDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />Scripts ({campaignScripts.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader><SheetTitle>Campaign Scripts & Rebuttals</SheetTitle></SheetHeader>
                <div className="space-y-4 mt-4">
                  {campaignScripts.map((s) => (
                    <div key={s.id} className="border border-border rounded-lg p-4">
                      <h3 className="font-medium text-sm text-foreground mb-2">{s.title}</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.body}</p>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
          <AgentStatusSelector compact />
          <Badge variant="outline" className={
            connectionState === "ready" ? "text-green-400 border-green-400/30" :
            connectionState === "error" ? "text-destructive border-destructive/30" :
            connectionState === "connecting" ? "text-amber-400 border-amber-400/30" :
            "text-muted-foreground"
          }>
            {connectionState === "ready" ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            {connectionState === "ready" ? "Connected" : connectionState === "connecting" ? "Connecting…" : connectionState === "error" ? "Error" : "Not Configured"}
          </Badge>
        </div>
      </div>

      {!agentReady && !onCall && (
        <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">
            You are currently <strong>{statusMeta.label}</strong>. Set your status to <strong>Ready</strong> to make calls.
          </AlertDescription>
        </Alert>
      )}
      {powerDialActive && powerDialPaused && (
        <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">
            Power Dial is <strong>paused</strong> — agent status is not Ready. Set status to Ready to resume auto-dialing.
          </AlertDescription>
        </Alert>
      )}
      {connectionState === "not_configured" && (
        <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">Telnyx is not fully configured yet. Please add credentials in Settings.</AlertDescription>
        </Alert>
      )}
      {connectionState === "error" && errorMessage && (
        <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{errorMessage}</AlertDescription></Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Panel */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign</CardTitle></CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-muted-foreground text-sm">No campaigns available</p>
              ) : (
                <Select value={campaignId || "__none__"} onValueChange={(v) => {
                  setCampaignId(v === "__none__" ? null : v);
                  hangup(); setNotes(""); stopPowerDial();
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select campaign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No campaign</SelectItem>
                    {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {campaignId && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Queue Info</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-medium text-foreground">{stats.remaining}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium text-foreground">{stats.completed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Callbacks</span><span className="font-medium text-foreground">{stats.callbacks}</span></div>
                {stats.deferred > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" />Deferred</span>
                    <span className="font-medium text-amber-400">{stats.deferred}</span>
                  </div>
                )}
                {stats.deferred > 0 && stats.nextRetryAt && (
                  <RetryCountdown targetTime={stats.nextRetryAt} onExpired={fetchStats} />
                )}
                {phones.length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Phone Pool</span><span className="font-medium text-foreground">{phones.filter(p => p.is_active).length} active</span></div>
                )}
                {lastOutboundNumber && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Caller ID</span><span className="font-mono text-xs text-foreground">{formatPhoneDisplay(lastOutboundNumber)}</span></div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Power Dial Controls */}
          {campaignId && isPowerMode && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />Power Dial</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!powerDialActive ? (
                  <Button size="sm" className="w-full" onClick={startPowerDial} disabled={!canMakeCalls || stats.remaining === 0}>
                    <Zap className="w-4 h-4 mr-1" /> Start Power Dial
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" className="w-full" onClick={stopPowerDial}>
                    <StopCircle className="w-4 h-4 mr-1" /> Stop Power Dial
                  </Button>
                )}
                {powerDialActive && (
                  <div className="text-xs text-center">
                    <Badge variant="outline" className={powerDialPaused ? "text-amber-400 border-amber-400/30" : "text-green-400 border-green-400/30"}>
                      {powerDialPaused ? "Paused" : "Active"}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <DialPad onDial={handleManualDial} disabled={!canMakeCalls} disabledReason={dialDisabledReason} />
        </div>

        {/* Center Panel */}
        <div className="lg:col-span-5 space-y-4">
          {manualCallActive ? (
            manualMatchedContact ? (
              <div className="space-y-2">
                <Badge variant="outline" className="text-primary border-primary/30">Manual Call — Matched Contact</Badge>
                <LeadCard lead={manualMatchedContact} />
              </div>
            ) : (
              <Card>
                <CardContent className="py-6 text-center space-y-2">
                  <Badge variant="outline" className="text-primary border-primary/30 mb-2">Manual Call</Badge>
                  <p className="text-lg font-mono text-foreground">{formatPhoneDisplay(manualDialedE164)}</p>
                  <p className="text-xs text-muted-foreground">No saved contact found</p>
                </CardContent>
              </Card>
            )
          ) : (
            <LeadCard lead={currentLead} />
          )}

          <Card>
            <CardContent className="py-6">
              <div className="flex items-center justify-center gap-4">
                {!currentLead && !manualCallActive && !onCall ? (
                  <Button size="lg" variant="outline" onClick={handleLoadNext} disabled={!campaignId || loading || !agentReady}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ChevronRight className="w-5 h-5 mr-2" />}Next Lead
                  </Button>
                ) : !onCall ? (
                  <>
                    <Button size="lg" className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600" onClick={handleStartCall} disabled={!canMakeCalls}>
                      <Phone className="w-6 h-6" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSkip}><SkipForward className="w-4 h-4 mr-1" />Skip</Button>
                  </>
                ) : (
                  <Button size="lg" className="rounded-full w-16 h-16 bg-destructive hover:bg-destructive/90" onClick={handleEndCall}>
                    <PhoneOff className="w-6 h-6" />
                  </Button>
                )}
              </div>
              {onCall && (
                <div className="flex items-center justify-center mt-4 gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-mono text-foreground">{formatTime(callTimer)}</span>
                  {held && <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-[10px]">ON HOLD</Badge>}
                  {muted && <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">MUTED</Badge>}
                  {powerDialActive && <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-[10px]">⚡ POWER</Badge>}
                </div>
              )}
            </CardContent>
          </Card>

          <AudioControls muted={muted} held={held} onToggleMute={toggleMute} onToggleHold={toggleHold} callActive={callState === "active"} />
          <DtmfPad onSend={sendDTMF} disabled={callState !== "active"} />
          {!manualCallActive && <DispositionPanel disabled={!currentLead} onDispose={handleDispose} />}
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full h-24 bg-muted/50 border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                placeholder="Add call notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Contact Activity</CardTitle></CardHeader>
            <CardContent>
              <ContactActivityTimeline contactId={activeContactId} />
            </CardContent>
          </Card>
        </div>
      </div>

      {showCallbackModal && currentLead && (
        <CallbackModal contactId={currentLead.contact_id} contactName={`${currentLead.first_name} ${currentLead.last_name}`}
          campaignId={campaignId} onClose={handleModalClose} onSaved={handleModalSaved} />
      )}
      {showAppointmentModal && currentLead && (
        <AppointmentModal contactId={currentLead.contact_id} contactName={`${currentLead.first_name} ${currentLead.last_name}`}
          campaignId={campaignId} callAttemptId={lastCallAttemptId} contactAddress={currentLead.address} contactCity={currentLead.city}
          contactState={currentLead.state} contactZip={currentLead.zip_code}
          onClose={handleModalClose} onSaved={handleModalSaved} />
      )}
      {showWrapUp && currentLead && (
        <WrapUpModal
          open={showWrapUp}
          contactId={currentLead.contact_id}
          contactName={`${currentLead.first_name} ${currentLead.last_name}`}
          contactAddress={currentLead.address}
          contactCity={currentLead.city}
          contactState={currentLead.state}
          contactZip={currentLead.zip_code}
          campaignId={campaignId}
          callAttemptId={lastCallAttemptId}
          callDuration={callDuration}
          initialNotes={notes}
          onClose={() => setShowWrapUp(false)}
          onComplete={({ disposition, needsAppointmentModal, needsCallbackModal }) => {
            setShowWrapUp(false);
            if (needsAppointmentModal) { setPendingDisposition(disposition); setShowAppointmentModal(true); return; }
            if (needsCallbackModal) { setPendingDisposition(disposition); setShowCallbackModal(true); return; }
            handleDispose(disposition);
          }}
        />
      )}
    </div>
  );
}
