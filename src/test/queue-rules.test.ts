import { describe, it, expect } from "vitest";
import {
  TERMINAL_DISPOSITIONS,
  RETRY_DISPOSITIONS,
  classifyDisposition,
  computeNextState,
  mapLeadStatus,
} from "@/lib/queue-rules";

const settings = {
  retry_delay_no_answer: 300,
  retry_delay_voicemail: 600,
  max_attempts: 3,
};

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

describe("classifyDisposition", () => {
  it("flags terminal codes", () => {
    for (const code of TERMINAL_DISPOSITIONS) {
      expect(classifyDisposition(code)).toBe("terminal");
    }
  });

  it("flags retry codes", () => {
    for (const code of RETRY_DISPOSITIONS) {
      expect(classifyDisposition(code)).toBe("retry");
    }
  });

  it("flags callback explicitly", () => {
    expect(classifyDisposition("callback")).toBe("callback");
  });

  it("falls through to contact for unknown codes", () => {
    expect(classifyDisposition("foo")).toBe("contact");
    expect(classifyDisposition("interested")).toBe("contact");
  });
});

describe("computeNextState", () => {
  it("marks terminal dispositions as completed and final", () => {
    const r = computeNextState({ disposition: "dnc", newAttempts: 1, settings, nowMs: NOW });
    expect(r.dial_status).toBe("completed");
    expect(r.isFinal).toBe(true);
    expect(r.next_eligible_at).toBeNull();
  });

  it("schedules a 5-minute retry for no_answer", () => {
    const r = computeNextState({ disposition: "no_answer", newAttempts: 1, settings, nowMs: NOW });
    expect(r.dial_status).toBe("pending");
    expect(r.isFinal).toBe(false);
    expect(new Date(r.next_eligible_at!).getTime()).toBe(NOW + 300_000);
  });

  it("schedules a longer delay for voicemail", () => {
    const r = computeNextState({ disposition: "voicemail", newAttempts: 1, settings, nowMs: NOW });
    expect(new Date(r.next_eligible_at!).getTime()).toBe(NOW + 600_000);
  });

  it("completes a retry once max_attempts is reached", () => {
    const r = computeNextState({ disposition: "no_answer", newAttempts: 3, settings, nowMs: NOW });
    expect(r.dial_status).toBe("completed");
    expect(r.isFinal).toBe(true);
    expect(r.next_eligible_at).toBeNull();
  });

  it("completes when callback is selected", () => {
    const r = computeNextState({ disposition: "callback", newAttempts: 1, settings, nowMs: NOW });
    expect(r.dial_status).toBe("completed");
    expect(r.isFinal).toBe(true);
  });

  it("keeps an unknown disposition pending without a delay", () => {
    const r = computeNextState({ disposition: "interested", newAttempts: 1, settings, nowMs: NOW });
    expect(r.dial_status).toBe("pending");
    expect(r.next_eligible_at).toBeNull();
    expect(r.isFinal).toBe(false);
  });
});

describe("mapLeadStatus", () => {
  it("maps appointments to qualified", () => {
    expect(mapLeadStatus("appointment_booked")).toBe("qualified");
  });
  it("maps DNC / not_interested to dead", () => {
    expect(mapLeadStatus("dnc")).toBe("dead");
    expect(mapLeadStatus("not_interested")).toBe("dead");
    expect(mapLeadStatus("wrong_number")).toBe("dead");
  });
  it("falls through to contacted", () => {
    expect(mapLeadStatus("voicemail")).toBe("contacted");
    expect(mapLeadStatus("anything_else")).toBe("contacted");
  });
});