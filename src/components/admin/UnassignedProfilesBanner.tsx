import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Admin-only banner that appears whenever there are profiles without a
 * `company_id`. Lets the admin pick a company and one-click reassign all of
 * them so they pass company-scoped RLS policies.
 */
export default function UnassignedProfilesBanner() {
  const { isAdmin, companies, activeCompanyId } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    const { count: c } = await supabase
      .from("profiles")
      .select("user_id", { head: true, count: "exact" })
      .is("company_id", null);
    setCount(c ?? 0);
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!targetId && (activeCompanyId || companies[0]?.id)) {
      setTargetId(activeCompanyId || companies[0].id);
    }
  }, [activeCompanyId, companies, targetId]);

  if (!isAdmin || count === null || count === 0) return null;

  const target = companies.find((c) => c.id === targetId);

  const reassign = async () => {
    if (!targetId) {
      toast({ title: "Pick a company first", variant: "destructive" });
      return;
    }
    setWorking(true);
    const previousCount = count;
    const { error } = await supabase
      .from("profiles")
      .update({ company_id: targetId } as never)
      .is("company_id", null);
    setWorking(false);
    if (error) {
      toast({ title: "Reassign failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Profiles reassigned",
      description: `${previousCount} user${previousCount === 1 ? "" : "s"} moved to ${target?.name ?? "company"}.`,
    });
    await refresh();
  };

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <AlertTriangle className="w-4 h-4 text-amber-500" />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm">
          <strong>{count}</strong> {count === 1 ? "user has" : "users have"} no company assigned and will fail company-scoped permissions.
        </span>
        <div className="flex items-center gap-2">
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Choose company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={reassign} disabled={working || !targetId}>
            {working ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Reassign all
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}