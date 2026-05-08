import { useCallback } from "react";

export type TelnyxConnectionState = "not_configured" | "connecting" | "ready" | "error";
export type TelnyxCallState = "idle" | "connecting" | "ringing" | "active" | "ending";

interface UseTelnyxOptions {
  onCallStarted?: () => void;
  onCallEnded?: (durationSeconds: number) => void;
  onError?: (message: string) => void;
}

/**
 * Stubbed Telnyx hook — all WebRTC/SIP/WebSocket logic removed.
 * Preserves the original API so consumers render identically and compile,
 * but every action is a no-op.
 */
export function useTelnyx(_options: UseTelnyxOptions = {}) {
  const connectionState = "not_configured" as TelnyxConnectionState;
  const clientReady = false as boolean;
  const callState = "idle" as TelnyxCallState;
  const muted = false as boolean;
  const held = false as boolean;
  const errorMessage = null as string | null;

  const makeCall = useCallback(async (_phoneNumber: string) => {}, []);
  const hangup = useCallback(() => {}, []);
  const toggleMute = useCallback(() => {}, []);
  const toggleHold = useCallback(() => {}, []);
  const sendDTMF = useCallback((_digit: string) => {}, []);

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
