import { cn } from "@/lib/utils";

/**
 * Operational status pill — single source of truth for queued / calling /
 * connected / callback / booked / DNC / wrong number / voicemail colors.
 * Uses the --status-* design tokens defined in src/index.css.
 */
export type OperationalStatus =
  | "queued"
  | "calling"
  | "connected"
  | "callback"
  | "booked"
  | "dnc"
  | "wrong-number"
  | "voicemail"
  | "no-answer"
  | "not-interested";

const LABELS: Record<OperationalStatus, string> = {
  queued: "Queued",
  calling: "Calling",
  connected: "Connected",
  callback: "Callback",
  booked: "Booked",
  dnc: "DNC",
  "wrong-number": "Wrong Number",
  voicemail: "Voicemail",
  "no-answer": "No Answer",
  "not-interested": "Not Interested",
};

/** Map common backend codes (dispositions, lead statuses) to UI status. */
export function mapToStatus(code: string | null | undefined): OperationalStatus | null {
  if (!code) return null;
  const k = code.toLowerCase().replace(/_/g, "-");
  switch (k) {
    case "pending":
    case "new":
    case "queued":
      return "queued";
    case "dialing":
    case "calling":
    case "ringing":
      return "calling";
    case "connected":
    case "contacted":
      return "connected";
    case "callback":
    case "callback-scheduled":
      return "callback";
    case "booked":
    case "appointment-booked":
    case "qualified":
      return "booked";
    case "dnc":
    case "dnc-request":
      return "dnc";
    case "wrong-number":
      return "wrong-number";
    case "voicemail":
      return "voicemail";
    case "no-answer":
      return "no-answer";
    case "not-interested":
      return "not-interested";
    default:
      return null;
  }
}

interface Props {
  status: OperationalStatus;
  /** Override the default label. */
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: Props) {
  return (
    <span className={cn("status-pill", `status-pill--${status}`, className)}>
      {label ?? LABELS[status]}
    </span>
  );
}

/** Convenience wrapper that accepts a raw code and renders a pill if it maps. */
export function StatusPillFromCode({
  code,
  fallback,
  className,
}: {
  code: string | null | undefined;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const status = mapToStatus(code);
  if (!status) return <>{fallback ?? null}</>;
  return <StatusPill status={status} className={className} />;
}