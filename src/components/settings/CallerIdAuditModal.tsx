import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Power, History, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneDisplay } from "@/lib/phone";

interface AuditRow {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  actor_name?: string | null;
}

interface Props {
  callerId: string;
  phoneE164: string;
  displayName?: string | null;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CallerIdAuditModal({ callerId, phoneE164, displayName, onClose }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("audit_events")
        .select("id, event_type, occurred_at, actor_id, actor_role, metadata")
        .eq("entity_type", "caller_id")
        .eq("entity_id", callerId)
        .in("event_type", ["caller_id.activated", "caller_id.deactivated"])
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (error) {
        toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const events = (data || []) as AuditRow[];
      const actorIds = Array.from(
        new Set(events.map((e) => e.actor_id).filter((id): id is string => !!id))
      );

      let nameMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", actorIds);
        (profiles || []).forEach((p: any) => {
          nameMap.set(p.user_id, p.display_name || p.email || p.user_id);
        });
      }

      setRows(events.map((e) => ({ ...e, actor_name: e.actor_id ? nameMap.get(e.actor_id) || null : null })));
      setLoading(false);
    };
    load();
  }, [callerId, toast]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Audit Log
          </DialogTitle>
          <div className="text-sm text-muted-foreground pt-1">
            <span className="font-mono">{formatPhoneDisplay(phoneE164)}</span>
            {displayName && <span className="ml-2">· {displayName}</span>}
          </div>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading audit history…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No activate/deactivate events recorded for this number yet.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <ul className="space-y-2">
              {rows.map((row) => {
                const isActivate = row.event_type === "caller_id.activated";
                const meta = row.metadata || {};
                const isBulk = (meta as any).bulk === true;
                return (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 p-3 rounded-md border border-border bg-card"
                  >
                    <div
                      className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${
                        isActivate
                          ? "bg-green-500/15 text-green-400"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      <Power className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {isActivate ? "Activated" : "Deactivated"}
                        </span>
                        {isBulk && (
                          <Badge variant="secondary" className="text-xs">
                            Bulk
                          </Badge>
                        )}
                        {row.actor_role && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {row.actor_role}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <User className="h-3 w-3" />
                        <span>{row.actor_name || row.actor_id || "Unknown user"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(row.occurred_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}