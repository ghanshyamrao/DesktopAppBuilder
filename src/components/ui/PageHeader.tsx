import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-6 px-8 pt-7 pb-5", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-2xs uppercase tracking-[0.16em] text-text-muted mb-2">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight font-display">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
