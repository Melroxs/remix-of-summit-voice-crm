import { useCallback, useEffect, useRef, useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { supabase } from "@/integrations/supabase/client";

export type TelnyxQueueStatus =
  | "idle"
  | "initializing_webrtc"
  | "connecting"
  | "ready"
  | "selecting_number"
  | "dialing"
  | "ringing"
  | "answered"
  | "hangup"
  | "failed"
  | "error";

export type QueueLead = {
  id: string;
  phone_e164?: string | null;
  phone_number?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  [key: string]: unknown;
};

export type ReservedCallerId = {
  number_id: string;
  phone_number: string;
  match_type: string;
};

type Options = {
  telnyxTokenFunctionName?: string;
  reserveCallerIdRpcName?: string;
  releaseCallerIdRpcName?: string;
  readyTimeoutMs?: number;
};

const DEFAULT_TELNYX_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.telnyx.com:3478"] },
  { urls: ["turn:turn.telnyx.com:3478?transport=udp"] },
  { urls: ["turn:turn.telnyx.com:3478?transport=tcp"] },
  { urls: ["turns:turn.telnyx.com:5349?transport=tcp"] },
];

function toE164(value: unknown): string {
  return String(value ?? "").trim();
}

function getLeadPhone(lead: QueueLead | string): string {
  if (typeof lead === "string") return toE164(lead);
  return toE164(lead.phone_e164 ?? lead.phone_number ?? lead.phone);
}

function buildIceServers(tokenPayload: any): RTCIceServer[] {
  if (Array.isArray(tokenPayload?.iceServers)) return tokenPayload.iceServers;
  const turnUsername = tokenPayload?.turn_username ?? tokenPayload?.turnUsername;
  const turnCredential = tokenPayload?.turn_credential ?? tokenPayload?.turnCredential;
  if (turnUsername && turnCredential) {
    return DEFAULT_TELNYX_ICE_SERVERS.map((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      const isTurn = urls.some((u) => String(u).startsWith("turn"));
      return isTurn ? { ...s, username: turnUsername, credential: turnCredential } : s;
    });
  }
  return DEFAULT_TELNYX_ICE_SERVERS;
}

function applyIceServersToConnection(client: any, iceServers: RTCIceServer[]) {
  const candidates = [client, client?.connection, client?.verto?.connection, client?.session?.connection];
  const conn = candidates.find((c) => c && typeof c.addIceServer === "function");
  if (!conn) return;
  for (const s of iceServers) {
    try { conn.addIceServer(s); } catch (e) { console.warn("[Telnyx] addIceServer failed", e); }
  }
}

function normalizeReserved(data: any): ReservedCallerId {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Caller-ID reservation returned no row");
  const phone_number = toE164(row.phone_number);
  const number_id = String(row.number_id ?? row.id ?? "");
  const match_type = String(row.match_type ?? "unknown");
  if (!phone_number) throw new Error("Reservation missing phone_number");
  if (!number_id) throw new Error("Reservation missing number_id");
  return { number_id, phone_number, match_type };
}

