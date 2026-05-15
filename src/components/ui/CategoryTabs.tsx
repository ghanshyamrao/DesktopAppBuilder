import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CategoryTab<K extends string> {
  key: K;
  label: string;
  /** Optional count badge rendered to the right of the label. */
  count?: number;
  /** Optional icon. */
  icon?: ReactNode;
}

interface Props<K extends string> {
  tabs: readonly CategoryTab<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Optional content rendered on the right side of the tab strip
   *  (e.g. "17 ready-made" hint). */
  rightSlot?: ReactNode;
  className?: string;
}

/**
 * Horizontal tab strip used to filter big galleries (templates, recipes,
 * plugins). Generic over a string-literal `K` so each caller gets a
 * type-safe `onChange`.
 *
 * Supports an "All" tab idiomatically — just include `{ key: "all", label: "All" }`
 * in the tabs array; the parent decides what "all" means semantically.
 */
export function CategoryTabs<K extends string>({ tabs, active, onChange, rightSlot, className }: Props<K>) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border", className)}>
      <div className="flex items-center gap-1 overflow-x-auto -mb-px">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                "h-9 px-3 inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap transition relative",
                "border-b-2",
                isActive
                  ? "text-text-primary border-accent-blue"
                  : "text-text-secondary hover:text-text-primary border-transparent",
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className={cn(
                  "text-2xs font-mono tabular-nums px-1.5 rounded",
                  isActive ? "bg-accent-blue/15 text-accent-blue" : "bg-white/[0.05] text-text-muted",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}
