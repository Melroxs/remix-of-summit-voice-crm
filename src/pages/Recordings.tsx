import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Disc3, Search } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@/components/reports/EmptyState";
import { RecordingPlayer } from "@/components/dialer/RecordingPlayer";

interface Row {
  id: string;
  recording_url: string | null;
  download_url: string | null;
  duration_seconds: number | null;
  status: string | null;
  created_at: string;
  available_at: string | null;
  lead_name: string;
  lead_phone: string | null;
  agent_name: string;
  to_number: string | null;
}

export default function Recordings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: recs } = await supabase
        .from("call_recordings")
        .select("id, recording_url, download_url, duration_seconds, status, created_at, available_at, lead_id, agent_id, call_session_id")
        .eq("status", "available")
        .order("created_at", { ascending: false })
        .limit(500);

      const list = recs || [];
      const leadIds = Array.from(new Set(list.map((r: any) => r.lead_id).filter(Boolean)));
      const agentIds = Array.from(new Set(list.map((r: any) => r.agent_id).filter(Boolean)));
      const sessionIds = Array.from(new Set(list.map((r: any) => r.call_session_id).filter(Boolean)));

      const [contactsRes, profilesRes, sessionsRes] = await Promise.all([
        leadIds.length
          ? supabase.from("contacts").select("id, first_name, last_name, phone_e164").in("id", leadIds)
          : Promise.resolve({ data: [] as any[] }),
        agentIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", agentIds)
          : Promise.resolve({ data: [] as any[] }),
        sessionIds.length
          ? supabase.from("call_sessions").select("id, to_number").in("id", sessionIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const contactMap = new Map((contactsRes.data || []).map((c: any) => [c.id, c]));
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const sessionMap = new Map((sessionsRes.data || []).map((s: any) => [s.id, s]));

      const mapped: Row[] = list.map((r: any) => {
        const c = r.lead_id ? contactMap.get(r.lead_id) : null;
        const p = r.agent_id ? profileMap.get(r.agent_id) : null;
        const s = r.call_session_id ? sessionMap.get(r.call_session_id) : null;
        return {
          id: r.id,
          recording_url: r.recording_url,
          download_url: r.download_url,
          duration_seconds: r.duration_seconds,
          status: r.status,
          created_at: r.created_at,
          available_at: r.available_at,
          lead_name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unknown" : "Unknown",
          lead_phone: c?.phone_e164 ?? s?.to_number ?? null,
          agent_name: p?.display_name || p?.email?.split("@")[0] || "—",
          to_number: s?.to_number ?? null,
        };
      });

      setRows(mapped);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.lead_name.toLowerCase().includes(s) ||
        (r.lead_phone || "").toLowerCase().includes(s) ||
        (r.to_number || "").toLowerCase().includes(s) ||
        r.agent_name.toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Recordings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {loading ? "Loading…" : `${filtered.length} of ${rows.length} available recordings`}
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lead name, phone, or agent"
          className="pl-9 h-9"
        />
      </div>

      <Card>
        <CardContent className="py-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Disc3}
              title="No recordings"
              description="Recordings will appear here once calls are completed and processed."
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div key={r.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{r.lead_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.lead_phone || "—"} • {r.agent_name} •{" "}
                        {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                  <RecordingPlayer recording={r} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}