import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DialerQueueLead {
  campaign_contact_id: string;
  campaign_id: string;
  contact_id: string;
  attempts: number;
  contact: any;
}

const SUPPRESSED_DISPOSITIONS = new Set(["wrong_number", "not_interested"]);
const RECENT_CALL_WINDOW_MIN = 60;

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Manages the agent's daily lead queue.
 * - Pulls leads assigned to the current user for today.
 * - Filters out leads suppressed by DNC, terminal disposition on most recent
 *   call attempt, or contacted within the last 60 minutes.
 */
export function useDialerQueue() {
  const [queue, setQueue] = useState<DialerQueueLead[]>([]);
  const [cursor, setCursor] = useState(0);
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [contactedToday, setContactedToday] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess?.session?.user?.id;
      if (!userId) {
        userIdRef.current = null;
        setQueue([]);
        setTotalAssigned(0);
        setContactedToday(0);
        return;
      }
      userIdRef.current = userId;

      const today = todayDateString();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const recentCutoff = new Date(Date.now() - RECENT_CALL_WINDOW_MIN * 60 * 1000);

      // 1. Pull today's assigned leads with full contact details.
      const { data: ccRows, error: ccErr } = await supabase
        .from("campaign_contacts")
        .select("id, campaign_id, contact_id, attempts, created_at, contact:contacts!inner(*)")
        .eq("assigned_agent_id", userId)
        .eq("assigned_date", today)
        .eq("assignment_status", "assigned")
        .order("created_at", { ascending: true });

      if (ccErr) {
        console.error("[useDialerQueue] load error:", ccErr.message);
        setQueue([]);
        setTotalAssigned(0);
        setContactedToday(0);
        return;
      }

      const rows = (ccRows ?? []) as any[];
      setTotalAssigned(rows.length);

      const contactIds = rows.map((r) => r.contact_id);
      const phoneByContact = new Map<string, string | null>();
      rows.forEach((r) => phoneByContact.set(r.contact_id, r.contact?.phone_e164 ?? null));
      const phones = Array.from(new Set(Array.from(phoneByContact.values()).filter(Boolean) as string[]));

      // 2. Suppression sources (parallel).
      const [dncRes, attemptsRes, contactedRes] = await Promise.all([
        phones.length
          ? supabase.from("dnc_entries").select("phone_e164").in("phone_e164", phones)
          : Promise.resolve({ data: [] as any[] }),
        contactIds.length
          ? supabase
              .from("call_attempts")
              .select("contact_id, disposition, created_at")
              .in("contact_id", contactIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("call_attempts")
          .select("contact_id", { count: "exact", head: false })
          .eq("agent_id", userId)
          .gte("created_at", startOfToday.toISOString()),
      ]);

      const dncPhones = new Set<string>((dncRes.data ?? []).map((r: any) => r.phone_e164));

      // Most recent attempt per contact + recent-call set.
      const latestDisposition = new Map<string, string | null>();
      const recentlyCalled = new Set<string>();
      for (const a of (attemptsRes.data ?? []) as any[]) {
        if (!latestDisposition.has(a.contact_id)) {
          latestDisposition.set(a.contact_id, a.disposition ?? null);
        }
        if (a.created_at && new Date(a.created_at) >= recentCutoff) {
          recentlyCalled.add(a.contact_id);
        }
      }

      // Contacted today (distinct contacts called by this agent today).
      const contactedSet = new Set<string>(
        ((contactedRes as any).data ?? []).map((r: any) => r.contact_id).filter(Boolean),
      );
      const assignedContactIds = new Set(contactIds);
      let contactedCount = 0;
      contactedSet.forEach((cid) => {
        if (assignedContactIds.has(cid)) contactedCount += 1;
      });
      setContactedToday(contactedCount);

      // 3. Filter the queue.
      const filtered: DialerQueueLead[] = rows
        .filter((r) => {
          const phone = r.contact?.phone_e164;
          if (phone && dncPhones.has(phone)) return false;
          const lastDisp = latestDisposition.get(r.contact_id);
          if (lastDisp && SUPPRESSED_DISPOSITIONS.has(lastDisp)) return false;
          if (recentlyCalled.has(r.contact_id)) return false;
          return true;
        })
        .map((r) => ({
          campaign_contact_id: r.id,
          campaign_id: r.campaign_id,
          contact_id: r.contact_id,
          attempts: r.attempts ?? 0,
          contact: r.contact,
        }));

      setQueue(filtered);
      setCursor(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const advanceToNext = useCallback(async () => {
    setCursor((c) => {
      const next = c + 1;
      if (next >= queue.length) {
        // End of queue — refresh from DB to pick up changes.
        loadQueue();
        return queue.length;
      }
      return next;
    });
  }, [queue.length, loadQueue]);

  const currentLead = queue[cursor] ?? null;
  const remainingToday = Math.max(0, totalAssigned - contactedToday);

  return {
    currentLead,
    totalAssigned,
    contactedToday,
    remainingToday,
    advanceToNext,
    isLoading,
  };
}

export default useDialerQueue;