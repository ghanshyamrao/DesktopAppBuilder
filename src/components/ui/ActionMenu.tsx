import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  /** Stable key — also used as the disabled tooltip's anchor. */
  key: string;
  /** Visible label. */
  label: ReactNode;
  /** Optional left icon. */
  icon?: ReactNode;
  /** Click handler. Skipped (and grayed) when `disabled`. */
  onSelect?: () => void;
  /** Tooltip / aria reason for the disabled state. */
  disabled?: boolean;
  /** Treat as destructive — uses red accent. */
  danger?: boolean;
  /** Keyboard hint shown right-aligned (e.g. "⌘B"). */
  shortcut?: string;
}

interface Props {
  items: ActionMenuItem[];
  /** Optional override for the trigger glyph — defaults to "…" */
  trigger?: ReactNode;
  /** Aria label for the trigger button. */
  label?: string;
  /** Side preference for the popup. */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment along the trigger's edge. */
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * Compact "…" action menu. Wrapper around Radix DropdownMenu so it picks up
 * keyboard nav, focus management, and outside-click for free.
 *
 * Items can include a `key` for separators (`{ key: "—", label: "" }`) — any
 * item with an empty label renders as a divider instead of a row.
 */
export function ActionMenu({
  items,
  trigger,
  label = "Actions",
  side = "bottom",
  align = "end",
  className,
}: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-bg-card text-text-secondary",
            "hover:text-text-primary hover:border-border-strong hover:bg-white/[0.04] transition",
            "data-[state=open]:bg-white/[0.06] data-[state=open]:text-text-primary",
            className,
          )}
        >
          {trigger ?? <MoreHorizontal size={15} />}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-[100] min-w-[200px] rounded-lg border border-border bg-bg-panel/95 backdrop-blur-xl",
            "shadow-elev p-1 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          {items.map((item) => {
            // Empty-label entries render as a divider.
            if (!item.label) {
              return <DropdownMenu.Separator key={item.key} className="h-px bg-border my-1" />;
            }
            return (
              <DropdownMenu.Item
                key={item.key}
                disabled={item.disabled}
                onSelect={(e) => {
                  if (item.disabled) { e.preventDefault(); return; }
                  item.onSelect?.();
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 cursor-default outline-none transition",
                  "data-[highlighted]:bg-white/[0.06]",
                  item.danger
                    ? "text-accent-red data-[highlighted]:bg-accent-red/10"
                    : "text-text-primary",
                  item.disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                {item.icon && <span className="shrink-0 w-4 inline-flex justify-center">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="text-2xs text-text-muted font-mono">{item.shortcut}</span>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
