import { cn } from "@/lib/utils";

export function Switch({
  checked, onChange, disabled, size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const w = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const dot = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const trans = size === "sm" ? "translate-x-3" : "translate-x-4";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "no-drag relative inline-flex shrink-0 items-center rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 disabled:opacity-40 disabled:cursor-not-allowed",
        w,
        checked
          ? "bg-gradient-to-r from-accent-blue to-accent-violet shadow-glow"
          : "bg-white/[0.08] border border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 left-0.5 rounded-full bg-white shadow-sm transition-transform",
          dot,
          checked && trans,
        )}
      />
    </button>
  );
}
