import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AuditEventType } from "@/lib/audit";

export interface AuditLogFilters {
  eventType?: AuditEventType | "all";
  actorId?: string;
  entityType?: string;
  fromIso?: string;
  toIso?: string;
}

export interface AuditLogQueryInput extends AuditLogFilters {
  page: number;
  pageSize: number;
}

export function useAuditLog(input: AuditLogQueryInput) {
  return useQuery({
    queryKey: ["audit-events", input],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { page, pageSize, eventType, actorId, entityType, fromIso, toIso } = input;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q: any = supabase
        .from("audit_events")
        .select("*")
        .order("occurred_at", { ascending: false })
        .range(from, to);
      let cq: any = supabase.from("audit_events").select("id", { count: "exact", head: true });

      if (eventType && eventType !== "all") {
        q = q.eq("event_type", eventType);
        cq = cq.eq("event_type", eventType);
      }
      if (actorId) {
        q = q.eq("actor_id", actorId);
        cq = cq.eq("actor_id", actorId);
      }
      if (entityType) {
        q = q.eq("entity_type", entityType);
        cq = cq.eq("entity_type", entityType);
      }
      if (fromIso) {
        q = q.gte("occurred_at", fromIso);
        cq = cq.gte("occurred_at", fromIso);
      }
      if (toIso) {
        q = q.lte("occurred_at", toIso);
        cq = cq.lte("occurred_at", toIso);
      }

      const [d, c] = await Promise.all([q, cq]);
      if (d.error) throw d.error;
      if (c.error) throw c.error;
      return { rows: d.data ?? [], totalCount: c.count ?? 0 };
    },
  });
}