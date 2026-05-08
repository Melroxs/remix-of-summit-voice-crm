import { CONTACT_FIELDS, ColumnMapping, isCustomField, customFieldName, makeCustomFieldKey, CUSTOM_FIELD_PREFIX } from "@/lib/csv-import";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

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
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const requiredFields = CONTACT_FIELDS.filter((f) => f.required);
  const allRequiredMapped = requiredFields.every((f) => usedFields.has(f.key));

  const updateMapping = (csvHeader: string, fieldKey: string) => {
    const next = { ...mapping };
    if (fieldKey === "__skip__") {
      delete next[csvHeader];
    } else if (fieldKey === "__custom__") {
      // user picked "Custom field" — switch to draft input mode
      setCustomDraft((d) => ({ ...d, [csvHeader]: d[csvHeader] ?? csvHeader }));
      delete next[csvHeader];
    } else {
      // Remove any other header mapped to this field
      for (const [k, v] of Object.entries(next)) {
        if (v === fieldKey) delete next[k];
      }
      next[csvHeader] = fieldKey;
      setCustomDraft((d) => {
        const { [csvHeader]: _, ...rest } = d;
        return rest;
      });
    }
    onMappingChange(next);
  };

  const commitCustomField = (csvHeader: string) => {
    const name = (customDraft[csvHeader] || "").trim();
    if (!name) return;
    const key = makeCustomFieldKey(name);
    const next = { ...mapping, [csvHeader]: key };
    onMappingChange(next);
    setCustomDraft((d) => {
      const { [csvHeader]: _, ...rest } = d;
      return rest;
    });
  };

  const cancelCustomField = (csvHeader: string) => {
    setCustomDraft((d) => {
      const { [csvHeader]: _, ...rest } = d;
      return rest;
    });
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
              <div className="flex-1 min-w-0">
                {customDraft[header] !== undefined ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={customDraft[header]}
                      onChange={(e) =>
                        setCustomDraft((d) => ({ ...d, [header]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitCustomField(header);
                        if (e.key === "Escape") cancelCustomField(header);
                      }}
                      placeholder="custom field name"
                      className="h-8 text-sm"
                    />
                    <Button size="sm" variant="default" className="h-8" onClick={() => commitCustomField(header)}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => cancelCustomField(header)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                <Select
                    value={mapping[header] || "__skip__"}
                  onValueChange={(v) => updateMapping(header, v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">— Skip —</SelectItem>
                      <SelectItem value="__custom__">+ Add custom field…</SelectItem>
                      {mapping[header] && isCustomField(mapping[header]) && (
                        <SelectItem value={mapping[header]}>
                          ✦ {customFieldName(mapping[header])} (custom)
                        </SelectItem>
                      )}
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
                )}
              </div>
              <div className="w-6 shrink-0">
                {mapping[header] && (
                  isCustomField(mapping[header])
                    ? <Sparkles className="w-4 h-4 text-primary" />
                    : <Check className="w-4 h-4 text-primary" />
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: pick <span className="font-medium">+ Add custom field…</span> to map a column to a brand-new field that's specific to this CSV. It'll be stored on the contact under a custom-fields bag.
        </p>

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
