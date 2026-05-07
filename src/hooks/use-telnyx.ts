import { useState, useCallback, useRef, useEffect } from "react";
import { fetchTelnyxCredentials, getCallerIdNumber } from "@/lib/telnyx-config";

export type TelnyxConnectionState = "not_configured" | "connecting" | "ready" | "error";
export type TelnyxCallState = "idle" | "connecting" | "ringing" | "active" | "ending";

/**
 * Minimum seconds a connected call must stay active before an unsolicited
 * hangup/destroy event is honoured.  This protects against spurious SDK
 * events during RTP negotiation.
 */
const MIN_ACTIVE_SECONDS = 3;

/**
 * If a hangup/destroy arrives within MIN_ACTIVE_SECONDS we defer the
 * decision by this many milliseconds.  After the window, we re-check
 * whether the call is truly gone.
 */
const DESTROY_DEBOUNCE_MS = 4000;

/**
 * After agent requests hangup, if the SDK doesn't confirm within this
 * window we force-finalise.
 */
const FORCE_HANGUP_MS = 3000;

/**
 * How many consecutive socket errors / closes we tolerate before surfacing
 * an "error" connection state to the UI. The Telnyx SDK auto-reconnects
 * internally, so brief blips should stay invisible to the agent.
 */
const SOCKET_ERROR_GRACE = 4;
/** Reset the failure counter once the socket has been stable for this long. */
const SOCKET_STABLE_MS = 10_000;

interface UseTelnyxOptions {
  onCallStarted?: () => void;
  onCallEnded?: (durationSeconds: number) => void;
  onError?: (message: string) => void;
}

