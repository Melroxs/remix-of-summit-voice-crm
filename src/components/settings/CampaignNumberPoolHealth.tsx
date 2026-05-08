import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, Activity, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/lib/phone";
import { format } from "date-fns";

interface PoolNumber {
  id: string;
  campaign_id: string;
  phone_number: string;
  area_code: string;
  is_active: boolean;
  health_score: number;
  created_at: string;
}

function healthBarColor(score: number): string {
  if (score > 70) return "bg-green-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-destructive";
}

export default function CampaignNumberPoolHealth() {
  const [rows, setRows] = useState<PoolNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [flagTarget, setFlagTarget] = useState<PoolNumber | null>(null);
  const [auditTarget, setAuditTarget] = useState<PoolNumber | null>(null);
  const [auditCalls, setAuditCalls] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_phone_numbers" as any)
      .select("*")
      .order("health_score", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as unknown as PoolNumber[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFlagSpam = async () => {
    if (!flagTarget) return;
    const { error } = await supabase
      .from("campaign_phone_numbers" as any)
      .update({ is_active: false, health_score: 0 } as any)
      .eq("id", flagTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${formatPhoneDisplay(flagTarget.phone_number)} flagged as spam risk`);
    setRows((prev) =>
      prev.map((r) =>
        r.id === flagTarget.id ? { ...r, is_active: false, health_score: 0 } : r
      )
    );
    setFlagTarget(null);
  };

  const openAudit = async (row: PoolNumber) => {
    setAuditTarget(row);
    setAuditCalls(null);
    setAuditLoading(true);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("dialer_logs" as any)
      .select("id", { count: "exact", head: true })
      .eq("selected_number", row.phone_number)
      .gte("created_at", since);
    if (error) {
      toast.error(error.message);
      setAuditCalls(0);
    } else {
      setAuditCalls(count ?? 0);
    }
    setAuditLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Campaign Number Pool Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No campaign phone numbers configured.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Area</TableHead>
                <TableHead className="w-[220px]">Health</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">
                    {formatPhoneDisplay(row.phone_number)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.area_code}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={row.health_score}
                        className="h-2 w-32"
                        indicatorClassName={healthBarColor(row.health_score)}
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-8">
                        {row.health_score}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAudit(row)}
                    >
                      <Search className="w-3.5 h-3.5 mr-1" /> Audit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setFlagTarget(row)}
                    >
                      <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Flag as Spam Risk
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Confirm spam flag */}
      <AlertDialog open={!!flagTarget} onOpenChange={(o) => !o && setFlagTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flag number as spam risk?</AlertDialogTitle>
            <AlertDialogDescription>
              {flagTarget && (
                <>
                  This will deactivate{" "}
                  <span className="font-mono text-foreground">
                    {formatPhoneDisplay(flagTarget.phone_number)}
                  </span>{" "}
                  and reset its health score to 0. The number will no longer be used
                  for outbound calls.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFlagSpam}>
              Flag as Spam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Audit modal */}
      <Dialog
        open={!!auditTarget}
        onOpenChange={(o) => {
          if (!o) {
            setAuditTarget(null);
            setAuditCalls(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Number Audit
            </DialogTitle>
          </DialogHeader>
          {auditTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Number</span>
                <span className="font-mono">
                  {formatPhoneDisplay(auditTarget.phone_number)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Date added</span>
                <span>{format(new Date(auditTarget.created_at), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Calls (last 7 days)</span>
                <span>{auditLoading ? "…" : auditCalls ?? 0}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current health score</span>
                  <span>{auditTarget.health_score}</span>
                </div>
                <Progress
                  value={auditTarget.health_score}
                  className="h-2"
                  indicatorClassName={healthBarColor(auditTarget.health_score)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}