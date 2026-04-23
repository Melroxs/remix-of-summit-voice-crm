import { describe, it, expect } from "vitest";
import {
  contactSchema,
  appointmentSchema,
  callbackSchema,
  qaScoreSchema,
  firstZodMessage,
} from "@/lib/validation";

describe("contactSchema", () => {
  it("requires first and last name", () => {
    const r = contactSchema.safeParse({ first_name: "", last_name: "" });
    expect(r.success).toBe(false);
  });

  it("normalizes phone via the phone field", () => {
    const r = contactSchema.safeParse({
      first_name: "Jane",
      last_name: "Roe",
      phone_raw: "(602) 555-1234",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid phone", () => {
    const r = contactSchema.safeParse({
      first_name: "Jane",
      last_name: "Roe",
      phone_raw: "abc",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodMessage(r.error)).toMatch(/phone/i);
  });

  it("rejects an invalid email", () => {
    const r = contactSchema.safeParse({
      first_name: "A",
      last_name: "B",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });
});

describe("appointmentSchema", () => {
  const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000);
  const future = {
    date: tomorrow.toISOString().split("T")[0],
    time: "10:00",
  };

  it("accepts a valid future on-site appointment", () => {
    const r = appointmentSchema.safeParse({
      ...future,
      timezone: "America/Phoenix",
      appointment_type: "on_site_inspection",
      address: "123 Main St",
      urgency: "medium",
    });
    expect(r.success).toBe(true);
  });

  it("requires an address for on-site inspections", () => {
    const r = appointmentSchema.safeParse({
      ...future,
      timezone: "America/Phoenix",
      appointment_type: "on_site_inspection",
      urgency: "medium",
    });
    expect(r.success).toBe(false);
  });

  it("rejects past dates", () => {
    const r = appointmentSchema.safeParse({
      date: "2000-01-01",
      time: "10:00",
      timezone: "UTC",
      appointment_type: "virtual_consultation",
      urgency: "low",
    });
    expect(r.success).toBe(false);
  });
});

describe("callbackSchema", () => {
  it("accepts a future ISO string", () => {
    const r = callbackSchema.safeParse({
      callback_at: new Date(Date.now() + 60_000 * 30).toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it("rejects past callbacks", () => {
    const r = callbackSchema.safeParse({ callback_at: "2000-01-01T00:00:00Z" });
    expect(r.success).toBe(false);
  });
});

describe("qaScoreSchema", () => {
  it("clamps integer scores 0-10", () => {
    const r = qaScoreSchema.safeParse({
      opening_score: 11,
      qualification_score: 5,
      objection_handling_score: 5,
      closing_score: 5,
      script_adherence_score: 5,
      communication_score: 5,
      compliance_score: 5,
    });
    expect(r.success).toBe(false);
  });
});