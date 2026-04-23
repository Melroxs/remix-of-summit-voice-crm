import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  accent?: "default" | "success" | "warning" | "destructive" | "primary";
  loading?: boolean;
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  primary: "text-primary",
};

export function StatCard({ label, value, icon: Icon, hint, accent = "default", loading }: Props) {
  return (
    <Card className="stat-card border-border/70">
      <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-0">
        <CardTitle className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={cn("w-4 h-4", ACCENT[accent])} aria-hidden />
      </CardHeader>
      <CardContent className="p-0 pt-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-[28px] leading-none font-bold text-foreground tabular-nums font-display">
            {value}
          </div>
        )}
        {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}