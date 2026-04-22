import { CONTACT_FIELDS, ColumnMapping } from "@/lib/csv-import";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check } from "lucide-react";

interface Props {
  csvHeaders: string[];
  mapping: ColumnMapping;
  previewRows: Record<string, string>[];
  onMappingChange: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ColumnMapper({ csvHeaders, mapping, previewRows, onMappingChange, onConfirm, onCancel }: Props) {
  const usedFields = new Set(Object.values(mapping).filter(Boolean));
  const requiredFields = CONTACT_FIELDS.filter((f) => f.required);
  const allRequiredMapped = requiredFields.every((f) => usedFields.has(f.key));

  const updateMapping = (csvHeader: string, fieldKey: string) => {
    const next = { ...mapping };
    if (fieldKey === "__skip__") {
      delete next[csvHeader];
    } else {
      // Remove any other header mapped to this field
      for (const [k, v] of Object.entries(next)) {
        if (v === fieldKey) delete next[k];
      }
      next[csvHeader] = fieldKey;
    }
    onMappingChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Map CSV Columns</CardTitle>
        <p className="text-sm text-muted-foreground">
          Match your CSV columns to contact fields. Required fields are marked with *.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {csvHeaders.map((header) => (
            <div key={header} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
              <div className="w-1/3 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{header}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {previewRows[0]?.[header] || "—"}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="w-1/3">
                <Select
                  value={mapping[header] || "__skip__"}
                  onValueChange={(v) => updateMapping(header, v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">— Skip —</SelectItem>
                    {CONTACT_FIELDS.map((f) => (
                      <SelectItem
                        key={f.key}
                        value={f.key}
                        disabled={usedFields.has(f.key) && mapping[header] !== f.key}
                      >
                        {f.label}{f.required ? " *" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-6 shrink-0">
                {mapping[header] && <Check className="w-4 h-4 text-primary" />}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {requiredFields.map((f) => (
            <Badge
              key={f.key}
              variant={usedFields.has(f.key) ? "default" : "destructive"}
              className="text-xs"
            >
              {f.label} {usedFields.has(f.key) ? "✓" : "missing"}
            </Badge>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!allRequiredMapped}>
            Start Import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
