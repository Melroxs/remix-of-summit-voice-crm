import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { Search } from "lucide-react";

export default function Clients() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["clients", q],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, first_name, last_name, phone_e164, email, address, city, state, status, created_at, job_cards(id, status, job_number, created_at)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) {
        const s = q.trim();
        query = query.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%,address.ilike.%${s}%`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        subtitle="Client profiles auto-generated from booked appointments"
      />

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, email, address..."
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">Address</th>
                <th className="text-left p-3">Job Cards</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No clients yet — book an appointment to create one.</td></tr>
              )}
              {data?.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3">
                    <Link to={`/clients/${c.id}`} className="font-medium text-primary hover:underline">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"}
                    </Link>
                  </td>
                  <td className="p-3">{c.phone_e164 || "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {[c.address, c.city, c.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="p-3">{c.job_cards?.length ?? 0}</td>
                  <td className="p-3">
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}