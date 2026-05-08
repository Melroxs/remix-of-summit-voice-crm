// Telnyx browser-side configuration — gutted.
// All WebRTC credential fetching and SIP connection logic has been removed.
// The exported surface is preserved so existing imports compile.

export async function fetchTelnyxCredentials(): Promise<{ login: string; password: string } | null> {
  return null;
}

export function clearTelnyxCredentialCache() {}

export const TELNYX_NUMBERS = [] as const;

export function getCallerIdNumber(): string {
  return "";
}
