/**
 * Provider-agnostic telephony service layer.
 * Abstracts Telnyx and Twilio into a unified calling interface.
 */

export interface TelephonyCallOptions {
  destinationNumber: string;
  callerNumber?: string;
}

export interface TelephonyProvider {
  readonly name: string;
  readonly connected: boolean;
  init(): Promise<void>;
  makeCall(options: TelephonyCallOptions): Promise<void>;
  hangup(): void;
  mute(): void;
  unmute(): void;
  hold(): void;
  unhold(): void;
  sendDTMF(digit: string): void;
  destroy(): void;
}

/**
 * Currently, the dialer uses the useTelnyx hook directly.
 * This service layer provides a structured interface for future
 * multi-provider support. The Twilio implementation requires
 * a TwiML app + token generation endpoint to be configured.
 *
 * For now, the dialer selects provider metadata per campaign
 * but routes all calls through the Telnyx WebRTC client.
 * When Twilio is fully configured, the TwilioProvider can be
 * swapped in seamlessly.
 */

export function getProviderLabel(providerType: string): string {
  switch (providerType) {
    case "telnyx": return "Telnyx";
    case "twilio": return "Twilio";
    default: return providerType;
  }
}

export function isProviderSupported(providerType: string): boolean {
  // Telnyx is fully supported; Twilio requires additional configuration
  return providerType === "telnyx";
}

export function getProviderRequirements(providerType: string): string[] {
  if (providerType === "telnyx") {
    return ["VITE_TELNYX_LOGIN", "VITE_TELNYX_PASSWORD", "TELNYX_API_KEY"];
  }
  if (providerType === "twilio") {
    return [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_TWIML_APP_SID",
      "TWILIO_API_KEY",
      "TWILIO_API_SECRET",
    ];
  }
  return [];
}
