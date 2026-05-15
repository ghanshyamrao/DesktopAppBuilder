import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: "sm" | "md";
  active?: boolean;
  tone?: "default" | "accent" | "danger";
}

const sizes = {
  sm: "h-7 w-7 rounded-md",
  md: "h-8 w-8 rounded-lg",
};

const tones = {
  default: "text-text-secondary hover:text-text-primary hover:bg-white/[0.06]",
  accent:  "text-accent-blue hover:bg-accent-blue/10",
  danger:  "text-text-secondary hover:text-accent-red hover:bg-accent-red/10",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, size = "md", active, tone = "default", className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "no-drag inline-flex items-center justify-center transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 disabled:opacity-40 disabled:cursor-not-allowed",
        sizes[size],
        tones[tone],
        active && "bg-white/[0.08] text-text-primary",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
