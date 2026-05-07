import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { RecordingPlayer, RecordingPlayerData } from "@/components/dialer/RecordingPlayer";

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  phone_e164?: string;
  phone?: string;
  email?: string;
  [key: string]: any;
}

interface DailyAssignment {
  id: string;
  contact_id: string;
  campaign_id: string;
  queue_position: number;
  status: string;
}

interface PastCall {
  id: string;
  started_at: string;
  duration_seconds: number | null;
  status: string;
  direction: string;
  call_dispositions?: { disposition: string; notes: string | null }[];
  call_recordings?: RecordingPlayerData[];
}

const DISPOSITION_OPTIONS = [
  "Interested – Follow Up",
  "Not Interested",
  "Callback Requested",
  "Voicemail Left",
  "No Answer",
  "Wrong Number",
  "Do Not Call",
  "Sale Made",
  "Not Qualified",
];

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted",
  initializing: "bg-yellow-400",
  ready: "bg-green-500",
  ringing: "bg-blue-400 animate-pulse",
  active: "bg-green-600",
  muted: "bg-orange-400",
  on_hold: "bg-purple-400",
  ended: "bg-muted",
  failed: "bg-destructive",
};

function formatDuration(s: number) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function DialerV2() {
  const {
    callStatus,
    connectionStatus,
    initializeTelnyx,
    reconnect,
    makeCall,
    hangUp,
    toggleMute,
    toggleHold,
    isMuted,
    isOnHold,
    error: telnyxError,
  } = useTelnyxWebRTC();

  const [queue, setQueue] = useState<DailyAssignment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dispositionRequired, setDispositionRequired] = useState(false);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackDatetime, setCallbackDatetime] = useState("");
  const [pastCalls, setPastCalls] = useState<PastCall[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [agentFromNumber, setAgentFromNumber] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadQueue = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("daily_lead_assignments")
      .select("id, contact_id, campaign_id, queue_position, status")
      .eq("agent_id", user.id)
      .eq("assigned_date", today)
      .in("status", ["assigned", "new", "no_answer", "voicemail", "callback", "calling"])
      .order("queue_position", { ascending: true });
    if (!error && data) {
      setQueue(data as DailyAssignment[]);
      setQueueLoaded(true);
    }
  }, []);

  const loadLead = useCallback(async (leadId: string) => {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    if (data) setCurrentLead(data as Lead);
  }, []);

  const loadLeadHistory = useCallback(async (leadId: string) => {
    const { data } = await supabase
      .from("call_sessions")
      .select(
        `id, started_at, duration_seconds, status, direction,
         call_dispositions (disposition, notes),
         call_recordings (id, recording_url, download_url, duration_seconds, status, created_at, available_at)`
      )
      .eq("lead_id", leadId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (data) setPastCalls(data as PastCall[]);
  }, []);

  const loadAgentNumber = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("agent_telephony_credentials")
      .select("telnyx_sip_username")
      .eq("agent_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (data?.telnyx_sip_username) setAgentFromNumber(data.telnyx_sip_username);
  }, []);

  useEffect(() => {
    loadQueue();
    loadAgentNumber();
    initializeTelnyx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queueLoaded && queue.length > 0 && !currentLead) {
      loadLead(queue[0].contact_id);
    }
  }, [queueLoaded, queue, currentLead, loadLead]);

  useEffect(() => {
    if (currentLead) loadLeadHistory(currentLead.id);
  }, [currentLead, loadLeadHistory]);

  useEffect(() => {
    if (callStatus === "active") {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStatus]);

  // Disposition gate — only triggered by real Telnyx 'ended' state
  useEffect(() => {
    if (callStatus === "ended" && sessionId) {
      setDispositionRequired(true);
    }
  }, [callStatus, sessionId]);

  const handleCall = async () => {
    const phone = currentLead?.phone_e164 || currentLead?.phone;
    if (!phone) {
      toast({ title: "No phone number for this lead", variant: "destructive" });
      return;
    }
    if (connectionStatus !== "connected") {
      toast({ title: "Telnyx not connected yet", variant: "destructive" });
      return;
    }
    if (!["idle", "ready", "ended"].includes(callStatus)) return;

    const result = await supabase.functions.invoke("dialer-start-session", {
      body: { lead_id: currentLead!.id },
    });
    if (result.error || !result.data?.session_id) {
      toast({
        title: "Failed to start call session",
        description: result.error?.message,
        variant: "destructive",
      });
      return;
    }
    setSessionId(result.data.session_id);
    makeCall(phone, agentFromNumber);
  };

  const handleSaveDisposition = async (advance: boolean) => {
    if (!disposition) {
      toast({ title: "Please select a disposition", variant: "destructive" });
      return;
    }
    if (!sessionId || !currentLead) return;

    const currentAssignment = queue[currentIndex];
    const result = await supabase.functions.invoke("dialer-save-disposition", {
      body: {
        session_id: sessionId,
        lead_id: currentLead.id,
        campaign_id: currentAssignment?.campaign_id,
        disposition,
        notes,
        callback_datetime: callbackDatetime || null,
      },
    });
    if (result.error) {
      toast({ title: "Failed to save disposition", variant: "destructive" });
      return;
    }
    toast({ title: "Disposition saved" });
    setDispositionRequired(false);
    setDisposition("");
    setNotes("");
    setCallbackDatetime("");
    setSessionId(null);
    await loadLeadHistory(currentLead.id);
    if (advance) handleNextLead();
  };

  const handleNextLead = async () => {
    if (dispositionRequired) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      toast({ title: "Queue complete — no more leads today" });
      return;
    }
    setCurrentIndex(nextIndex);
    setCurrentLead(null);
    await loadLead(queue[nextIndex].contact_id);
  };

  const handleReleaseLock = async () => {
    if (!currentLead || !sessionId) return;
    await supabase.functions.invoke("dialer-release-lock", {
      body: { lead_id: currentLead.id, session_id: sessionId },
    });
    setSessionId(null);
    setDispositionRequired(false);
  };

  const isCallActive = ["ringing", "active", "muted", "on_hold"].includes(callStatus);
  const pendingCount = queue.length - currentIndex - 1;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Dialer</h1>
        <p className="text-sm text-muted-foreground">
          Browser-based outbound calling powered by Telnyx WebRTC.
        </p>
      </header>

      <div className="flex items-center gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full text-white ${
            connectionStatus === "connected"
              ? "bg-green-600"
              : connectionStatus === "connecting"
                ? "bg-yellow-500"
                : "bg-destructive"
          }`}
        >
          {connectionStatus}
        </span>
        {telnyxError && <span className="text-destructive ml-2">{telnyxError}</span>}
        {(connectionStatus === "disconnected" || connectionStatus === "error") && (
          <Button size="sm" variant="outline" onClick={reconnect}>
            Reconnect
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Queue: {Math.min(currentIndex + 1, queue.length)} / {queue.length} leads &nbsp;|&nbsp;{" "}
        {Math.max(pendingCount, 0)} remaining
      </div>

      {currentLead && (
        <div className="p-4 rounded-lg border bg-card space-y-1">
          <p className="font-semibold text-lg">
            {currentLead.first_name} {currentLead.last_name}
          </p>
          <p className="text-sm font-mono">
            {currentLead.phone_e164 || currentLead.phone}
          </p>
          {currentLead.email && (
            <p className="text-sm text-muted-foreground">{currentLead.email}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span
          className={`w-3 h-3 rounded-full ${STATUS_COLORS[callStatus] ?? "bg-muted"}`}
        />
        <Badge variant="outline" className="capitalize">
          {callStatus}
        </Badge>
        {callStatus === "active" && (
          <span className="text-sm font-mono text-green-600">
            {formatDuration(callDuration)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isCallActive && (
          <Button
            onClick={handleCall}
            disabled={
              connectionStatus !== "connected" ||
              !(currentLead?.phone_e164 || currentLead?.phone) ||
              dispositionRequired ||
              !["idle", "ready", "ended"].includes(callStatus)
            }
          >
            📞 Call
          </Button>
        )}
        {isCallActive && (
          <>
            <Button onClick={hangUp} variant="destructive">
              📵 Hang Up
            </Button>
            <Button onClick={toggleMute} variant={isMuted ? "destructive" : "outline"}>
              {isMuted ? "🔇 Unmute" : "🎤 Mute"}
            </Button>
            <Button onClick={toggleHold} variant={isOnHold ? "secondary" : "outline"}>
              {isOnHold ? "▶ Resume" : "⏸ Hold"}
            </Button>
          </>
        )}
        {callStatus === "failed" && sessionId && (
          <Button variant="ghost" size="sm" onClick={handleReleaseLock}>
            Release Lock
          </Button>
        )}
      </div>

      {dispositionRequired && (
        <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/20 space-y-3">
          <p className="font-semibold">
            Call ended — save your disposition to unlock the next lead
          </p>
          <Select value={disposition} onValueChange={setDisposition}>
            <SelectTrigger>
              <SelectValue placeholder="Select disposition…" />
            </SelectTrigger>
            <SelectContent>
              {DISPOSITION_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          {disposition === "Callback Requested" && (
            <input
              type="datetime-local"
              className="w-full rounded border px-3 py-2 text-sm bg-background"
              value={callbackDatetime}
              onChange={(e) => setCallbackDatetime(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button onClick={() => handleSaveDisposition(false)} disabled={!disposition}>
              Save Disposition
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSaveDisposition(true)}
              disabled={!disposition}
            >
              Save & Next Lead
            </Button>
          </div>
        </div>
      )}

      {!dispositionRequired && callStatus === "ready" && currentIndex < queue.length - 1 && (
        <Button variant="outline" onClick={handleNextLead}>
          Next Lead →
        </Button>
      )}

      {currentLead && pastCalls.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Past Calls for this Lead</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pastCalls.map((call) => (
              <div
                key={call.id}
                className="p-3 rounded border bg-muted/30 text-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span>{new Date(call.started_at).toLocaleString()}</span>
                  <Badge variant="outline" className="capitalize">
                    {call.status}
                  </Badge>
                </div>
                {call.call_dispositions?.[0] && (
                  <p className="text-muted-foreground">
                    {call.call_dispositions[0].disposition}
                    {call.call_dispositions[0].notes &&
                      ` — ${call.call_dispositions[0].notes}`}
                  </p>
                )}
                {call.call_recordings
                  ?.filter((r) => r.status === "available")
                  .map((rec) => (
                    <RecordingPlayer key={rec.id} recording={rec} />
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}