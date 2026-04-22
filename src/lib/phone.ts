/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX)
 */
export function normalizePhoneToE164(raw: string): { valid: boolean; e164: string; error?: string } {
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return { valid: true, e164: `+1${digits}` };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return { valid: true, e164: `+${digits}` };
  }

  // Already has country code with +
  if (raw.startsWith("+1") && digits.length === 11) {
    return { valid: true, e164: `+${digits}` };
  }

  if (digits.length < 10) {
    return { valid: false, e164: "", error: "Phone number too short" };
  }

  if (digits.length > 11) {
    return { valid: false, e164: "", error: "Phone number too long" };
  }

  return { valid: false, e164: "", error: "Invalid phone number format" };
}

export function formatPhoneDisplay(e164: string): string {
  if (!e164 || e164.length < 12) return e164;
  const digits = e164.replace(/\D/g, "");
  const area = digits.slice(1, 4);
  const prefix = digits.slice(4, 7);
  const line = digits.slice(7, 11);
  return `(${area}) ${prefix}-${line}`;
}
