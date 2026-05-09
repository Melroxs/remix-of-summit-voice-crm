import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";

export default function ClientNotesTab({ clientId, companyId }: { clientId: string; companyId: string | null }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: notes } = useQuery({
    queryKey: ["client_notes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Note is empty");
      const { error } = await supabase.from("client_notes").insert({
        client_id: clientId,
        company_id: companyId,
        author_id: user?.id,
        author_name: profile?.display_name || profile?.email || "Unknown",
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["client_notes", clientId] });
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note about this client..."
          rows={3}
        />
        <div className="flex justify-end">
          <Button onClick={() => add.mutate()} disabled={add.isPending || !body.trim()}>
            {add.isPending ? "Saving..." : "Add note"}
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {(notes?.length ?? 0) === 0 && (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No notes yet.
          </Card>
        )}
        {notes?.map((n) => (
          <Card key={n.id} className="p-4">
            <div className="text-xs text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{n.author_name || "Unknown"}</span>
              {" • "}
              {new Date(n.created_at).toLocaleString()}
            </div>
            <p className="text-sm whitespace-pre-wrap">{n.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}