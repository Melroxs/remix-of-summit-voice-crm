import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTelnyxRtc } from "@/hooks/use-telnyx-rtc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Phone, PhoneOff, Mic, MicOff, Lock, Play, Pause, Download,
  AlertCircle, Loader2, Wifi, WifiOff, Timer, ChevronRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPhoneDisplay } from "@/lib/phone";

interface Assignment {
  id: string;
  campaign_id: string;
  contact_id: string;
  queue_position: number;
  status: string;
  contact: {
    first_name: string;
    last_name: string;
    phone_e164: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    email: string | null;
  } | null;
  campaign: { name: string } | null;
}

const DISPOSITIONS = [
  { code: "appointment_booked", label: "Appointment booked" },
  { code: "callback", label: "Callback" },
  { code: "no_answer", label: "No answer" },
  { code: "voicemail", label: "Voicemail" },
  { code: "not_interested", label: "Not interested" },
  { code: "wrong_number", label: "Wrong number" },
  { code: "dnc", label: "Do not call" },
  { code: "have_solar", label: "Have solar" },
  { code: "connected", label: "Connected — other" },
];

export default function Dialer() {
  const { user } = useAuth();
  const { connState, connError, call, makeCall, hangup, toggleMute, resetCall } = useTelnyxRtc(true);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [callAttemptId, setCallAttemptId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState<{ url: string | null; id: string | null }>({ url: null, id: null });
  const [, setTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [micOk, setMicOk] = useState<boolean | null>(null);

  // request mic on mount
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((s) => { setMicOk(true); s.getTracks().forEach((t) => t.stop()); })
      .catch(() => setMicOk(false));
  }, []);

  // live timer while active
  useEffect(() => {
    if (call?.state !== "active") return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [call?.state]);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("daily_lead_assignments")
      .select("id, campaign_id, contact_id, queue_position, status, contact:contacts(first_name,last_name,phone_e164,city,state,address,email), campaign:campaigns(name)")
      .eq("agent_id", user.id)
      .eq("assigned_date", today)
      .in("status", ["new", "assigned", "calling", "callback", "no_answer", "voicemail"])
      .order("queue_position", { ascending: true });
    if (error) {
      toast({ title: "Failed to load queue", description: error.message, variant: "destructive" });
    }
    setAssignments(((data || []) as any) as Assignment[]);
    setActiveIdx(0);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  // Poll for recording after call ends
  useEffect(() => {
    if (!callAttemptId || call?.state !== "ended") return;
    let cancelled = false;
    const tryFetch = async (attempt: number) => {
      if (cancelled) return;
      const { data } = await supabase
        .from("call_recordings")
        .select("id")
        .eq("call_attempt_id", callAttemptId)
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        const { data: signed } = await supabase.functions.invoke("get-recording-url", {
          body: { call_recording_id: data.id },
        });
        setRecording({ id: data.id, url: signed?.url ?? null });
      } else if (attempt < 12) {
        setTimeout(() => tryFetch(attempt + 1), 5000);
      }
    };
    tryFetch(0);
    return () => { cancelled = true; };
  }, [callAttemptId, call?.state]);

  const active = assignments[activeIdx];
  const elapsed = call?.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const callLocked = !!callAttemptId && call?.state !== "ended" && call?.state !== "failed" && call?.state !== "idle";
  const canCall =
    connState === "ready" &&
    micOk === true &&
    !!active?.contact?.phone_e164 &&
    !callLocked;

  const callBlockedReason = useMemo(() => {
    if (!active) return "No active lead.";
    if (!active.contact?.phone_e164) return "Lead has no valid phone number.";
    if (connState !== "ready") return `Telnyx not connected (${connState}${connError ? `: ${connError}` : ""}).`;
    if (micOk === false) return "Microphone permission denied. Allow mic access and refresh.";
    if (micOk === null) return "Requesting microphone permission…";
    if (callLocked) return "A call is already in progress.";
    return null;
  }, [active, connState, connError, micOk, callLocked]);

  const startCall = async () => {
    if (!active?.contact?.phone_e164) return;
    setRecording({ url: null, id: null });
    setDisposition(""); setNotes(""); setCallAttemptId(null);
    try {
      const callerNumber = (import.meta.env.VITE_TELNYX_DEFAULT_FROM_NUMBER as string) || "";
      const callId = await makeCall({
        destinationNumber: active.contact.phone_e164,
        callerNumber: callerNumber || active.contact.phone_e164,
      });
      const { data, error } = await supabase.functions.invoke("register-webrtc-call", {
        body: {
          campaign_id: active.campaign_id,
          contact_id: active.contact_id,
          telnyx_call_id: callId,
          to_number: active.contact.phone_e164,
          from_number: callerNumber || null,
          assignment_id: active.id,
        },
      });
      if (error) throw error;
      setCallAttemptId(data?.call_attempt_id || null);
    } catch (e: any) {
      toast({ title: "Call failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const saveAndUnlock = async () => {
    if (!active) return;
    if (!disposition) {
      toast({ title: "Disposition required", description: "Pick a disposition first.", variant: "destructive" });
      return;
    }
    if (!notes.trim()) {
      toast({ title: "Notes required", description: "Enter notes before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("complete_queue_assignment", {
      _assignment_id: active.id,
      _disposition: disposition,
      _notes: notes,
      _call_attempt_id: callAttemptId,
    });
    if (error) {
      setSaving(false);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    if (callAttemptId) {
      await supabase.from("call_attempts").update({ disposition, notes }).eq("id", callAttemptId);
    }
    setSaving(false);
    setDisposition(""); setNotes(""); setCallAttemptId(null);
    setRecording({ url: null, id: null });
    resetCall();
    setAssignments((prev) => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx(0);
    toast({ title: "Saved", description: "Next lead unlocked." });
  };

  const togglePlayback = () => {
    if (!recording.url) return;
    if (!audioRef.current) audioRef.current = new Audio(recording.url);
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); audioRef.current.onended = () => setPlaying(false); }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dialer</h1>
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading queue…" : `${assignments.length} leads remaining today`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connState === "ready" ? "default" : "outline"} className="text-xs">
            {connState === "ready" ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            Telnyx: {connState}
          </Badge>
          <Badge variant={micOk ? "default" : "outline"} className="text-xs">
            {micOk ? <Mic className="w-3 h-3 mr-1" /> : <MicOff className="w-3 h-3 mr-1" />}
            Mic: {micOk === null ? "…" : micOk ? "ok" : "denied"}
          </Badge>
        </div>
      </div>

      {connError && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{connError}</AlertDescription>
        </Alert>
      )}

      {!loading && !active && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No assigned leads for today. Ask your admin to assign a queue from
            <span className="text-foreground"> Admin → Daily Lead Assignment</span>.
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{active.contact?.first_name} {active.contact?.last_name}</span>
              <Badge variant="outline">#{active.queue_position} of today's queue</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{formatPhoneDisplay(active.contact?.phone_e164 || "")}</span></div>
              <div><span className="text-muted-foreground">Email:</span> {active.contact?.email || "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {active.contact?.address || "—"}, {active.contact?.city || ""} {active.contact?.state || ""}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Campaign:</span> {active.campaign?.name || "—"}</div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
              <Badge className="text-xs capitalize">{call?.state || "idle"}</Badge>
              {call?.state === "active" && (
                <span className="font-mono text-sm flex items-center gap-1">
                  <Timer className="w-3 h-3" /> {fmt(elapsed)}
                </span>
              )}
              {call?.errorMessage && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {call.errorMessage}
                </span>
              )}
            </div>

            {callBlockedReason && !callLocked && (
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{callBlockedReason}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={startCall} disabled={!canCall}>
                <Phone className="w-4 h-4 mr-2" /> Call
              </Button>
              <Button variant="destructive" onClick={hangup} disabled={!callLocked}>
                <PhoneOff className="w-4 h-4 mr-2" /> Hang up
              </Button>
              <Button variant="outline" onClick={toggleMute} disabled={call?.state !== "active"}>
                {call?.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {call?.muted ? "Unmute" : "Mute"}
              </Button>
              {recording.url && (
                <>
                  <Button variant="outline" onClick={togglePlayback}>
                    {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {playing ? "Pause" : "Play recording"}
                  </Button>
                  <a href={recording.url} target="_blank" rel="noreferrer">
                    <Button variant="ghost"><Download className="w-4 h-4 mr-2" /> Download</Button>
                  </a>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Disposition (required)</label>
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger><SelectValue placeholder="Choose disposition" /></SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes (required)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <Button
              onClick={saveAndUnlock}
              disabled={saving || !disposition || !notes.trim() || callLocked}
              className="w-full"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & Unlock Next Lead <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {assignments.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Locked — finish current lead first
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {assignments.slice(1, 11).map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                <span className="flex items-center gap-2">
                  <Lock className="w-3 h-3 text-muted-foreground" /> #{a.queue_position} {a.contact?.first_name} {a.contact?.last_name}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(a.contact?.phone_e164 || "")}</span>
              </div>
            ))}
            {assignments.length > 11 && (
              <p className="text-xs text-muted-foreground pt-1">+ {assignments.length - 11} more</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
