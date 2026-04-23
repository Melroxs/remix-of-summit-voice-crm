import { z } from "zod";
import { normalizePhoneToE164 } from "./phone";

/* ------------------------------------------------------------------ */
/* Reusable building blocks                                            */
/* ------------------------------------------------------------------ */

/** Trimmed required string with sane upper bound. */
const reqText = (max = 120, label = "Field") =>
  z.string().trim().min(1, { message: `${label} is required` }).max(max, {
    message: `${label} must be ${max} characters or less`,
  });

const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, { message: `Must be ${max} characters or less` })
    .optional()
    .or(z.literal("").transform(() => undefined));

/** Phone field — empty allowed; if provided must normalize to E.164. */
export const phoneField = z
  .string()
  .trim()
  .max(40, { message: "Phone too long" })
  .optional()
  .or(z.literal(""))
  .superRefine((value, ctx) => {
    if (!value) return;
    const result = normalizePhoneToE164(value);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error || "Invalid phone number",
      });
    }
  });

const emailField = z
  .string()
  .trim()
  .max(254)
  .email({ message: "Invalid email address" })
  .optional()
  .or(z.literal("").transform(() => undefined));

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

export const contactSchema = z.object({
  first_name: reqText(80, "First name"),
  last_name: reqText(80, "Last name"),
  title: optText(80),
  phone_raw: phoneField,
  email: emailField,
  address: optText(160),
  city: optText(80),
  state: optText(40),
  zip_code: optText(20),
  county: optText(80),
  owner_renter: optText(20),
  credit_rating: optText(40),
  home_value: optText(40),
  household_income: optText(40),
  cool_notes: optText(2000),
});
export type ContactFormValues = z.infer<typeof contactSchema>;

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export const appointmentSchema = z
  .object({
    date: reqText(10, "Date"),
    time: reqText(8, "Time"),
    timezone: reqText(60, "Timezone"),
    appointment_type: z.enum(["on_site_inspection", "virtual_consultation"]),
    address: optText(160),
    city: optText(80),
    state: optText(40),
    zip_code: optText(20),
    job_type: optText(40),
    urgency: z.enum(["low", "medium", "high", "urgent"]),
    closer_user_id: z.string().uuid().optional().nullable(),
    handoff_notes: optText(2000),
    notes: optText(2000),
  })
  .superRefine((v, ctx) => {
    const when = new Date(`${v.date}T${v.time}`);
    if (Number.isNaN(when.getTime())) {
      ctx.addIssue({ path: ["date"], code: "custom", message: "Invalid date/time" });
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      ctx.addIssue({ path: ["date"], code: "custom", message: "Appointment must be in the future" });
    }
    if (v.appointment_type === "on_site_inspection" && !v.address) {
      ctx.addIssue({ path: ["address"], code: "custom", message: "Address is required for on-site inspections" });
    }
  });
export type AppointmentFormValues = z.infer<typeof appointmentSchema>;

/* ------------------------------------------------------------------ */
/* Callbacks                                                           */
/* ------------------------------------------------------------------ */

export const callbackSchema = z
  .object({
    callback_at: reqText(40, "Callback time"),
    notes: optText(2000),
    priority: z.coerce.number().int().min(0).max(10).default(0),
  })
  .superRefine((v, ctx) => {
    const when = new Date(v.callback_at);
    if (Number.isNaN(when.getTime())) {
      ctx.addIssue({ path: ["callback_at"], code: "custom", message: "Invalid date/time" });
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      ctx.addIssue({ path: ["callback_at"], code: "custom", message: "Callback must be in the future" });
    }
  });
export type CallbackFormValues = z.infer<typeof callbackSchema>;

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export const campaignSchema = z.object({
  name: reqText(120, "Campaign name"),
  dial_mode: z.enum(["preview", "progressive", "predictive"]).default("preview"),
  max_attempts: z.coerce.number().int().min(1).max(50).default(5),
  max_concurrent_agents: z.coerce.number().int().min(1).max(500).default(10),
  wrap_up_seconds: z.coerce.number().int().min(0).max(600).default(15),
  retry_delay_no_answer: z.coerce.number().int().min(0).max(86400).default(300),
  retry_delay_voicemail: z.coerce.number().int().min(0).max(86400).default(600),
});
export type CampaignFormValues = z.infer<typeof campaignSchema>;

/* ------------------------------------------------------------------ */
/* QA scoring                                                          */
/* ------------------------------------------------------------------ */

const scoreField = z.coerce.number().int().min(0).max(10);

export const qaScoreSchema = z.object({
  opening_score: scoreField,
  qualification_score: scoreField,
  objection_handling_score: scoreField,
  closing_score: scoreField,
  script_adherence_score: scoreField,
  communication_score: scoreField,
  compliance_score: scoreField,
  strengths: optText(2000),
  improvement_feedback: optText(2000),
  notes: optText(2000),
});
export type QaScoreFormValues = z.infer<typeof qaScoreSchema>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Convert a Zod issue list to a flat field -> message map. */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Get a single human-readable error message (best for toasts). */
export function firstZodMessage(error: z.ZodError, fallback = "Please check the highlighted fields"): string {
  return error.issues[0]?.message || fallback;
}