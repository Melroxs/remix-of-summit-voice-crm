import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rescoreSingleContact } from "@/lib/lead-scoring";

export interface QueueContact {
  id: string; // campaign_contacts.id
  contact_id: string;
  first_name: string;
  last_name: string;
  phone_e164: string | null;
  phone_raw: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  county: string | null;
  title: string | null;
  owner_renter: string | null;
  home_value: string | null;
  household_income: string | null;
  credit_rating: string | null;
  cool_notes: string | null;
  timezone: string | null;
  lead_status: string | null;
  attempts: number;
  dial_status: string | null;
}

export interface QueueStats {
  remaining: number;
  completed: number;
  callbacks: number;
  deferred: number;
  nextRetryAt: string | null;
}

/** Dispositions that permanently remove a lead from the queue. */
const TERMINAL_DISPOSITIONS = [
  "wrong_number",
  "dnc",
  "not_interested",
  "appointment_booked",
  "have_solar",
];

/** Dispositions that defer the lead via retry delay (not terminal, not callback). */
const RETRY_DISPOSITIONS = ["no_answer", "voicemail", "busy"];

/** Max recently-dialed IDs to track for anti-recycling. */
const MAX_RECENT = 20;

export function useDialerQueue(campaignId: string | null) {
  const [currentLead, setCurrentLead] = useState<QueueContact | null>(null);
  const [stats, setStats] = useState<QueueStats>({ remaining: 0, completed: 0, callbacks: 0, deferred: 0, nextRetryAt: null });
  const [loading, setLoading] = useState(false);

  /** Track the last N campaign_contacts.ids we dialed to prevent recycling. */
  const recentlyDialedRef = useRef<string[]>([]);
  /** Prefetched next lead ready to serve instantly (NOT locked in DB yet). */
  const prefetchedLeadRef = useRef<QueueContact | null>(null);
  /** Guard against overlapping fetchNextLead calls. */
  const fetchLockRef = useRef(false);
  /** The currently active lead ID — used to prevent prefetch from returning same lead. */
  const activeLeadIdRef = useRef<string | null>(null);

  const addToRecentlyDialed = useCallback((ccId: string) => {
    recentlyDialedRef.current = [ccId, ...recentlyDialedRef.current.filter(id => id !== ccId)].slice(0, MAX_RECENT);
  }, []);

  const fetchStats = useCallback(async () => {
    if (!campaignId) {
      setStats({ remaining: 0, completed: 0, callbacks: 0, deferred: 0, nextRetryAt: null });
      return;
    }

    const now = new Date().toISOString();

    const [remainingRes, completedRes, callbackRes, deferredRes, soonestRes] = await Promise.all([
      supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("dial_status", "pending")
        .or(`next_eligible_at.is.null,next_eligible_at.lte.${now}`),
      supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("dial_status", "completed"),
      supabase
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "pending"),
      supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("dial_status", "pending")
        .gt("next_eligible_at", now),
      supabase
        .from("campaign_contacts")
        .select("next_eligible_at")
        .eq("campaign_id", campaignId)
        .eq("dial_status", "pending")
        .gt("next_eligible_at", now)
        .order("next_eligible_at", { ascending: true })
        .limit(1),
    ]);

    setStats({
      remaining: remainingRes.count ?? 0,
      completed: completedRes.count ?? 0,
      callbacks: callbackRes.count ?? 0,
      deferred: deferredRes.count ?? 0,
      nextRetryAt: (soonestRes.data?.[0] as any)?.next_eligible_at ?? null,
    });
  }, [campaignId]);

  /**
   * Internal: resolve a single eligible lead from the DB.
   * Excludes recently dialed IDs and the currently active lead.
   * Optionally locks the lead as "dialing" in the DB.
   */
  const resolveNextLead = useCallback(async (lockInDb: boolean): Promise<QueueContact | null> => {
    if (!campaignId) return null;

    const t0 = performance.now();
    const now = new Date().toISOString();
    // Combine recently dialed + currently active lead for exclusion
    const excludeIds = [...recentlyDialedRef.current];
    if (activeLeadIdRef.current && !excludeIds.includes(activeLeadIdRef.current)) {
      excludeIds.push(activeLeadIdRef.current);
    }

    console.log(`[Queue] 🔍 Resolving next lead (lock=${lockInDb}), campaign=${campaignId}, excluding=${excludeIds.length} IDs`);

    // Query candidates — uses idx_cc_queue_lookup partial index
    const { data: ccRows, error } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id, attempts, dial_status")
      .eq("campaign_id", campaignId)
      .eq("dial_status", "pending")
      .or(`next_eligible_at.is.null,next_eligible_at.lte.${now}`)
      .order("priority_score", { ascending: false })
      .order("attempts", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(15);

    if (error) {
      console.error("[Queue] ❌ Query error:", error.message);
      return null;
    }

    if (!ccRows || ccRows.length === 0) {
      console.log("[Queue] ℹ️ No eligible leads remaining");
      return null;
    }

    // Pick first candidate NOT in exclusion list
    let cc = ccRows.find((r) => !excludeIds.includes(r.id)) || null;

    // If every candidate is excluded, allow the least-recent one only as last resort
    if (!cc && ccRows.length > 0) {
      console.log("[Queue] ⚠️ All candidates recently dialed — allowing least-recent");
      cc = ccRows[ccRows.length - 1];
    }

    if (!cc) return null;

    // Fetch contact details (+ lock if needed) in parallel
    const contactPromise = supabase.from("contacts").select("*").eq("id", cc.contact_id).single();
    let contact: any = null;
    
    if (lockInDb) {
      const lockPromise = supabase.from("campaign_contacts").update({
        dial_status: "dialing" as any,
        last_called_at: new Date().toISOString(),
      }).eq("id", cc.id);
      
      const [contactRes] = await Promise.all([contactPromise, lockPromise]);
      contact = contactRes.data;
    } else {
      const contactRes = await contactPromise;
      contact = contactRes.data;
    }

    if (!contact) {
      console.warn("[Queue] ⚠️ Contact not found for cc.id", cc.id);
      return null;
    }

    const elapsed = (performance.now() - t0).toFixed(0);
    console.log(`[Queue] ✅ Resolved lead in ${elapsed}ms: ${contact.first_name} ${contact.last_name} (cc.id=${cc.id}, attempts=${cc.attempts})`);

    return {
      id: cc.id,
      contact_id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone_e164: contact.phone_e164,
      phone_raw: contact.phone_raw,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip_code: contact.zip_code,
      county: contact.county,
      title: contact.title,
      owner_renter: contact.owner_renter,
      home_value: contact.home_value,
      household_income: contact.household_income,
      credit_rating: contact.credit_rating,
      cool_notes: contact.cool_notes,
      timezone: contact.timezone,
      lead_status: contact.lead_status,
      attempts: cc.attempts ?? 0,
      dial_status: lockInDb ? "dialing" : "pending",
    };
  }, [campaignId]);

  /**
   * Prefetch the next lead in the background (NO DB lock).
   * The lock is applied only when the lead is actually served.
   */
  const prefetch = useCallback(async () => {
    const lead = await resolveNextLead(false);
    if (lead) {
      prefetchedLeadRef.current = lead;
      console.log(`[Queue] 📦 Prefetched next lead: ${lead.first_name} ${lead.last_name} (cc.id=${lead.id})`);
    }
  }, [resolveNextLead]);

  /**
   * Fetch the next eligible lead. Uses prefetch cache if available.
   * Serialized — overlapping calls are ignored.
   */
  const fetchNextLead = useCallback(async () => {
    if (!campaignId) return;
    if (fetchLockRef.current) {
      console.log("[Queue] ⏳ fetchNextLead already in progress — skipping duplicate call");
      return;
    }

    fetchLockRef.current = true;
    setLoading(true);

    try {
      // Use prefetched lead if available
      const prefetched = prefetchedLeadRef.current;
      if (prefetched && !recentlyDialedRef.current.includes(prefetched.id)) {
        prefetchedLeadRef.current = null;

        // Verify it's still eligible AND lock it now
        const { data: check } = await supabase
          .from("campaign_contacts")
          .select("dial_status")
          .eq("id", prefetched.id)
          .single();

        if (check && check.dial_status === "pending") {
          // Lock it
          await supabase.from("campaign_contacts").update({
            dial_status: "dialing" as any,
            last_called_at: new Date().toISOString(),
          }).eq("id", prefetched.id);

          console.log(`[Queue] ⚡ Using prefetched lead: ${prefetched.first_name} ${prefetched.last_name}`);
          prefetched.dial_status = "dialing";
          activeLeadIdRef.current = prefetched.id;
          setCurrentLead(prefetched);
          setLoading(false);
          fetchLockRef.current = false;
          // Non-blocking background tasks
          fetchStats().catch(() => {});
          prefetch().catch(() => {});
          return;
        }
        console.log("[Queue] ⚠️ Prefetched lead is stale, fetching fresh");
      } else {
        prefetchedLeadRef.current = null;
      }

      const lead = await resolveNextLead(true);
      activeLeadIdRef.current = lead?.id || null;
      setCurrentLead(lead);
      await fetchStats();

      // Prefetch next lead in background
      if (lead) {
        prefetch().catch(() => {});
      }
    } finally {
      setLoading(false);
      fetchLockRef.current = false;
    }
  }, [campaignId, fetchStats, resolveNextLead, prefetch]);

  /**
   * Dispose the current lead: save call log, update state, compute retry.
   * Returns the call_log_id for AI summary generation.
   */
  const disposeLead = useCallback(
    async (dispositionCode: string, notes: string): Promise<string | null> => {
      if (!currentLead || !campaignId) return null;

      const t0 = performance.now();
      const prevLeadId = currentLead.id;

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // 1. Create call log
      const { data: callLogData } = await supabase.from("call_logs").insert({
        contact_id: currentLead.contact_id,
        campaign_id: campaignId,
        agent_id: userId || null,
        disposition: dispositionCode,
        notes: notes || null,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        call_source: "queue",
        dial_mode_used: "queue",
      }).select("id").single();

      const callLogId = callLogData?.id || null;

      // 2. Determine new state
      const newAttempts = currentLead.attempts + 1;
      const isTerminal = TERMINAL_DISPOSITIONS.includes(dispositionCode);
      const isCallback = dispositionCode === "callback";
      const isRetryable = RETRY_DISPOSITIONS.includes(dispositionCode);

      // 3. Compute next_eligible_at for retryable dispositions
      let nextEligibleAt: string | null = null;

      if (isRetryable && !isTerminal) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("retry_delay_no_answer, retry_delay_voicemail, max_attempts")
          .eq("id", campaignId)
          .single();

        const maxAttempts = campaign?.max_attempts ?? 5;

        if (newAttempts >= maxAttempts) {
          console.log(`[Queue] 🚫 Lead ${currentLead.id} reached max attempts (${maxAttempts}) — completing`);
        } else {
          let delaySeconds = 300;
          if (dispositionCode === "voicemail") {
            delaySeconds = campaign?.retry_delay_voicemail ?? 600;
          } else {
            delaySeconds = campaign?.retry_delay_no_answer ?? 300;
          }
          nextEligibleAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
          console.log(`[Queue] ⏰ Lead ${currentLead.id} deferred until ${nextEligibleAt} (${delaySeconds}s, disposition: ${dispositionCode})`);
        }
      }

      // 4. Update campaign_contact
      const isMaxedOut = isRetryable && !isTerminal && !nextEligibleAt;
      const finalStatus = isTerminal || isMaxedOut ? "completed" : isCallback ? "completed" : "pending";

      const updatePayload: Record<string, any> = {
        dial_status: finalStatus,
        attempts: newAttempts,
        last_called_at: new Date().toISOString(),
        next_eligible_at: nextEligibleAt || null,
      };

      const { error: updateError } = await supabase
        .from("campaign_contacts")
        .update(updatePayload as any)
        .eq("id", currentLead.id);

      if (updateError) {
        console.error("[Queue] ❌ Failed to update campaign_contact:", updateError.message);
      }

      // 5. Update contact lead_status
      const statusMap: Record<string, string> = {
        appointment_booked: "qualified",
        not_interested: "dead",
        dnc: "dead",
        wrong_number: "dead",
        have_solar: "dead",
      };
      const newLeadStatus = statusMap[dispositionCode] || "contacted";
      await supabase
        .from("contacts")
        .update({ lead_status: newLeadStatus as any })
        .eq("id", currentLead.contact_id);

      // 6. Rescore if still in queue (non-blocking)
      if (finalStatus === "pending" && campaignId) {
        rescoreSingleContact(currentLead.id, currentLead.contact_id, campaignId).catch(() => {});
      }

      // 7. Track this lead in recently-dialed to prevent recycling
      addToRecentlyDialed(prevLeadId);

      // 8. Clear current lead immediately
      activeLeadIdRef.current = null;
      setCurrentLead(null);

      // 9. Invalidate prefetch if it matches this lead
      if (prefetchedLeadRef.current?.id === prevLeadId) {
        prefetchedLeadRef.current = null;
      }

      const elapsed = (performance.now() - t0).toFixed(0);
      console.log(`[Queue] 📋 Disposed lead ${prevLeadId} in ${elapsed}ms: disposition=${dispositionCode}, status=${finalStatus}, attempts=${newAttempts}`);

      return callLogId;
    },
    [currentLead, campaignId, addToRecentlyDialed]
  );

  const skipLead = useCallback(async () => {
    if (!currentLead) return;

    addToRecentlyDialed(currentLead.id);

    await supabase
      .from("campaign_contacts")
      .update({ dial_status: "pending" as any })
      .eq("id", currentLead.id);

    console.log(`[Queue] ⏭️ Skipped lead ${currentLead.id}`);

    activeLeadIdRef.current = null;
    setCurrentLead(null);
    await fetchStats();
  }, [currentLead, fetchStats, addToRecentlyDialed]);

  // Release stale dialing locks on campaign init
  useEffect(() => {
    if (!campaignId) return;
    const release = async () => {
      try {
        const { data } = await supabase.rpc("release_stale_dialing_locks" as any);
        if (data && (data as number) > 0) {
          console.log(`[Queue] 🔓 Released ${data} stale dialing locks`);
        }
      } catch { /* ignore */ }
    };
    release();
  }, [campaignId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Clear state when campaign changes
  useEffect(() => {
    recentlyDialedRef.current = [];
    prefetchedLeadRef.current = null;
    activeLeadIdRef.current = null;
    fetchLockRef.current = false;
    setCurrentLead(null);
  }, [campaignId]);

  return {
    currentLead,
    stats,
    loading,
    fetchNextLead,
    disposeLead,
    skipLead,
    fetchStats,
  };
}
