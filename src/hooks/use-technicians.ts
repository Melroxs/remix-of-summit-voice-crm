import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export interface Technician {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  home_address: string | null;
  phone: string | null;
  email: string | null;
  skills: string[];
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  is_active: boolean;
  home_lat: number | null;
  home_lng: number | null;
  service_areas: string[];
}

export type TechnicianInput = Omit<Technician, "id" | "company_id"> & { id?: string };

export function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technicians")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Technician[];
    },
  });
}

export function useSaveTechnician() {
  const qc = useQueryClient();
  const { activeCompanyId, profile } = useAuth();
  return useMutation({
    mutationFn: async (input: TechnicianInput) => {
      const company_id = activeCompanyId ?? profile?.company_id;
      if (!company_id) throw new Error("No active company");
      const payload = {
        name: input.name,
        home_address: input.home_address,
        phone: input.phone,
        email: input.email,
        skills: input.skills,
        working_hours_start: input.working_hours_start,
        working_hours_end: input.working_hours_end,
        working_days: input.working_days,
        is_active: input.is_active,
        user_id: input.user_id,
        company_id,
        home_lat: input.home_lat,
        home_lng: input.home_lng,
        service_areas: input.service_areas ?? [],
      };
      if (input.id) {
        const { error } = await supabase.from("technicians").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("technicians").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technicians"] });
      toast.success("Technician saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("technicians").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technicians"] });
      qc.invalidateQueries({ queryKey: ["technician_appointments"] });
      toast.success("Technician removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}