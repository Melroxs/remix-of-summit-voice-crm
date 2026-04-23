import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectBestNumber, recordCallForNumber } from "@/lib/number-health";

export interface CampaignPhoneNumber {
  id: string;             // campaign_caller_ids.id
  caller_id: string;      // caller_ids.id
  campaign_id: string;
  phone_number: string;   // caller_ids.phone_e164
  provider: string;
  is_active: boolean;
  priority: number;
  rotation_order: number;
  last_used_at: string | null;
  created_at: string;
  max_calls_per_hour?: number;
  max_calls_per_day?: number;
  cooldown_minutes?: number;
  area_code?: string | null;
}

/** Hook to manage campaign phone number pools (now caller_ids + campaign_caller_ids). */
export function useCampaignPhones(campaignId: string | null) {
  const [phones, setPhones] = useState<CampaignPhoneNumber[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPhones = useCallback(async () => {
    if (!campaignId) { setPhones([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("campaign_caller_ids")
      .select("id, campaign_id, caller_id, rotation_order, priority, created_at, caller_ids(id, phone_e164, provider, is_active, last_used_at, max_calls_per_hour, max_calls_per_day, cooldown_minutes, area_code)")
      .eq("campaign_id", campaignId)
      .order("rotation_order", { ascending: true });

    const mapped: CampaignPhoneNumber[] = (data || []).map((row: any) => ({
      id: row.id,
      caller_id: row.caller_id,
      campaign_id: row.campaign_id,
      phone_number: row.caller_ids?.phone_e164 ?? "",
      provider: row.caller_ids?.provider ?? "telnyx",
      is_active: row.caller_ids?.is_active ?? true,
      priority: row.priority ?? 0,
      rotation_order: row.rotation_order ?? 0,
      last_used_at: row.caller_ids?.last_used_at ?? null,
      created_at: row.created_at,
      max_calls_per_hour: row.caller_ids?.max_calls_per_hour,
      max_calls_per_day: row.caller_ids?.max_calls_per_day,
      cooldown_minutes: row.caller_ids?.cooldown_minutes,
      area_code: row.caller_ids?.area_code,
    }));

    setPhones(mapped);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchPhones(); }, [fetchPhones]);

  const getNextOutboundNumber = useCallback(async (
    leadAreaCode?: string | null,
    localPresence: boolean = false,
    strategy: string = "round_robin"
  ): Promise<CampaignPhoneNumber | null> => {
    if (!campaignId) return null;
    const best = await selectBestNumber(campaignId, leadAreaCode, localPresence, strategy);
    if (!best) return null;
    const match = phones.find(p => p.caller_id === best.id);
    return match || ({ caller_id: best.id, phone_number: best.phone_number } as CampaignPhoneNumber);
  }, [campaignId, phones]);

  const markUsed = useCallback(async (
    callerId: string,
    wasAnswered: boolean = false,
    wasAppointment: boolean = false
  ) => {
    await supabase
      .from("caller_ids")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", callerId);

    const phone = phones.find(p => p.caller_id === callerId);
    await recordCallForNumber(
      callerId,
      wasAnswered,
      wasAppointment,
      phone?.max_calls_per_hour || 15,
      phone?.max_calls_per_day || 100,
      phone?.cooldown_minutes || 30
    );
  }, [phones]);

  return { phones, loading, fetchPhones, getNextOutboundNumber, markUsed };
}
