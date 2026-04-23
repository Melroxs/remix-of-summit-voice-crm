import { describe, it, expect } from "vitest";
import { normalizePhoneToE164, formatPhoneDisplay } from "@/lib/phone";

describe("normalizePhoneToE164", () => {
  it("accepts a 10-digit US number", () => {
    const r = normalizePhoneToE164("(602) 555-1234");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+16025551234");
  });

  it("accepts a number that already includes the country code", () => {
    const r = normalizePhoneToE164("16025551234");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+16025551234");
  });

  it("accepts E.164 input", () => {
    const r = normalizePhoneToE164("+16025551234");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+16025551234");
  });

  it("rejects too-short input", () => {
    const r = normalizePhoneToE164("555-1234");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/short/i);
  });

  it("rejects too-long input", () => {
    const r = normalizePhoneToE164("1234567890123");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/long/i);
  });
});

describe("formatPhoneDisplay", () => {
  it("formats E.164 to (xxx) xxx-xxxx", () => {
    expect(formatPhoneDisplay("+16025551234")).toBe("(602) 555-1234");
  });

  it("returns the input unchanged when too short", () => {
    expect(formatPhoneDisplay("+1602")).toBe("+1602");
  });
});