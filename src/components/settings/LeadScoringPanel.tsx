import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rescoreCampaignContacts } from "@/lib/lead-scoring";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";

interface BandCount {
  band: string;
  count: number;
}

const bandColors: Record<string, string> = {
  hot: "bg-red-500/20 text-red-400 border-red-400/30",
  warm: "bg-amber-500/20 text-amber-400 border-amber-400/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-400/30",
  low: "bg-muted text-muted-foreground border-border",
  excluded: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function LeadScoringPanel() {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [bands, setBands] = useState<BandCount[]>([]);
  const [rescoring, setRescoring] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").order("name")
      .then(({ data }) => setCampaigns(data || []));
  }, []);

  useEffect(() => {
    if (selectedCampaign) loadBands();
    else setBands([]);
  }, [selectedCampaign]);

  const loadBands = async () => {
    if (!selectedCampaign) return;
    setLoading(true);
    // Count contacts per priority band
    const allBands = ["hot", "warm", "medium", "low", "excluded"];
    const counts = await Promise.all(
      allBands.map(async (band) => {
        const { count } = await supabase
          .from("campaign_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", selectedCampaign)
          .eq("priority_band", band as any);
        return { band, count: count || 0 };
      })
    );
    setBands(counts);
    setLoading(false);
  };

  const handleRescore = async () => {
    if (!selectedCampaign) return;
    setRescoring(true);
    try {
      await rescoreCampaignContacts(selectedCampaign);
      toast({ title: "Rescoring complete", description: "All pending leads have been re-scored." });
      await loadBands();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to rescore", variant: "destructive" });
    }
    setRescoring(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Lead Priority Distribution</CardTitle>
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
            <Button variant="outline" size="sm" onClick={handleRescore} disabled={rescoring}>
              <RefreshCw className={`h-4 w-4 mr-1 ${rescoring ? "animate-spin" : ""}`} />
              {rescoring ? "Scoring..." : "Rescore All"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!selectedCampaign ? (
          <p className="text-muted-foreground text-sm">Select a campaign to view lead priority distribution.</p>
        ) : loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {bands.map((b) => (
              <div key={b.band} className="text-center">
                <Badge variant="outline" className={`text-sm px-3 py-1 capitalize ${bandColors[b.band] || ""}`}>
                  {b.band}
                </Badge>
                <p className="text-lg font-bold text-foreground mt-1">{b.count}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
