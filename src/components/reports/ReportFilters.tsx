import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DateRange = { from: Date; to: Date };

export const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

export function rangeFromPreset(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  if (days === 0) {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - days);
  }
  return { from, to };
}

interface Props {
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
  campaigns?: { id: string; name: string }[];
  selectedCampaign?: string;
  onCampaignChange?: (id: string) => void;
  onExport?: () => void;
  exportLabel?: string;
  rightSlot?: React.ReactNode;
}

export function ReportFilters({
  range,
  onRangeChange,
  campaigns,
  selectedCampaign,
  onCampaignChange,
  onExport,
  exportLabel = "Export CSV",
  rightSlot,
}: Props) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            onClick={() => onRangeChange(rangeFromPreset(p.days))}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Popover open={openFrom} onOpenChange={setOpenFrom}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("font-normal", !range.from && "text-muted-foreground")}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            {format(range.from, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={range.from}
            onSelect={(d) => {
              if (d) onRangeChange({ ...range, from: d });
              setOpenFrom(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-sm">to</span>
      <Popover open={openTo} onOpenChange={setOpenTo}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="font-normal">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {format(range.to, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={range.to}
            onSelect={(d) => {
              if (d) onRangeChange({ ...range, to: d });
              setOpenTo(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {campaigns && onCampaignChange && (
        <Select value={selectedCampaign ?? "all"} onValueChange={onCampaignChange}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {rightSlot}

      {onExport && (
        <Button variant="outline" size="sm" onClick={onExport} className="ml-auto">
          <Download className="w-4 h-4 mr-2" />
          {exportLabel}
        </Button>
      )}
    </div>
  );
}