import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export type TechApptStatus =
  | "scheduled"
  | "en_route"
  | "on_site"
  | "completed"
  | "cancelled"
  | "no_show";

export interface TechAppointment {
  id: string;
  company_id: string;
  technician_id: string;
  contact_id: string | null;
  campaign_id: string | null;
  appointment_id: string | null;
  lead_address: string | null;
  start_time: string;
  end_time: string;
  required_skill: string | null;
  status: TechApptStatus;
  notes: string | null;
}

export type TechAppointmentInput = Omit<TechAppointment, "id" | "company_id"> & { id?: string };

export function useTechAppointments(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["technician_appointments", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technician_appointments")
        .select("*")
        .gte("start_time", fromIso)
        .lte("start_time", toIso)
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as TechAppointment[];
    },
  });
}

export function useSaveTechAppointment() {
  const qc = useQueryClient();
  const { activeCompanyId, profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: TechAppointmentInput) => {
      const company_id = activeCompanyId ?? profile?.company_id;
      if (!company_id) throw new Error("No active company");
      const payload = {
        technician_id: input.technician_id,
        contact_id: input.contact_id,
        campaign_id: input.campaign_id,
        appointment_id: input.appointment_id,
        lead_address: input.lead_address,
        start_time: input.start_time,
        end_time: input.end_time,
        required_skill: input.required_skill,
        status: input.status,
        notes: input.notes,
        company_id,
        created_by: user?.id ?? null,
      };
      if (input.id) {
        const { error } = await supabase
          .from("technician_appointments")
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("technician_appointments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technician_appointments"] });
      toast.success("Appointment saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTechAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("technician_appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technician_appointments"] });
      toast.success("Appointment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}