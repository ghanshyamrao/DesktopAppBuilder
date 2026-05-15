import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "blue" | "violet" | "green";
  interactive?: boolean;
}

const tones = {
  default: "",
  blue:    "shadow-glow",
  violet:  "shadow-glow-violet",
  green:   "shadow-glow-green",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { tone = "default", interactive, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "glass rounded-xl",
        tones[tone],
        interactive && "transition hover:bg-white/[0.05] hover:border-border-strong cursor-pointer",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
