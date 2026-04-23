import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportsFilters {
  fromIso: string;
  toIso: string;
  campaignId?: string | "all";
  agentId?: string | "all";
}

export interface ReportsKpis {
  totalAttempts: number;
  totalConnects: number;
  totalAppointments: number;
  totalDnc: number;
  totalWrongNumbers: number;
  totalVoicemails: number;
  totalCallbacks: number;
  connectRate: number;       // 0-1
  bookingRate: number;       // appointments / connects
  conversionRate: number;    // appointments / attempts
  avgAttemptsToConnect: number;
  callbackBacklog: number;
}

/**
 * Aggregates outbound metrics from call_attempts + appointments + callbacks.
 * All filters apply server-side via Supabase counts/queries.
 */
export function useReports(filters: ReportsFilters) {
  return useQuery({
    queryKey: ["reports", filters],
    queryFn: async (): Promise<ReportsKpis> => {
      const { fromIso, toIso, campaignId, agentId } = filters;

      const callBase = () => {
        let q: any = supabase
          .from("call_attempts")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromIso)
          .lte("created_at", toIso);
        if (campaignId && campaignId !== "all") q = q.eq("campaign_id", campaignId);
        if (agentId && agentId !== "all") q = q.eq("agent_id", agentId);
        return q;
      };

      const apptBase = () => {
        let q: any = supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromIso)
          .lte("created_at", toIso);
        if (campaignId && campaignId !== "all") q = q.eq("campaign_id", campaignId);
        if (agentId && agentId !== "all") q = q.eq("agent_id", agentId);
        return q;
      };

      const [
        attemptsRes,
        connectsRes,
        voicemailsRes,
        dncRes,
        wrongRes,
        callbacksRes,
        apptRes,
        backlogRes,
      ] = await Promise.all([
        callBase(),
        callBase().eq("outcome", "connected"),
        callBase().eq("outcome", "voicemail"),
        callBase().eq("outcome", "dnc_request"),
        callBase().eq("outcome", "wrong_number"),
        callBase().eq("outcome", "callback_scheduled"),
        apptBase(),
        supabase.from("callbacks").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      const totalAttempts = attemptsRes.count ?? 0;
      const totalConnects = connectsRes.count ?? 0;
      const totalAppointments = apptRes.count ?? 0;
      const connectRate = totalAttempts ? totalConnects / totalAttempts : 0;
      const bookingRate = totalConnects ? totalAppointments / totalConnects : 0;
      const conversionRate = totalAttempts ? totalAppointments / totalAttempts : 0;
      const avgAttemptsToConnect = totalConnects ? totalAttempts / totalConnects : 0;

      return {
        totalAttempts,
        totalConnects,
        totalAppointments,
        totalDnc: dncRes.count ?? 0,
        totalWrongNumbers: wrongRes.count ?? 0,
        totalVoicemails: voicemailsRes.count ?? 0,
        totalCallbacks: callbacksRes.count ?? 0,
        connectRate,
        bookingRate,
        conversionRate,
        avgAttemptsToConnect,
        callbackBacklog: backlogRes.count ?? 0,
      };
    },
  });
}