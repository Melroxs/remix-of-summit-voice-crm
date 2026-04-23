import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight client-side audit logger.
 *
 * Writes to public.audit_events via the SECURITY DEFINER `log_audit_event` RPC,
 * so the actor / role / company are stamped server-side and cannot be spoofed.
 * Failures are swallowed: audit logging must never break a user action.
 */

export type AuditEventType =
  // Auth
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  // Contacts
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "contact.bulk_deleted"
  | "contact.bulk_assigned"
  | "contact.imported"
  // Campaigns
  | "campaign.created"
  | "campaign.updated"
  | "campaign.status_changed"
  | "campaign.deleted"
  // Calls
  | "call.started"
  | "call.ended"
  | "call.disposition_saved"
  | "call.skipped"
  // Appointments
  | "appointment.booked"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.completed"
  // QA / Coaching
  | "qa.scored"
  | "feedback.given"
  // DNC / suppression
  | "dnc.added"
  | "dnc.removed"
  // Admin / users
  | "user.role_changed"
  | "user.deactivated"
  | "user.activated"
  // Telephony
  | "telephony.provider_updated"
  | "telephony.number_added"
  | "telephony.number_removed";

interface LogEventInput {
  type: AuditEventType;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record an audit event. Best-effort; never throws.
 * Returns the event id on success or null on failure.
 */
export async function logEvent({
  type,
  entity_type = null,
  entity_id = null,
  metadata = {},
}: LogEventInput): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("log_audit_event", {
      _event_type: type,
      _entity_type: entity_type,
      _entity_id: entity_id,
      _metadata: metadata as never,
    });
    if (error) {
      // Don't toast — audit failures should be silent for users
      console.warn("[audit] log_audit_event failed:", error.message);
      return null;
    }
    return (data as unknown as string) ?? null;
  } catch (err) {
    console.warn("[audit] log_audit_event threw:", err);
    return null;
  }
}