export function useTelnyxQueue(options: Options = {}) {
  const {
    telnyxTokenFunctionName = "telnyx-token",
    reserveCallerIdRpcName = "fn_get_and_reserve_caller_id",
    releaseCallerIdRpcName = "fn_release_caller_id",
    readyTimeoutMs = 15000,
  } = options;

  const clientRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const readyRef = useRef(false);
  const readyPromiseRef = useRef<Promise<any> | null>(null);
  const readyResolveRef = useRef<((c: any) => void) | null>(null);
  const readyRejectRef = useRef<((e: Error) => void) | null>(null);

  const [status, setStatus] = useState<TelnyxQueueStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null);
  const [reservedCallerId, setReservedCallerId] = useState<ReservedCallerId | null>(null);
  const [activeCall, setActiveCall] = useState<unknown | null>(null);

  const isReady = status === "ready" && readyRef.current;
  const isCalling = ["selecting_number", "dialing", "ringing", "answered"].includes(status);

  const resetError = useCallback(() => setError(null), []);

  const initializeTelnyx = useCallback(async (): Promise<any> => {
    if (clientRef.current && readyRef.current) return clientRef.current;
    if (readyPromiseRef.current) return readyPromiseRef.current;

    setError(null);
    setStatus("initializing_webrtc");

    readyPromiseRef.current = new Promise<any>(async (resolve, reject) => {
      readyResolveRef.current = resolve;
      readyRejectRef.current = reject;

      const timeout = window.setTimeout(() => {
        const err = new Error("Timed out waiting for Telnyx WebRTC to become ready.");
        readyRef.current = false;
        readyPromiseRef.current = null;
        readyResolveRef.current = null;
        readyRejectRef.current = null;
        setStatus("error");
        setError(err.message);
        reject(err);
      }, readyTimeoutMs);

      try {
        const { data, error: tokenError } = await supabase.functions.invoke(telnyxTokenFunctionName, { body: {} });
        if (tokenError) throw tokenError;

        const loginToken = data?.login_token ?? data?.loginToken ?? data?.token ?? data?.jwt;
        if (!loginToken) throw new Error(`${telnyxTokenFunctionName} did not return login_token`);

        const iceServers = buildIceServers(data);
        const client = new TelnyxRTC({
          login_token: loginToken,
          iceServers,
          peerConnectionConfig: { iceServers },
        } as any);

        clientRef.current = client;

        client.on("telnyx.ready", () => {
          window.clearTimeout(timeout);
          readyRef.current = true;
          setStatus("ready");
          readyResolveRef.current?.(client);
          readyResolveRef.current = null;
          readyRejectRef.current = null;
        });

        client.on("telnyx.error", (event: any) => {
          const message = event?.message ?? event?.error?.message ?? "Telnyx WebRTC error.";
          console.error("[Telnyx] Error:", event);
          setStatus("error");
          setError(message);
          if (!readyRef.current) {
            window.clearTimeout(timeout);
            readyPromiseRef.current = null;
            readyRejectRef.current?.(new Error(message));
            readyResolveRef.current = null;
            readyRejectRef.current = null;
          }
        });

        client.on("telnyx.notification", (notification: any) => {
          if (notification?.type !== "callUpdate" || !notification?.call) return;
          const callState = notification.call.state ?? notification.call.callState ?? notification.state;
          switch (callState) {
            case "new":
            case "trying":
            case "requesting":
            case "early":
            case "ringing":
              setStatus("ringing"); break;
            case "active":
            case "answered":
              setStatus("answered"); break;
            case "hangup":
            case "destroy":
            case "purge":
              setStatus("hangup");
              activeCallRef.current = null;
              setActiveCall(null);
              window.setTimeout(() => setStatus((p) => (p === "hangup" ? "ready" : p)), 500);
              break;
          }
        });

        applyIceServersToConnection(client, iceServers);
        setStatus("connecting");
        client.connect();
      } catch (err: any) {
        window.clearTimeout(timeout);
        const message = err?.message ?? "Failed to initialize Telnyx WebRTC.";
        readyRef.current = false;
        readyPromiseRef.current = null;
        readyResolveRef.current = null;
        readyRejectRef.current = null;
        setStatus("error");
        setError(message);
        reject(err instanceof Error ? err : new Error(message));
      }
    });

    return readyPromiseRef.current;
  }, [telnyxTokenFunctionName, readyTimeoutMs]);

  const reserveCallerId = useCallback(async (leadPhone: string): Promise<ReservedCallerId> => {
    const clean = toE164(leadPhone);
    if (!clean) throw new Error("Lead phone is required");
    const { data, error: rpcError } = await supabase.rpc(reserveCallerIdRpcName as any, { lead_phone: clean });
    if (rpcError) {
      const m = rpcError.message ?? "";
      if (m.includes("POOL_EXHAUSTED")) throw new Error("All caller-ID numbers are at limit or cooling down.");
      if (m.includes("INVALID_LEAD_PHONE")) throw new Error("Lead phone must be valid E.164.");
      throw rpcError;
    }
    return normalizeReserved(data);
  }, [reserveCallerIdRpcName]);

  const releaseCallerId = useCallback(async (numberId: string) => {
    try { await supabase.rpc(releaseCallerIdRpcName as any, { _number_id: numberId }); }
    catch (e) { console.warn("[Telnyx] release failed", e); }
  }, [releaseCallerIdRpcName]);

  const dialLead = useCallback(async (leadOrPhone: QueueLead | string) => {
    setError(null);
    const leadPhone = getLeadPhone(leadOrPhone);
    if (!leadPhone) {
      const m = "Lead has no valid phone number.";
      setError(m); throw new Error(m);
    }

    let reserved: ReservedCallerId | null = null;
    try {
      const client = await initializeTelnyx();
      if (!client || !readyRef.current) throw new Error("Telnyx WebRTC is not ready.");

      if (typeof leadOrPhone !== "string") setCurrentLead(leadOrPhone);
      setStatus("selecting_number");

      reserved = await reserveCallerId(leadPhone);
      setReservedCallerId(reserved);
      setStatus("dialing");

      const call = client.newCall({
        destinationNumber: leadPhone,
        callerNumber: reserved.phone_number,
        audio: true,
        video: false,
        customHeaders: [
          { name: "X-CRM-Caller-Number-Id", value: reserved.number_id },
          { name: "X-CRM-Caller-Match-Type", value: reserved.match_type },
          { name: "X-CRM-Lead-Id", value: typeof leadOrPhone === "string" ? "" : String(leadOrPhone.id ?? "") },
        ],
      });

      activeCallRef.current = call;
      setActiveCall(call);
    } catch (err: any) {
      console.error("[Dialer] dialLead failed:", err);
      if (reserved) await releaseCallerId(reserved.number_id);
      setStatus("failed");
      setError(err?.message ?? "Call attempt failed.");
      throw err;
    }
  }, [initializeTelnyx, reserveCallerId, releaseCallerId]);

  const hangup = useCallback(() => {
    try { activeCallRef.current?.hangup?.(); }
    catch (e) { console.error("[Dialer] Hangup failed", e); }
    finally {
      activeCallRef.current = null;
      setActiveCall(null);
      setStatus(readyRef.current ? "ready" : "idle");
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        activeCallRef.current?.hangup?.();
        clientRef.current?.disconnect?.();
      } catch (e) { console.warn("[Dialer] cleanup", e); }
      finally {
        activeCallRef.current = null;
        clientRef.current = null;
        readyRef.current = false;
        readyPromiseRef.current = null;
        readyResolveRef.current = null;
        readyRejectRef.current = null;
      }
    };
  }, []);

  return {
    status, error, isReady, isCalling,
    currentLead, reservedCallerId, activeCall,
    initializeTelnyx, reserveCallerId, releaseCallerId,
    dialLead, hangup, resetError,
    setCurrentLead,
  };
}