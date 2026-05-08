import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollText, Loader2 } from "lucide-react";

interface Props {
  campaignId: string | null;
  firstName: string | null;
}

interface ScriptRow {
  id: string;
  title: string;
  body: string;
  sort_order: number;
}

function interpolate(body: string, firstName: string | null) {
  return body.replace(/\{\{\s*first_name\s*\}\}/gi, firstName?.trim() || "there");
}

export default function ScriptDrawer({ campaignId, firstName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<ScriptRow[]>([]);

  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("campaign_scripts")
        .select("id, title, body, sort_order")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true });
      if (!cancelled) {
        if (error) {
          console.error("[ScriptDrawer] load error", error);
          setScripts([]);
        } else {
          setScripts((data ?? []) as ScriptRow[]);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, campaignId]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="fixed bottom-6 right-6 z-40 shadow-lg rounded-full px-5 gap-2"
        >
          <ScrollText className="w-4 h-4" />
          Script
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[90vw] sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            Campaign Script
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!campaignId ? (
            <p className="text-sm text-muted-foreground">
              Select a campaign to view its script.
            </p>
          ) : loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No script available for this campaign.
            </p>
          ) : (
            scripts.map((s) => (
              <div key={s.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {interpolate(s.body, firstName)}
                </p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}