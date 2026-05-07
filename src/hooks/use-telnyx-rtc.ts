import { useEffect, useState, useCallback } from "react";
import { telnyxRtc, type RtcConnState, type ActiveCall } from "@/lib/telnyx-rtc";

/**
 * Subscribe to the singleton Telnyx WebRTC client.
 * Auto-connects on mount, auto-disconnects on unmount when no other consumers.
 */
export function useTelnyxRtc(autoConnect = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = telnyxRtc.subscribe(() => setTick((t) => t + 1));
    if (autoConnect) telnyxRtc.connect();
    return () => {
      unsub();
    };
  }, [autoConnect]);

  const connState: RtcConnState = telnyxRtc.getConnState();
  const connError = telnyxRtc.getConnError();
  const call: ActiveCall | null = telnyxRtc.getCall();

  const makeCall = useCallback(
    (opts: { destinationNumber: string; callerNumber: string }) =>
      telnyxRtc.makeCall(opts),
    [],
  );
  const hangup = useCallback(() => telnyxRtc.hangup(), []);
  const toggleMute = useCallback(() => telnyxRtc.toggleMute(), []);
  const resetCall = useCallback(() => telnyxRtc.resetCall(), []);

  return { connState, connError, call, makeCall, hangup, toggleMute, resetCall };
}