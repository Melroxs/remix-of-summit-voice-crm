import { describe, it, expect } from "vitest";
import { planFollowUps } from "@/lib/follow-ups";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

describe("planFollowUps", () => {
  it("always emits send_appointment_details +15m and post_appointment_followup +4h", () => {
    const apptAt = new Date(NOW + 48 * HOUR);
    const tasks = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });

    const send = tasks.find((t) => t.type === "send_appointment_details")!;
    expect(send.due_at.getTime()).toBe(NOW + 15 * 60_000);

    const post = tasks.find((t) => t.type === "post_appointment_followup")!;
    expect(post.due_at.getTime()).toBe(apptAt.getTime() + 4 * HOUR);
  });

  it("schedules 24h reminder when appointment is more than 25h away", () => {
    const apptAt = new Date(NOW + 48 * HOUR);
    const tasks = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });
    const r = tasks.find((t) => t.type === "reminder_24h");
    expect(r).toBeDefined();
    expect(r!.due_at.getTime()).toBe(apptAt.getTime() - 24 * HOUR);
  });

  it("skips 24h reminder for same-day appointments", () => {
    const apptAt = new Date(NOW + 6 * HOUR);
    const tasks = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });
    expect(tasks.find((t) => t.type === "reminder_24h")).toBeUndefined();
  });

  it("schedules confirmation call 2h before when appt is >3h away", () => {
    const apptAt = new Date(NOW + 6 * HOUR);
    const tasks = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });
    const c = tasks.find((t) => t.type === "confirmation_call")!;
    expect(c.due_at.getTime()).toBe(apptAt.getTime() - 2 * HOUR);
  });

  it("skips confirmation call for short-notice appointments", () => {
    const apptAt = new Date(NOW + 90 * 60_000);
    const tasks = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });
    expect(tasks.find((t) => t.type === "confirmation_call")).toBeUndefined();
  });

  it("emits closer_handoff only when a closer is assigned", () => {
    const apptAt = new Date(NOW + 48 * HOUR);
    const without = planFollowUps({ appointmentAt: apptAt, hasCloser: false, nowMs: NOW });
    const withCloser = planFollowUps({ appointmentAt: apptAt, hasCloser: true, nowMs: NOW });
    expect(without.find((t) => t.type === "closer_handoff")).toBeUndefined();
    expect(withCloser.find((t) => t.type === "closer_handoff")).toBeDefined();
  });
});