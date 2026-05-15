import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SubNavEntry<K extends string> {
  /** Stable, type-safe key. Drives both selection and React list keys. */
  key: K;
  /** Visible label. */
  label: string;
  /** Left-aligned glyph (16px Lucide icons fit best). */
  icon: ReactNode;
}

interface Props<K extends string> {
  entries: readonly SubNavEntry<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Header text above the list. Defaults to "Sections". */
  title?: string;
}

/**
 * Generic vertical section nav used inside Studio pages (App Studio,
 * Action Builder, …). Sticky to top so it stays put while the active
 * section's content scrolls. The active item gets the accent-blue
 * treatment; the rest are subtle.
 *
 * Generic over a string-literal `K` so each page can declare its own
 * section enum and get type-safe `onChange` callbacks at the call site.
 */
export function SubSidebar<K extends string>({ entries, active, onChange, title = "Sections" }: Props<K>) {
  return (
    <nav className="sticky top-4 self-start space-y-0.5">
      <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-2 px-2">{title}</div>
      {entries.map((entry) => {
        const isActive = entry.key === active;
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onChange(entry.key)}
            className={cn(
              "w-full px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2.5 transition text-left",
              isActive
                ? "bg-accent-blue/10 border border-accent-blue/30 text-accent-blue"
                : "border border-transparent text-text-secondary hover:text-text-primary hover:bg-white/[0.04]",
            )}
          >
            <span className={cn("shrink-0 w-4 inline-flex justify-center", isActive && "text-accent-blue")}>
              {entry.icon}
            </span>
            <span className="truncate">{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
