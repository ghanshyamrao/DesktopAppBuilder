import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded",
        "text-[10px] font-mono font-medium text-text-secondary",
        "bg-white/[0.05] border border-border shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
