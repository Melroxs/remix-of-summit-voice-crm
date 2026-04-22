import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGENT_STATUS_OPTIONS, getStatusMeta, useAgentStatus } from "@/hooks/use-agent-status";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

interface AgentStatusSelectorProps {
  compact?: boolean;
}

export function AgentStatusBadge({ status }: { status: string | null }) {
  const meta = getStatusMeta(status);
  return (
    <Badge variant="outline" className={`${meta.bgColor} ${meta.color} border-transparent`}>
      <span className={`w-2 h-2 rounded-full mr-1.5 inline-block ${meta.dotColor}`} />
      {meta.label}
    </Badge>
  );
}

export function AgentStatusSelector({ compact }: AgentStatusSelectorProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { updateStatus, updating } = useAgentStatus();

  const currentStatus = profile?.agent_status || "offline";
  const meta = getStatusMeta(currentStatus);

  // Statuses agents can manually set (on_call and wrap_up are set by the system)
  const manualStatuses = AGENT_STATUS_OPTIONS.filter(
    (s) => !["on_call", "wrap_up"].includes(s.value)
  );

  const handleChange = async (value: string) => {
    if (!user) return;
    const ok = await updateStatus(user.id, value);
    if (ok) {
      await refreshProfile();
      const label = getStatusMeta(value).label;
      toast({ title: "Status updated", description: `You are now ${label}` });
    } else {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  return (
    <Select value={currentStatus} onValueChange={handleChange} disabled={updating}>
      <SelectTrigger className={compact ? "h-8 w-[140px] text-xs" : "h-9 w-[160px]"}>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
          <SelectValue>{meta.label}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {manualStatuses.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${s.dotColor}`} />
              {s.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
