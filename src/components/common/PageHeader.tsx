import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header — used at the top of every page so the
 * type scale, spacing, and action layout stay consistent.
 */
export function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="page-header-title truncate">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}