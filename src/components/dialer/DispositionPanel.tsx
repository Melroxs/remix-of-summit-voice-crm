import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  disabled: boolean;
  onDispose: (code: string) => void;
}

const fallbackDispositions = [
  { code: "no_answer", label: "No Answer", color: "bg-muted text-muted-foreground" },
  { code: "voicemail", label: "Voicemail", color: "bg-muted text-muted-foreground" },
  { code: "wrong_number", label: "Wrong Number", color: "bg-destructive/10 text-destructive" },
  { code: "dnc", label: "DNC", color: "bg-destructive/10 text-destructive" },
  { code: "not_interested", label: "Not Interested", color: "bg-warning/10 text-warning" },
  { code: "callback", label: "Call Back", color: "bg-primary/10 text-primary" },
  { code: "appointment_booked", label: "Appointment Booked", color: "bg-green-500/10 text-green-400" },
  { code: "have_solar", label: "Have Solar", color: "bg-muted text-muted-foreground" },
];

const colorMap: Record<string, string> = {
  no_answer: "bg-muted text-muted-foreground",
  voicemail: "bg-muted text-muted-foreground",
  wrong_number: "bg-destructive/10 text-destructive",
  dnc: "bg-destructive/10 text-destructive",
  not_interested: "bg-warning/10 text-warning",
  callback: "bg-primary/10 text-primary",
  appointment_booked: "bg-green-500/10 text-green-400",
  have_solar: "bg-muted text-muted-foreground",
};

export default function DispositionPanel({ disabled, onDispose }: Props) {
  const [dispositions, setDispositions] = useState(fallbackDispositions);

  useEffect(() => {
    supabase
      .from("dispositions")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setDispositions(
            data.map((d) => ({
              code: d.code,
              label: d.label,
              color: colorMap[d.code] || "bg-muted text-muted-foreground",
            }))
          );
        }
      });
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Disposition</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {dispositions.map((d) => (
            <Button
              key={d.code}
              variant="outline"
              size="sm"
              className={`justify-start text-xs ${d.color}`}
              disabled={disabled}
              onClick={() => onDispose(d.code)}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
