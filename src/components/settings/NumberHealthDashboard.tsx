import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, Shield, ShieldAlert, ShieldOff, Snowflake, ThermometerSun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCampaignNumberHealth, NumberHealth } from "@/lib/number-health";
import { formatPhoneDisplay } from "@/lib/phone";

const healthIcons: Record<string, any> = {
  healthy: Shield,
  warm: ThermometerSun,
  fatigued: ShieldAlert,
  cooling_down: Snowflake,
  blocked: ShieldOff,
};

const healthColors: Record<string, string> = {
  healthy: "text-green-400 border-green-400/30",
  warm: "text-amber-400 border-amber-400/30",
  fatigued: "text-orange-400 border-orange-400/30",
  cooling_down: "text-blue-400 border-blue-400/30",
  blocked: "text-destructive border-destructive/30",
};

export default function NumberHealthDashboard() {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [health, setHealth] = useState<NumberHealth[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("campaigns")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCampaigns(data || []));
  }, []);

  useEffect(() => {
    if (!selectedCampaign) { setHealth([]); return; }
    loadHealth();
  }, [selectedCampaign]);

  const loadHealth = async () => {
    if (!selectedCampaign) return;
    setLoading(true);
    const data = await getCampaignNumberHealth(selectedCampaign);
    setHealth(data);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Number Health Dashboard</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedCampaign || "__none__"}
            onValueChange={(v) => setSelectedCampaign(v === "__none__" ? null : v)}
          >
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCampaign && (
            <Button variant="ghost" size="icon" onClick={loadHealth} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!selectedCampaign ? (
          <p className="text-muted-foreground text-sm">Select a campaign to view number health.</p>
        ) : health.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading..." : "No outbound numbers configured for this campaign."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Calls/Hour</TableHead>
                <TableHead>Calls/Day</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Answer %</TableHead>
                <TableHead>Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.map((h) => {
                const Icon = healthIcons[h.healthStatus] || Shield;
                return (
                  <TableRow key={h.phoneNumberId}>
                    <TableCell className="font-mono text-sm">{formatPhoneDisplay(h.phoneNumber)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs capitalize ${healthColors[h.healthStatus] || ""}`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {h.healthStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{h.callsToday}</TableCell>
                    <TableCell>{h.totalCalls}</TableCell>
                    <TableCell>{h.answerRate}%</TableCell>
                    <TableCell>
                      <span className={h.isAvailable ? "text-green-400" : "text-destructive"}>
                        {h.isAvailable ? "Yes" : "No"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