export function useTelnyx(options: UseTelnyxOptions = {}) {
  const [connectionState, setConnectionState] = useState<TelnyxConnectionState>("connecting");
  const [callState, setCallState] = useState<TelnyxCallState>("idle");
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const callStartRef = useRef<Date | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** Count of consecutive socket errors / closes since last ready. */
  const socketFailuresRef = useRef(0);
  /** Timer that resets failure counter once socket is stable. */
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** True when the agent (or system) explicitly requested hangup. */
  const agentHungUpRef = useRef(false);
  /** Pending destroy debounce timer. */
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guard against double-finalise. */
  const finalisedRef = useRef(false);

  // Persistent audio element
  useEffect(() => {
    const audio = document.createElement("audio");
    audio.id = "telnyx-remote-media";
    audio.autoplay = true;
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    return () => {
      audio.remove();
      remoteAudioRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Centralised "call really ended" handler — idempotent
  // ---------------------------------------------------------------------------
  const finaliseCallEnd = useCallback((reason: string) => {
    if (finalisedRef.current) return;        // prevent double-fire
    finalisedRef.current = true;

    const duration = callStartRef.current
      ? Math.round((Date.now() - callStartRef.current.getTime()) / 1000)
      : 0;

    console.log(`[Telnyx] ✅ Call finalised – reason: ${reason}, duration: ${duration}s`);

    setCallState("idle");
    setMuted(false);
    setHeld(false);
    callRef.current = null;
    callStartRef.current = null;
    agentHungUpRef.current = false;

    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    optionsRef.current.onCallEnded?.(duration);
  }, []);

  // ---------------------------------------------------------------------------
  // Handle call state updates from the Telnyx SDK
  // ---------------------------------------------------------------------------
  const handleCallUpdate = useCallback((call: any) => {
    const state = call.state;
    console.log("[Telnyx] 📞 Call state:", state);

    switch (state) {
      case "trying":
      case "requesting":
        setCallState("connecting");
        break;

      case "ringing":
      case "early":
        setCallState("ringing");
        break;

      case "active": {
        setCallState("active");
        callStartRef.current = new Date();
        callRef.current = call;

        // Attach remote media
        if (call.remoteStream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = call.remoteStream;
        }

        try {
          call.on?.("stream:remote", (stream: MediaStream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = stream;
              console.log("[Telnyx] 🔊 Late remote stream attached");
            }
          });
        } catch { /* SDK version compat */ }

        console.log("[Telnyx] 🟢 Call active – connected at", callStartRef.current.toISOString());
        optionsRef.current.onCallStarted?.();
        break;
      }

      case "hangup":
      case "destroy": {
        // 1. Agent explicitly hung up → end immediately.
        if (agentHungUpRef.current) {
          finaliseCallEnd("agent_hangup");
          return;
        }

        // 2. Call never connected → genuine failure / no-answer.
        if (!callStartRef.current) {
          console.log("[Telnyx] ⚠️ Call ended before connection");
          finaliseCallEnd("pre_connect_end");
          return;
        }

        // 3. Minimum-duration safety
        const elapsedSeconds = (Date.now() - callStartRef.current.getTime()) / 1000;

        if (elapsedSeconds < MIN_ACTIVE_SECONDS) {
          console.warn(
            `[Telnyx] ⏳ "${state}" at ${elapsedSeconds.toFixed(1)}s – debouncing ${DESTROY_DEBOUNCE_MS}ms`
          );

          if (!destroyTimerRef.current) {
            destroyTimerRef.current = setTimeout(() => {
              destroyTimerRef.current = null;
              if (agentHungUpRef.current) {
                finaliseCallEnd("agent_hangup_debounced");
              } else {
                console.log("[Telnyx] ⏳ Debounce elapsed – confirming call end");
                finaliseCallEnd("remote_hangup_confirmed");
              }
            }, DESTROY_DEBOUNCE_MS);
          }
          return;
        }

        // 4. Genuine remote hangup
        console.log(`[Telnyx] 📴 Remote hangup after ${elapsedSeconds.toFixed(1)}s`);
        finaliseCallEnd("remote_hangup");
        break;
      }

      default:
        console.log(`[Telnyx] ℹ️ Unhandled state: "${state}" – no termination`);
        break;
    }
  }, [finaliseCallEnd]);

  // ---------------------------------------------------------------------------
  // Initialize Telnyx WebRTC client — runs once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let client: any = null;
    let destroyed = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const initClient = async () => {
      try {
        setConnectionState("connecting");
        setErrorMessage(null);

        const credentials = await fetchTelnyxCredentials();
        if (destroyed) return;

        if (!credentials) {
          setConnectionState("not_configured");
          setErrorMessage("Telnyx is not fully configured yet. Please add browser dialer credentials.");
          return;
        }

        let TelnyxRTC: any;
        try {
          const telnyxModule = await import("@telnyx/webrtc");
          TelnyxRTC = telnyxModule.TelnyxRTC;
        } catch {
          setConnectionState("error");
          setErrorMessage("Telnyx WebRTC SDK could not be loaded.");
          return;
        }

        if (destroyed) return;

        client = new TelnyxRTC({
          login: credentials.login,
          password: credentials.password,
          // Keep the SDK alive across transient WS blips
          ringtoneFile: undefined,
          ringbackFile: undefined,
        });

        timeoutId = setTimeout(() => {
          if (!destroyed) {
            console.warn("[Telnyx] Gateway registration timeout after 15s");
            setConnectionState("error");
            setErrorMessage("Telnyx gateway registration timed out. Check your credentials.");
          }
        }, 15000);

        client.on("telnyx.ready", () => {
          if (destroyed) return;
          clearTimeout(timeoutId);
          socketFailuresRef.current = 0;
          if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
          stableTimerRef.current = setTimeout(() => {
            socketFailuresRef.current = 0;
          }, SOCKET_STABLE_MS);
          setConnectionState("ready");
          setErrorMessage(null);
          console.log("[Telnyx] Client ready");
        });

        client.on("telnyx.error", (error: any) => {
          if (destroyed) return;
          clearTimeout(timeoutId);
          const msg = error?.message || "Unknown Telnyx error";
          const code = error?.code;
          const isAuth =
            msg.includes("credentials") || msg.includes("auth") ||
            msg.includes("403") || msg.includes("401");
          const isTransientWs = code === 45002 || msg.includes("WEBSOCKET");

          if (isTransientWs && !isAuth) {
            socketFailuresRef.current += 1;
            console.warn(
              `[Telnyx] Transient socket error (${socketFailuresRef.current}/${SOCKET_ERROR_GRACE}) – SDK will auto-reconnect`,
              error,
            );
            if (socketFailuresRef.current < SOCKET_ERROR_GRACE) return;
          } else {
            console.error("[Telnyx] Error:", error);
          }

          const userMsg = isAuth
            ? "Authentication failed. Check your Telnyx WebRTC credentials."
            : msg.includes("registration")
              ? "Gateway registration failed."
              : `Telnyx error: ${msg}`;

          setConnectionState("error");
          setErrorMessage(userMsg);
          optionsRef.current.onError?.(userMsg);
        });

        client.on("telnyx.socket.error", (error: any) => {
          if (destroyed) return;
          socketFailuresRef.current += 1;
          console.warn(
            `[Telnyx] Socket error (${socketFailuresRef.current}/${SOCKET_ERROR_GRACE})`,
            error,
          );
          if (socketFailuresRef.current >= SOCKET_ERROR_GRACE) {
            setConnectionState("error");
            setErrorMessage("WebSocket connection failed.");
          }
        });

        client.on("telnyx.socket.close", () => {
          if (destroyed) return;
          console.warn("[Telnyx] Socket closed – SDK will reconnect");
          // Don't flip to "error" on a single close; SDK reconnects automatically.
          setConnectionState((prev) => (prev === "ready" ? "connecting" : prev));
          setErrorMessage(null);
        });

        client.on("telnyx.notification", (notification: any) => {
          if (destroyed) return;
          const call = notification.call;
          if (!call) return;
          if (notification.type === "callUpdate") {
            handleCallUpdate(call);
          }
        });

        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (mediaErr) {
          console.warn("[Telnyx] Microphone permission denied:", mediaErr);
          setConnectionState("error");
          setErrorMessage("Microphone access denied.");
          return;
        }

        if (destroyed) return;
        client.connect();
        clientRef.current = client;
      } catch (err: any) {
        if (destroyed) return;
        console.error("[Telnyx] Init error:", err);
        setConnectionState("error");
        setErrorMessage(err?.message || "Failed to initialize Telnyx client");
      }
    };

    initClient();

    return () => {
      destroyed = true;
      clearTimeout(timeoutId);
      if (destroyTimerRef.current) clearTimeout(destroyTimerRef.current);
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      if (client) {
        try { client.disconnect(); } catch {}
        clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientReady = connectionState === "ready";

  const makeCall = useCallback(
    async (phoneNumber: string) => {
      if (!clientRef.current || !clientReady) {
        optionsRef.current.onError?.("Telnyx client not ready.");
        return;
      }
      if (callState !== "idle") {
        optionsRef.current.onError?.("Call already in progress");
        return;
      }
      try {
        // Reset guards for new call
        agentHungUpRef.current = false;
        finalisedRef.current = false;
        if (destroyTimerRef.current) {
          clearTimeout(destroyTimerRef.current);
          destroyTimerRef.current = null;
        }

        setCallState("connecting");
        console.log(`[Telnyx] 📞 Initiating call to ${phoneNumber}`);
        const callerIdNumber = getCallerIdNumber();
        const call = clientRef.current.newCall({
          destinationNumber: phoneNumber,
          callerNumber: callerIdNumber,
          audio: true,
          video: false,
        });
        callRef.current = call;
      } catch (err: any) {
        console.error("[Telnyx] Call error:", err);
        setCallState("idle");
        optionsRef.current.onError?.(err?.message || "Failed to place call");
      }
    },
    [clientReady, callState]
  );

  const hangup = useCallback(() => {
    console.log("[Telnyx] 🛑 Agent requested hangup");
    agentHungUpRef.current = true;

    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }

    if (callRef.current) {
      try { callRef.current.hangup(); } catch (e) {
        console.error("[Telnyx] Hangup error:", e);
      }
    }

    // Force-end safety net
    setTimeout(() => {
      if (agentHungUpRef.current && callState !== "idle" && !finalisedRef.current) {
        console.log("[Telnyx] ⏰ Forcing call end (SDK did not confirm hangup)");
        finaliseCallEnd("agent_hangup_forced");
      }
    }, FORCE_HANGUP_MS);
  }, [callState, finaliseCallEnd]);

  const toggleMute = useCallback(() => {
    if (callRef.current) {
      if (muted) callRef.current.unmuteAudio();
      else callRef.current.muteAudio();
      setMuted(!muted);
    }
  }, [muted]);

  const toggleHold = useCallback(() => {
    if (callRef.current) {
      if (held) callRef.current.unhold();
      else callRef.current.hold();
      setHeld(!held);
    }
  }, [held]);

  const sendDTMF = useCallback((digit: string) => {
    if (callRef.current && callState === "active") {
      try {
        callRef.current.dtmf(digit);
        console.log("[Telnyx] Sent DTMF:", digit);
      } catch (err) {
        console.error("[Telnyx] DTMF error:", err);
      }
    }
  }, [callState]);

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
