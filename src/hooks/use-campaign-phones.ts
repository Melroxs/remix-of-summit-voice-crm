import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectBestNumber, recordCallForNumber } from "@/lib/number-health";

export interface CampaignPhoneNumber {
  id: string;
  campaign_id: string;
  phone_number: string;
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

/**
 * Hook to manage campaign phone number pools with health-based rotation.
 */
export function useCampaignPhones(campaignId: string | null) {
  const [phones, setPhones] = useState<CampaignPhoneNumber[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPhones = useCallback(async () => {
    if (!campaignId) { setPhones([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("campaign_phone_numbers")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("rotation_order", { ascending: true });
    setPhones((data || []) as CampaignPhoneNumber[]);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchPhones(); }, [fetchPhones]);

  /** Get the best outbound number using health-aware rotation */
  const getNextOutboundNumber = useCallback(async (
    leadAreaCode?: string | null,
    localPresence: boolean = false,
    strategy: string = "round_robin"
  ): Promise<CampaignPhoneNumber | null> => {
    if (!campaignId) return null;
    const best = await selectBestNumber(campaignId, leadAreaCode, localPresence, strategy);
    if (!best) return null;
    const match = phones.find(p => p.id === best.id);
    return match || { id: best.id, phone_number: best.phone_number } as CampaignPhoneNumber;
  }, [campaignId, phones]);

  /** Mark a phone number as just used and record the call */
  const markUsed = useCallback(async (
    phoneId: string,
    wasAnswered: boolean = false,
    wasAppointment: boolean = false
  ) => {
    await supabase
      .from("campaign_phone_numbers")
      .update({ last_used_at: new Date().toISOString() } as any)
      .eq("id", phoneId);

    const phone = phones.find(p => p.id === phoneId);
    await recordCallForNumber(
      phoneId,
      wasAnswered,
      wasAppointment,
      phone?.max_calls_per_hour || 15,
      phone?.max_calls_per_day || 100,
      phone?.cooldown_minutes || 30
    );
  }, [phones]);

  return { phones, loading, fetchPhones, getNextOutboundNumber, markUsed };
}
