import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delay?: number;
  shortcut?: string;
  children: ReactNode;
}

export function Tooltip({ content, side = "right", align = "center", delay = 200, shortcut, children }: TooltipProps) {
  return (
    <RT.Provider delayDuration={delay}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            align={align}
            sideOffset={8}
            className={cn(
              "z-50 px-2.5 py-1.5 rounded-md text-xs",
              "bg-bg-elev/95 backdrop-blur-md border border-border-strong shadow-elev",
              "text-text-primary animate-fade-in",
            )}
          >
            <span className="flex items-center gap-2">
              <span>{content}</span>
              {shortcut && (
                <kbd className="text-[10px] font-mono text-text-secondary bg-white/[0.06] border border-border rounded px-1.5 py-0.5">
                  {shortcut}
                </kbd>
              )}
            </span>
            <RT.Arrow className="fill-bg-elev" />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
