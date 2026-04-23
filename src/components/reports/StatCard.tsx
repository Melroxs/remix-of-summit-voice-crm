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
  success: "text-green-500",
  warning: "text-amber-500",
  destructive: "text-destructive",
  primary: "text-primary",
};

export function StatCard({ label, value, icon: Icon, hint, accent = "default", loading }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("w-4 h-4", ACCENT[accent])} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-2xl font-bold text-foreground">{value}</div>
        )}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}