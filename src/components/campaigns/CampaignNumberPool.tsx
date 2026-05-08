import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Phone } from "lucide-react";
import { toast } from "sonner";
import { normalizePhoneToE164, formatPhoneDisplay } from "@/lib/phone";
import { format } from "date-fns";

interface Props {
  campaignId: string;
}

interface NumberRow {
  id: string;
  campaign_id: string;
  phone_number: string;
  area_code: string;
  is_active: boolean;
  health_score: number;
  created_at: string;
}

function extractAreaCode(e164: string): string {
  // Strip leading "+1" for US, otherwise take 3 digits after the country code.
  const digits = e164.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 4);
  return digits.slice(-10, -7);
}

export default function CampaignNumberPool({ campaignId }: Props) {
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_phone_numbers" as any)
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as unknown as NumberRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (campaignId) fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const handleAdd = async () => {
    const norm = normalizePhoneToE164(phoneInput);
    if (!norm.valid) {
      toast.error(norm.error || "Invalid phone number");
      return;
    }
    const area = extractAreaCode(norm.e164);
    if (area.length !== 3) {
      toast.error("Could not determine area code");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("campaign_phone_numbers" as any).insert({
      campaign_id: campaignId,
      phone_number: norm.e164,
      area_code: area,
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Phone number added");
    setPhoneInput("");
    setDialogOpen(false);
    fetchRows();
  };

  const toggleActive = async (row: NumberRow, next: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)));
    const { error } = await supabase
      .from("campaign_phone_numbers" as any)
      .update({ is_active: next } as any)
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      fetchRows();
    }
  };

  const removeRow = async (row: NumberRow) => {
    if (!confirm(`Remove ${formatPhoneDisplay(row.phone_number)} from the pool?`)) return;
    const { error } = await supabase
      .from("campaign_phone_numbers" as any)
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Phone number removed");
    fetchRows();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="w-5 h-5" /> Number Pool ({rows.length})
        </CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Number
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No phone numbers in this pool yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone Number</TableHead>
                <TableHead>Area Code</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Added</TableHead>
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
                    <Badge
                      variant={
                        row.health_score >= 70
                          ? "default"
                          : row.health_score >= 40
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {row.health_score}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(v) => toggleActive(row, v)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(row.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeRow(row)}
                      aria-label="Remove number"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pool-phone">Phone Number</Label>
              <Input
                id="pool-phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="(555) 123-4567"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Area code will be auto-extracted from the number.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !phoneInput.trim()}>
              {saving ? "Adding…" : "Add Number"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}