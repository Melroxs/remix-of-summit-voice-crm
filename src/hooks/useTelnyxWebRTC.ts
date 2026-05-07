import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TelnyxRTC } from "@telnyx/webrtc";

export type CallStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "ringing"
  | "active"
  | "muted"
  | "on_hold"
  | "ended"
  | "failed";

interface UseTelnyxWebRTCReturn {
  callStatus: CallStatus;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  currentCallControlId: string | null;
  initializeTelnyx: () => Promise<void>;
  makeCall: (toNumber: string, fromNumber: string) => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  isMuted: boolean;
  isOnHold: boolean;
  error: string | null;
}

export function useTelnyxWebRTC(): UseTelnyxWebRTCReturn {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const callRef = useRef<any>(null);

  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [currentCallControlId, setCurrentCallControlId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeTelnyx = useCallback(async () => {
    if (clientRef.current) return;

    setConnectionStatus("connecting");
    setCallStatus("initializing");
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("telnyx-token");
      if (response.error) throw new Error(response.error.message);

      const { login_token, login, password } = (response.data ?? {}) as {
        login_token?: string;
        login?: string;
        password?: string;
      };

      const clientOpts: any = login_token
        ? { login_token }
        : login && password
          ? { login, password }
          : null;
      if (!clientOpts) throw new Error("Failed to get Telnyx credentials");

      const client = new TelnyxRTC(clientOpts);

      client.on("telnyx.ready", () => {
        setConnectionStatus("connected");
        setCallStatus("ready");
      });

      client.on("telnyx.error", (err: any) => {
        console.error("Telnyx error:", err);
        setConnectionStatus("error");
        setCallStatus("failed");
        setError(err?.message ?? "Telnyx connection error");
      });

      client.on("telnyx.socket.close", () => {
        setConnectionStatus("disconnected");
        setCallStatus("idle");
      });

      client.on("telnyx.notification", (notification: any) => {
        const call = notification.call;
        if (!call) return;

        callRef.current = call;
        const state = call.state;

        if (call.remoteStream) {
          let audio = document.getElementById("telnyx-remote-audio") as HTMLAudioElement | null;
          if (!audio) {
            audio = document.createElement("audio");
            audio.id = "telnyx-remote-audio";
            audio.autoplay = true;
            document.body.appendChild(audio);
          }
          audio.srcObject = call.remoteStream;
        }

        if (call?.id) setCurrentCallControlId(call.id);

        if (state === "ringing" || state === "trying") setCallStatus("ringing");
        else if (state === "active") setCallStatus("active");
        else if (state === "held") {
          setCallStatus("on_hold");
          setIsOnHold(true);
        } else if (state === "hangup" || state === "destroy") {
          setCallStatus("ended");
          setCurrentCallControlId(null);
          callRef.current = null;
          setIsMuted(false);
          setIsOnHold(false);
        } else if (state === "purge") {
          setCallStatus("failed");
          callRef.current = null;
        }
      });

      clientRef.current = client;
      await client.connect();
    } catch (err: any) {
      setConnectionStatus("error");
      setCallStatus("failed");
      setError(err?.message ?? "Failed to initialize Telnyx");
    }
  }, []);

  const makeCall = useCallback((toNumber: string, fromNumber: string) => {
    if (!clientRef.current) {
      setError("Telnyx not initialized");
      return;
    }
    setCallStatus("ringing");
    setIsMuted(false);
    setIsOnHold(false);

    try {
      const call = clientRef.current.newCall({
        destinationNumber: toNumber,
        callerNumber: fromNumber,
      } as any);
      callRef.current = call;

      const checkId = setInterval(() => {
        if (call?.id) {
          setCurrentCallControlId(call.id);
          clearInterval(checkId);
        }
      }, 200);
      // safety: clear after 10s regardless
      setTimeout(() => clearInterval(checkId), 10000);
    } catch (err: any) {
      setCallStatus("failed");
      setError(err?.message ?? "Failed to place call");
    }
  }, []);

  const hangUp = useCallback(() => {
    callRef.current?.hangup();
  }, []);

  const toggleMute = useCallback(() => {
    if (!callRef.current) return;
    if (isMuted) {
      callRef.current.unmuteAudio();
      setIsMuted(false);
      setCallStatus("active");
    } else {
      callRef.current.muteAudio();
      setIsMuted(true);
      setCallStatus("muted");
    }
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    if (!callRef.current) return;
    if (isOnHold) {
      callRef.current.unhold();
      setIsOnHold(false);
      setCallStatus("active");
    } else {
      callRef.current.hold();
      setIsOnHold(true);
      setCallStatus("on_hold");
    }
  }, [isOnHold]);

  useEffect(() => {
    return () => {
      callRef.current?.hangup();
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  return {
    callStatus,
    connectionStatus,
    currentCallControlId,
    initializeTelnyx,
    makeCall,
    hangUp,
    toggleMute,
    toggleHold,
    isMuted,
    isOnHold,
    error,
  };
}