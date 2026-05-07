import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTelnyxRtc } from "@/hooks/use-telnyx-rtc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, PhoneOff, Mic, MicOff, Lock, Play, Pause, Download, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Assignment {
  id: string;
  campaign_id: string;
  contact_id: string;
  queue_position: number;
  status: string;
  contact: { first_name: string; last_name: string; phone_e164: string | null; city: string | null; state: string | null; address: string | null; email: string | null };
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
  { code: "connected", label: "Connected — other" },
];

export default function MyCallingQueue() {
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
  const [tick, setTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Live timer
  useEffect(() => {
    if (call?.state !== "active") return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [call?.state]);

  // Load today's queue
  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("daily_lead_assignments")
      .select("id, campaign_id, contact_id, queue_position, status, contact:contacts(first_name,last_name,phone_e164,city,state,address,email), campaign:campaigns(name)")
      .eq("agent_id", user.id)
      .eq("assigned_date", today)
      .in("status", ["new", "assigned", "calling", "callback", "no_answer", "voicemail"])
      .order("queue_position", { ascending: true });
    const rows = (data || []) as any as Assignment[];
    setAssignments(rows);
    setActiveIdx(0);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  // When call ends, poll briefly for the recording
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

  const startCall = async () => {
    if (!active?.contact.phone_e164) {
      toast({ title: "No phone", description: "Lead has no phone number.", variant: "destructive" }); return;
    }
    if (connState !== "ready") {
      toast({ title: "Not connected", description: "Telnyx is not connected yet.", variant: "destructive" }); return;
    }
    setRecording({ url: null, id: null });
    setDisposition(""); setNotes("");
    setCallAttemptId(null);
    try {
      const callerNumber = (import.meta.env.VITE_TELNYX_DEFAULT_FROM_NUMBER as string) || "";
      const callId = await makeCall({
        destinationNumber: active.contact.phone_e164,
        callerNumber: callerNumber || active.contact.phone_e164,
      });
      // Lock + register on backend
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
    if (!active || !disposition) {
      toast({ title: "Disposition required", description: "Pick a disposition first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("complete_queue_assignment", {
      _assignment_id: active.id,
      _disposition: disposition,
      _notes: notes || null,
      _call_attempt_id: callAttemptId,
    });
    if (error) {
      setSaving(false);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    if (callAttemptId) {
      await supabase.from("call_attempts").update({ disposition, notes: notes || null }).eq("id", callAttemptId);
    }
    setSaving(false);
    setDisposition(""); setNotes(""); setCallAttemptId(null);
    setRecording({ url: null, id: null });
    resetCall();
    // Move to next lead
    const remaining = assignments.filter((_, i) => i !== activeIdx);
    setAssignments(remaining);
    setActiveIdx(0);
    toast({ title: "Saved", description: "Next lead unlocked." });
  };

  const togglePlayback = () => {
    if (!recording.url) return;
    if (!audioRef.current) audioRef.current = new Audio(recording.url);
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); audioRef.current.onended = () => setPlaying(false); }
  };

  const callLocked = !!callAttemptId && call?.state !== "ended" && call?.state !== "failed" && call?.state !== "idle";

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Calling Queue</h1>
          <p className="text-muted-foreground text-sm">{loading ? "Loading…" : `${assignments.length} leads remaining today`}</p>
        </div>
        <Badge variant={connState === "ready" ? "default" : "outline"} className="text-xs">
          Telnyx: {connState}{connError ? ` — ${connError}` : ""}
        </Badge>
      </div>

      {!loading && !active && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No assigned leads for today. Ask your admin to assign a queue.
        </CardContent></Card>
      )}

      {active && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{active.contact.first_name} {active.contact.last_name}</span>
              <Badge variant="outline">#{active.queue_position} of today's queue</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Phone:</span> {active.contact.phone_e164 || "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {active.contact.email || "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {active.contact.address || "—"}, {active.contact.city || ""} {active.contact.state || ""}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Campaign:</span> {active.campaign?.name || "—"}</div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
              <Badge className="text-xs">{call?.state || "idle"}</Badge>
              {call?.state === "active" && <span className="font-mono text-sm">{fmt(elapsed)}</span>}
              {call?.errorMessage && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {call.errorMessage}</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={startCall} disabled={connState !== "ready" || callLocked || !active.contact.phone_e164}>
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
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <Button onClick={saveAndUnlock} disabled={saving || !disposition || callLocked} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & unlock next lead
            </Button>
          </CardContent>
        </Card>
      )}

      {assignments.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Locked — finish current lead first</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {assignments.slice(1, 11).map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                <span className="flex items-center gap-2"><Lock className="w-3 h-3 text-muted-foreground" /> #{a.queue_position} {a.contact.first_name} {a.contact.last_name}</span>
                <span className="text-xs text-muted-foreground">{a.contact.phone_e164}</span>
              </div>
            ))}
            {assignments.length > 11 && <p className="text-xs text-muted-foreground pt-1">+ {assignments.length - 11} more</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}