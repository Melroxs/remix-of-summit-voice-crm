/**
 * useTelnyx — clean WebRTC client for the rebuilt dialer.
 *
 * - Single TelnyxRTC instance per agent session (token / SIP creds fetched
 *   from the `telnyx-token` edge function).
 * - All call lifecycle transitions are driven by Telnyx SDK events; no
 *   timers terminate calls.
 * - Exposes the same public shape the Dialer UI already consumes:
 *   { connectionState, clientReady, callState, muted, held, errorMessage,
 *     makeCall, hangup, toggleMute, toggleHold, sendDTMF }
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { supabase } from "@/integrations/supabase/client";

export type TelnyxConnectionState = "not_configured" | "connecting" | "ready" | "error";
export type TelnyxCallState =
  | "idle" | "connecting" | "ringing" | "active" | "held" | "ending" | "ended" | "failed";

interface UseTelnyxOptions {
  onCallStarted?: () => void;
  onCallEnded?: (durationSeconds: number) => void;
  onError?: (message: string) => void;
}

interface TokenResponse {
  login_token?: string;
  login?: string;
  password?: string;
  mode?: string;
  error?: string;
}

export function useTelnyx(options: UseTelnyxOptions = {}) {
  const [connectionState, setConnectionState] = useState<TelnyxConnectionState>("connecting");
  const [callState, setCallState] = useState<TelnyxCallState>("idle");
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const optsRef = useRef(options); optsRef.current = options;
  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Persistent <audio> sink
  useEffect(() => {
    const el = document.createElement("audio");
    el.id = "telnyx-remote-media";
    el.autoplay = true;
    document.body.appendChild(el);
    audioElRef.current = el;
    return () => { try { el.remove(); } catch {} audioElRef.current = null; };
  }, []);

  const cleanupCall = useCallback((finalState: TelnyxCallState) => {
    const dur = startedAtRef.current ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)) : 0;
    callRef.current = null;
    startedAtRef.current = null;
    setMuted(false); setHeld(false);
    setCallState(finalState);
    if (dur > 0) optsRef.current.onCallEnded?.(dur);
    // Reset to idle shortly so UI can accept a new call
    setTimeout(() => setCallState((s) => (s === finalState ? "idle" : s)), 100);
  }, []);

  const attachCallListeners = useCallback((call: any) => {
    callRef.current = call;
    // Telnyx call states: new, trying, requesting, recovering, ringing,
    // answering, early, active, held, hangup, destroy, purge
    call.on?.("telnyx.notification", (n: any) => {
      const s = n?.call?.state;
      console.log("[Telnyx] call.state ->", s);
      if (s === "ringing" || s === "trying" || s === "requesting") setCallState("ringing");
      else if (s === "active") {
        if (!startedAtRef.current) startedAtRef.current = Date.now();
        setCallState("active");
        optsRef.current.onCallStarted?.();
      }
      else if (s === "held") setCallState("held");
      else if (s === "hangup" || s === "destroy" || s === "purge") {
        cleanupCall("ended");
      }
    });
  }, [cleanupCall]);

  // ---- Boot the client ----
  useEffect(() => {
    let cancelled = false;
    let client: any = null;

    (async () => {
      try {
        setConnectionState("connecting");
        setErrorMessage(null);

        const { data, error } = await supabase.functions.invoke<TokenResponse>("telnyx-token");
        if (cancelled) return;
        if (error || !data || data.error) {
          setConnectionState("not_configured");
          setErrorMessage(data?.error || error?.message || "Telnyx not configured");
          return;
        }

        const initOpts: any = data.login_token
          ? { login_token: data.login_token }
          : { login: data.login, password: data.password };

        client = new TelnyxRTC(initOpts);
        clientRef.current = client;

        client.remoteElement = "telnyx-remote-media";

        client.on("telnyx.ready", () => {
          if (cancelled) return;
          setConnectionState("ready");
          setErrorMessage(null);
        });
        client.on("telnyx.error", (e: any) => {
          console.warn("[Telnyx] client error", e);
          if (cancelled) return;
          setConnectionState("error");
          setErrorMessage(e?.error || e?.message || "Telnyx connection error");
          optsRef.current.onError?.(e?.error || e?.message || "Telnyx error");
        });
        client.on("telnyx.socket.close", () => {
          if (cancelled) return;
          setConnectionState((cs) => (cs === "ready" ? "connecting" : cs));
        });
        client.on("telnyx.notification", (n: any) => {
          if (n?.type === "callUpdate" && n.call && callRef.current?.id !== n.call.id) {
            // Inbound or new outbound call detected
            attachCallListeners(n.call);
          }
        });

        await client.connect();
      } catch (e: any) {
        console.error("[Telnyx] init error", e);
        if (cancelled) return;
        setConnectionState("error");
        setErrorMessage(e?.message || "Failed to initialize Telnyx");
      }
    })();

    return () => {
      cancelled = true;
      try { client?.disconnect?.(); } catch {}
      clientRef.current = null;
    };
  }, [attachCallListeners]);

  // ---- Public API ----
  const makeCall = useCallback((to: string, from?: string) => {
    const c = clientRef.current;
    if (!c) { setErrorMessage("Telnyx not connected"); return; }
    if (callRef.current) { console.warn("[Telnyx] already on a call"); return; }

    setCallState("connecting");
    startedAtRef.current = null;
    try {
      const call = c.newCall({
        destinationNumber: to,
        callerNumber: from || undefined,
        audio: true,
        video: false,
      });
      attachCallListeners(call);
    } catch (e: any) {
      console.error("[Telnyx] makeCall error", e);
      setCallState("failed");
      setErrorMessage(e?.message || "Failed to start call");
      optsRef.current.onError?.(e?.message || "Failed to start call");
      setTimeout(() => setCallState("idle"), 200);
    }
  }, [attachCallListeners]);

  const hangup = useCallback(() => {
    const call = callRef.current;
    if (!call) { setCallState("idle"); return; }
    setCallState("ending");
    try { call.hangup?.(); } catch (e) { console.warn("hangup err", e); cleanupCall("ended"); }
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    const call = callRef.current; if (!call) return;
    try {
      if (muted) { call.unmuteAudio?.(); setMuted(false); }
      else { call.muteAudio?.(); setMuted(true); }
    } catch (e) { console.warn("mute err", e); }
  }, [muted]);

  const toggleHold = useCallback(() => {
    const call = callRef.current; if (!call) return;
    try {
      if (held) { call.unhold?.(); setHeld(false); }
      else { call.hold?.(); setHeld(true); }
    } catch (e) { console.warn("hold err", e); }
  }, [held]);

  const sendDTMF = useCallback((digit: string) => {
    const call = callRef.current; if (!call) return;
    try { call.dtmf?.(digit); } catch (e) { console.warn("dtmf err", e); }
  }, []);

  const clientReady = connectionState === "ready";

  return {
    connectionState,
    clientReady,
    callState,
    muted,
    held,
    errorMessage,
    makeCall,
    hangup,
    toggleMute,
    toggleHold,
    sendDTMF,
  };
}
