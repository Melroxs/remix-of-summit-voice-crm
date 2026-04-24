import { useMemo } from "react";
import { CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { normalizePhoneToE164 } from "@/lib/phone";

interface Props {
  rawValue: string;
}

/**
 * Read-only preview of the canonical E.164 form a phone input will be saved as.
 * Updates live as the user types so they can confirm the +1 number before saving.
 */
export default function PhoneE164Preview({ rawValue }: Props) {
  const result = useMemo(() => {
    const trimmed = (rawValue || "").trim();
    if (!trimmed) return { state: "empty" as const };
    const n = normalizePhoneToE164(trimmed);
    return n.valid
      ? { state: "valid" as const, e164: n.e164 }
      : { state: "invalid" as const, error: n.error || "Invalid number" };
  }, [rawValue]);

  if (result.state === "empty") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
        <Phone className="w-3 h-3" />
        Dial-ready format will appear here.
      </p>
    );
  }

  if (result.state === "invalid") {
    return (
      <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
        <AlertCircle className="w-3 h-3" />
        Cannot normalize: {result.error}
      </p>
    );
  }

  return (
    <p className="text-xs text-foreground flex items-center gap-1.5 mt-1">
      <CheckCircle2 className="w-3 h-3 text-primary" />
      <span className="text-muted-foreground">Dial-ready (E.164):</span>
      <code className="font-mono font-semibold text-foreground">{result.e164}</code>
    </p>
  );
}