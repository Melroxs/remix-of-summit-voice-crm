import { useCallback, useEffect, useRef, useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { supabase } from "@/integrations/supabase/client";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

export function useTelnyxDialer() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [awaitingDisposition, setAwaitingDisposition] = useState(false);

  const clientRef = useRef<TelnyxRTC | null>(null);
  const activeCallRef = useRef<any>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCallIdRef = useRef<string | null>(null);
  const lastCallStartedAtRef = useRef<string | null>(null);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (clientRef.current) return;
    setConnectionStatus("connecting");

    try {
      const { data, error } = await supabase.functions.invoke("telnyx-token");
      if (error || !data?.login || !data?.password) {
        console.error("[useTelnyxDialer] Failed to fetch credentials", error);
        setConnectionStatus("disconnected");
        return;
      }

      const client = new TelnyxRTC({
        login: data.login,
        password: data.password,
      });

      client.on("telnyx.ready", () => {
        setIsRegistered(true);
        setConnectionStatus("connected");
      });

      client.on("telnyx.error", (err: any) => {
        console.error("[useTelnyxDialer] telnyx.error", err);
        setConnectionStatus("disconnected");
      });

      clientRef.current = client;
      client.connect();
    } catch (err) {
      console.error("[useTelnyxDialer] connect() failed", err);
      setConnectionStatus("disconnected");
    }
  }, []);

  const dial = useCallback(
    (phoneNumber: string, callerNumber: string) => {
      const client = clientRef.current;
      if (!client || !isRegistered || activeCallRef.current) return;

      const call: any = client.newCall({
        destinationNumber: phoneNumber,
        callerNumber,
      });

      activeCallRef.current = call;
      setActiveCall(call);

      call.on("call.answered", () => {
        setIsCallActive(true);
        setCallDuration(0);
        stopDurationTimer();
        lastCallStartedAtRef.current = new Date().toISOString();
        lastCallIdRef.current =
          (call as any)?.id ??
          (call as any)?.options?.telnyxCallControlId ??
          null;
        durationTimerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);
      });

      call.on("call.hangup", () => {
        setIsCallActive(false);
        activeCallRef.current = null;
        setActiveCall(null);
        stopDurationTimer();
        setCallDuration(0);
        setAwaitingDisposition(true);
      });
    },
    [isRegistered, stopDurationTimer]
  );

  const hangUp = useCallback(() => {
    if (activeCallRef.current) {
      try {
        activeCallRef.current.hangup();
      } catch (err) {
        console.error("[useTelnyxDialer] hangup() failed", err);
      }
    }
  }, []);

  const submitDisposition = useCallback(
    async (dispositionValue: string) => {
      const callId = lastCallIdRef.current;
      const startedAt = lastCallStartedAtRef.current;
      try {
        if (callId) {
          const { error } = await supabase
            .from("call_attempts")
            .update({ disposition: dispositionValue })
            .eq("telnyx_call_id", callId);
          if (error) console.error("[useTelnyxDialer] disposition by call id failed", error);
        } else if (startedAt) {
          const { error } = await supabase
            .from("call_attempts")
            .update({ disposition: dispositionValue })
            .gte("started_at", startedAt);
          if (error) console.error("[useTelnyxDialer] disposition by timestamp failed", error);
        }
      } catch (err) {
        console.error("[useTelnyxDialer] submitDisposition failed", err);
      } finally {
        lastCallIdRef.current = null;
        lastCallStartedAtRef.current = null;
        setAwaitingDisposition(false);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      stopDurationTimer();
    };
  }, [stopDurationTimer]);

  return {
    isRegistered,
    isCallActive,
    callDuration,
    activeCall,
    connectionStatus,
    awaitingDisposition,
    connect,
    dial,
    hangUp,
    submitDisposition,
  };
}