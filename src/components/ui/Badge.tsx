import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "blue" | "violet" | "green" | "amber" | "red" | "muted";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}

const tones: Record<Tone, string> = {
  default: "bg-white/[0.06] text-text-primary border-border",
  muted:   "bg-transparent text-text-secondary border-border",
  blue:    "bg-accent-blue/10 text-accent-blue border-accent-blue/25",
  violet:  "bg-accent-violet/10 text-accent-violet border-accent-violet/25",
  green:   "bg-accent-green/10 text-accent-green border-accent-green/25",
  amber:   "bg-accent-amber/10 text-accent-amber border-accent-amber/25",
  red:     "bg-accent-red/10 text-accent-red border-accent-red/25",
};

const dotTones: Record<Tone, string> = {
  default: "bg-text-secondary",
  muted:   "bg-text-muted",
  blue:    "bg-accent-blue",
  violet:  "bg-accent-violet",
  green:   "bg-accent-green",
  amber:   "bg-accent-amber",
  red:     "bg-accent-red",
};

export function Badge({ tone = "default", dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium border",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse-soft", dotTones[tone])} />}
      {children}
    </span>
  );
}
