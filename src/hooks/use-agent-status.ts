import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Agent statuses that allow outbound calling
const CALLABLE_STATUSES = ["available", "ready"] as const;

// All agent statuses for display.
// Colors come from semantic design tokens — see src/index.css.
export const AGENT_STATUS_OPTIONS = [
  { value: "available",      label: "Ready",   color: "text-success",      bgColor: "bg-success/10",      dotColor: "bg-success" },
  { value: "on_call",        label: "On Call", color: "text-status-calling", bgColor: "bg-status-calling/10", dotColor: "bg-status-calling" },
  { value: "wrap_up",        label: "Wrap Up", color: "text-warning",      bgColor: "bg-warning/10",      dotColor: "bg-warning" },
  { value: "paused",         label: "Paused",  color: "text-status-wrong-number", bgColor: "bg-status-wrong-number/10", dotColor: "bg-status-wrong-number" },
  { value: "lunch",          label: "Lunch",   color: "text-status-callback", bgColor: "bg-status-callback/10", dotColor: "bg-status-callback" },
  { value: "tea",            label: "Tea",     color: "text-accent",       bgColor: "bg-accent/10",       dotColor: "bg-accent" },
  { value: "bathroom_break", label: "Break",   color: "text-status-not-interested", bgColor: "bg-status-not-interested/10", dotColor: "bg-status-not-interested" },
  { value: "offline",        label: "Offline", color: "text-muted-foreground", bgColor: "bg-muted",       dotColor: "bg-muted-foreground" },
] as const;

export function getStatusMeta(status: string | null) {
  return AGENT_STATUS_OPTIONS.find((s) => s.value === status) || AGENT_STATUS_OPTIONS[AGENT_STATUS_OPTIONS.length - 1];
}

export function isCallableStatus(status: string | null): boolean {
  return CALLABLE_STATUSES.includes(status as any);
}

export function useAgentStatus() {
  const [updating, setUpdating] = useState(false);

  const updateStatus = useCallback(async (userId: string, status: string, reason?: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          agent_status: status as any,
          status_reason: reason || null,
          status_updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("[AgentStatus] Update failed:", err);
      return false;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateStatus, updating };
}
