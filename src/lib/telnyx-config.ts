// Telnyx WebRTC browser-side configuration
// Credentials are fetched from the backend edge function at runtime.

import { supabase } from "@/integrations/supabase/client";

let cachedCredentials: { login: string; password: string } | null = null;
let fetchPromise: Promise<{ login: string; password: string } | null> | null = null;

// Fetch WebRTC credentials from the backend
export async function fetchTelnyxCredentials(): Promise<{ login: string; password: string } | null> {
  if (cachedCredentials) return cachedCredentials;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("telnyx-token");
      if (error || !data?.login || !data?.password) {
        console.warn("[Telnyx] Could not fetch credentials:", error || "missing fields");
        return null;
      }
      cachedCredentials = { login: data.login, password: data.password };
      return cachedCredentials;
    } catch (e) {
      console.warn("[Telnyx] Credential fetch failed:", e);
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

// Clear cached credentials (e.g. on logout)
export function clearTelnyxCredentialCache() {
  cachedCredentials = null;
  fetchPromise = null;
}

// --- Call-control config (separate from WebRTC auth) ---

// Available Telnyx phone numbers for outbound caller ID
export const TELNYX_NUMBERS = [
  "+14807766403",
  "+14807766367",
  "+14807766351",
  "+14807766350",
  "+14807766348",
  "+14807766336",
  "+14807766332",
  "+14807766326",
  "+14807766324",
  "+14807766323",
  "+14807766320",
] as const;

// Get a random caller ID number
export function getCallerIdNumber(): string {
  return TELNYX_NUMBERS[Math.floor(Math.random() * TELNYX_NUMBERS.length)];
}
