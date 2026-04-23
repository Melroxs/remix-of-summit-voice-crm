import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContactRow = Tables<"contacts">;

export interface ContactsFilters {
  search?: string;
  status?: string;     // "all" | new | contacted | qualified | converted | dead
  campaignId?: string; // "all" | uuid
  ownership?: "all" | "locked" | "unlocked";
}

export interface ContactsQueryInput extends ContactsFilters {
  page: number;     // zero-indexed
  pageSize: number;
}

/**
 * Server-side paginated, filtered contacts query.
 * All filters apply at the database layer so we never load more rows than the page needs.
 */
export function useContacts(input: ContactsQueryInput) {
  return useQuery({
    queryKey: ["contacts", input],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { page, pageSize, search, status, campaignId, ownership } = input;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // Pre-resolve campaign membership so we apply it as `IN (...)`
      let allowedContactIds: string[] | null = null;
      if (campaignId && campaignId !== "all") {
        const { data: links } = await supabase
          .from("campaign_contacts")
          .select("contact_id")
          .eq("campaign_id", campaignId)
          .limit(10000);
        allowedContactIds = (links || []).map((l) => l.contact_id);
        if (allowedContactIds.length === 0) {
          return { rows: [] as ContactRow[], totalCount: 0 };
        }
      }

      const applyFilters = (q: any) => {
        let chain = q;
        if (search?.trim()) {
          const s = search.trim().replace(/[,()]/g, " ");
          chain = chain.or(
            `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`
          );
        }
        if (status && status !== "all") chain = chain.eq("lead_status", status);
        if (ownership === "locked") chain = chain.not("locked_to_agent_id", "is", null);
        if (ownership === "unlocked") chain = chain.is("locked_to_agent_id", null);
        if (allowedContactIds) chain = chain.in("id", allowedContactIds);
        return chain;
      };

      const dataQuery = applyFilters(
        supabase.from("contacts").select("*").order("created_at", { ascending: false }).range(from, to)
      );
      const countQuery = applyFilters(
        supabase.from("contacts").select("id", { count: "exact", head: true })
      );

      const [dataRes, countRes] = await Promise.all([dataQuery, countQuery]);
      if (dataRes.error) throw dataRes.error;
      if (countRes.error) throw countRes.error;

      return {
        rows: (dataRes.data || []) as ContactRow[],
        totalCount: countRes.count ?? 0,
      };
    },
  });
}

/**
 * Per-page operational data: attempts, last call, and next pending callback.
 * Keyed by the visible contact ids so filters never balloon the payload.
 */
export function useContactOps(contactIds: string[]) {
  return useQuery({
    enabled: contactIds.length > 0,
    queryKey: ["contact-ops", [...contactIds].sort()],
    queryFn: async () => {
      const [ccRes, cbRes] = await Promise.all([
        supabase
          .from("campaign_contacts")
          .select("contact_id, attempts, last_called_at")
          .in("contact_id", contactIds),
        supabase
          .from("callbacks")
          .select("contact_id, callback_at")
          .in("contact_id", contactIds)
          .eq("status", "pending")
          .order("callback_at", { ascending: true }),
      ]);

      const ops: Record<
        string,
        { attempts: number; last_called_at: string | null; next_callback_at: string | null }
      > = {};
      for (const row of ccRes.data || []) {
        const existing = ops[row.contact_id];
        ops[row.contact_id] = {
          attempts: Math.max(existing?.attempts ?? 0, row.attempts ?? 0),
          last_called_at:
            !existing?.last_called_at ||
            (row.last_called_at && row.last_called_at > existing.last_called_at)
              ? row.last_called_at
              : existing.last_called_at,
          next_callback_at: existing?.next_callback_at ?? null,
        };
      }
      for (const cb of cbRes.data || []) {
        if (!ops[cb.contact_id]) {
          ops[cb.contact_id] = { attempts: 0, last_called_at: null, next_callback_at: cb.callback_at };
        } else if (!ops[cb.contact_id].next_callback_at) {
          ops[cb.contact_id].next_callback_at = cb.callback_at;
        }
      }
      return ops;
    },
  });
}