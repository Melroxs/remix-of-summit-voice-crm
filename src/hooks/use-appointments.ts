import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Database } from "@/integrations/supabase/types";
import { logEvent } from "@/lib/audit";

export type AppointmentRow = Tables<"appointments">;
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export interface AppointmentFilters {
  status?: AppointmentStatus | "all";
  campaignId?: string;
  agentId?: string;
  fromIso?: string;
  toIso?: string;
  search?: string;
}

export interface AppointmentsQueryInput extends AppointmentFilters {
  page: number;
  pageSize: number;
}

export function useAppointments(input: AppointmentsQueryInput) {
  return useQuery({
    queryKey: ["appointments", input],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { page, pageSize, status, campaignId, agentId, fromIso, toIso, search } = input;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q: any = supabase
        .from("appointments")
        .select("*, contacts!inner(first_name, last_name, phone_e164)")
        .order("appointment_at", { ascending: true })
        .range(from, to);
      let cq: any = supabase.from("appointments").select("id", { count: "exact", head: true });

      if (status && status !== "all") {
        q = q.eq("status", status);
        cq = cq.eq("status", status);
      }
      if (campaignId && campaignId !== "all") {
        q = q.eq("campaign_id", campaignId);
        cq = cq.eq("campaign_id", campaignId);
      }
      if (agentId && agentId !== "all") {
        q = q.eq("agent_id", agentId);
        cq = cq.eq("agent_id", agentId);
      }
      if (fromIso) {
        q = q.gte("appointment_at", fromIso);
        cq = cq.gte("appointment_at", fromIso);
      }
      if (toIso) {
        q = q.lte("appointment_at", toIso);
        cq = cq.lte("appointment_at", toIso);
      }
      if (search?.trim()) {
        const s = search.trim();
        q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,notes.ilike.%${s}%`);
      }

      const [data, count] = await Promise.all([q, cq]);
      if (data.error) throw data.error;
      if (count.error) throw count.error;
      return { rows: (data.data || []) as AppointmentRow[], totalCount: count.count ?? 0 };
    },
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
      await logEvent({
        type:
          input.status === "rescheduled"
            ? "appointment.rescheduled"
            : input.status === "completed"
            ? "appointment.completed"
            : input.status === "no_show"
            ? "appointment.cancelled"
            : "appointment.booked",
        entity_type: "appointment",
        entity_id: input.id,
        metadata: { status: input.status },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}