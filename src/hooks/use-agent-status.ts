import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Agent statuses that allow outbound calling
const CALLABLE_STATUSES = ["available", "ready"] as const;

// All agent statuses for display
export const AGENT_STATUS_OPTIONS = [
  { value: "available", label: "Ready", color: "text-green-400", bgColor: "bg-green-500/10", dotColor: "bg-green-400" },
  { value: "on_call", label: "On Call", color: "text-blue-400", bgColor: "bg-blue-500/10", dotColor: "bg-blue-400" },
  { value: "wrap_up", label: "Wrap Up", color: "text-amber-400", bgColor: "bg-amber-500/10", dotColor: "bg-amber-400" },
  { value: "paused", label: "Paused", color: "text-orange-400", bgColor: "bg-orange-500/10", dotColor: "bg-orange-400" },
  { value: "lunch", label: "Lunch", color: "text-purple-400", bgColor: "bg-purple-500/10", dotColor: "bg-purple-400" },
  { value: "tea", label: "Tea", color: "text-teal-400", bgColor: "bg-teal-500/10", dotColor: "bg-teal-400" },
  { value: "bathroom_break", label: "Break", color: "text-pink-400", bgColor: "bg-pink-500/10", dotColor: "bg-pink-400" },
  { value: "offline", label: "Offline", color: "text-muted-foreground", bgColor: "bg-muted", dotColor: "bg-muted-foreground" },
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
