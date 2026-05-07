/**
 * Real Telnyx WebRTC client wrapper.
 * Singleton — only one client per browser tab.
 */
import { TelnyxRTC } from "@telnyx/webrtc";
import { fetchTelnyxCredentials } from "./telnyx-config";

export type RtcConnState = "disconnected" | "connecting" | "ready" | "error";
export type CallState = "idle" | "connecting" | "ringing" | "active" | "held" | "ended" | "failed";

export interface ActiveCall {
  id: string;
  state: CallState;
  destination: string;
  startedAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  errorMessage?: string;
  hangup: () => void;
  toggleMute: () => void;
  muted: boolean;
}

type Listener = () => void;

class TelnyxRtcClient {
  private client: any = null;
  private connState: RtcConnState = "disconnected";
  private connError: string | null = null;
  private currentCall: any = null;
  private callState: CallState = "idle";
  private callMuted = false;
  private callDestination = "";
  private callStartedAt: number | null = null;
  private callAnsweredAt: number | null = null;
  private callEndedAt: number | null = null;
  private callError: string | undefined;
  private callId = "";
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  getConnState(): RtcConnState {
    return this.connState;
  }

  getConnError(): string | null {
    return this.connError;
  }

  getCall(): ActiveCall | null {
    if (this.callState === "idle") return null;
    return {
      id: this.callId,
      state: this.callState,
      destination: this.callDestination,
      startedAt: this.callStartedAt,
      answeredAt: this.callAnsweredAt,
      endedAt: this.callEndedAt,
      errorMessage: this.callError,
      muted: this.callMuted,
      hangup: () => this.hangup(),
      toggleMute: () => this.toggleMute(),
    };
  }

  async connect() {
    if (this.connState === "ready" || this.connState === "connecting") return;
    this.connState = "connecting";
    this.connError = null;
    this.emit();

    try {
      const creds = await fetchTelnyxCredentials();
      if (!creds) throw new Error("Could not fetch Telnyx credentials");

      const client = new TelnyxRTC({
        login: creds.login,
        password: creds.password,
      });

      // Audio element for remote stream
      let audioEl = document.getElementById("telnyx-remote-media") as HTMLAudioElement | null;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = "telnyx-remote-media";
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      (client as any).remoteElement = "telnyx-remote-media";

      client.on("telnyx.ready", () => {
        this.connState = "ready";
        this.connError = null;
        this.emit();
      });
      client.on("telnyx.error", (e: any) => {
        this.connState = "error";
        this.connError = e?.error?.message || e?.message || "Telnyx error";
        this.emit();
      });
      client.on("telnyx.socket.close", () => {
        this.connState = "disconnected";
        this.emit();
      });
      client.on("telnyx.notification", (n: any) => this.handleNotification(n));

      client.connect();
      this.client = client;
    } catch (e: any) {
      this.connState = "error";
      this.connError = e?.message || String(e);
      this.emit();
    }
  }

  disconnect() {
    try {
      this.client?.disconnect?.();
    } catch {}
    this.client = null;
    this.connState = "disconnected";
    this.currentCall = null;
    this.callState = "idle";
    this.emit();
  }

  private handleNotification(n: any) {
    if (n?.type !== "callUpdate" || !n.call) return;
    const call = n.call;
    this.currentCall = call;
    this.callId = call.id || this.callId;
    const state: string = call.state;
    switch (state) {
      case "new":
      case "trying":
      case "requesting":
      case "recovering":
        this.callState = "connecting";
        break;
      case "ringing":
      case "early":
        this.callState = "ringing";
        break;
      case "active":
        this.callState = "active";
        if (!this.callAnsweredAt) this.callAnsweredAt = Date.now();
        break;
      case "held":
        this.callState = "held";
        break;
      case "hangup":
      case "destroy":
      case "purge":
        this.callState = "ended";
        if (!this.callEndedAt) this.callEndedAt = Date.now();
        break;
      default:
        break;
    }
    if (call.cause && state === "hangup" && !this.callAnsweredAt) {
      this.callError = call.cause;
      this.callState = "failed";
    }
    this.emit();
  }

  async makeCall(opts: { destinationNumber: string; callerNumber: string }): Promise<string> {
    if (this.connState !== "ready" || !this.client) {
      throw new Error("Telnyx not connected");
    }
    if (this.callState !== "idle" && this.callState !== "ended" && this.callState !== "failed") {
      throw new Error("A call is already in progress");
    }
    // Reset
    this.callState = "connecting";
    this.callDestination = opts.destinationNumber;
    this.callStartedAt = Date.now();
    this.callAnsweredAt = null;
    this.callEndedAt = null;
    this.callError = undefined;
    this.callMuted = false;
    this.emit();

    const call = this.client.newCall({
      destinationNumber: opts.destinationNumber,
      callerNumber: opts.callerNumber,
      audio: true,
      video: false,
    });
    this.currentCall = call;
    this.callId = call.id;
    return call.id;
  }

  hangup() {
    try {
      this.currentCall?.hangup?.();
    } catch {}
  }

  toggleMute() {
    if (!this.currentCall) return;
    try {
      if (this.callMuted) this.currentCall.unmuteAudio?.();
      else this.currentCall.muteAudio?.();
      this.callMuted = !this.callMuted;
      this.emit();
    } catch {}
  }

  resetCall() {
    this.callState = "idle";
    this.currentCall = null;
    this.callId = "";
    this.callDestination = "";
    this.callStartedAt = null;
    this.callAnsweredAt = null;
    this.callEndedAt = null;
    this.callError = undefined;
    this.emit();
  }
}

export const telnyxRtc = new TelnyxRtcClient();