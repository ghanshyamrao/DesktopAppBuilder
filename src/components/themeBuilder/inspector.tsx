import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------- Section ---------- */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4 border-b border-border last:border-b-0">
      <div className="text-2xs uppercase tracking-[0.14em] text-text-muted mb-3 font-semibold">{title}</div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/* ---------- Row ---------- */
export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[11.5px] text-text-secondary">{label}</span>
        {hint && <span className="text-2xs text-text-muted font-mono">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Segmented control ---------- */
interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex items-center bg-white/[0.04] border border-border rounded-md p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 h-7 px-2 text-[11px] font-medium rounded transition truncate",
            value === o.value
              ? "bg-bg-elev text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Slider ---------- */
export function Slider({
  value, min, max, step = 1, onChange,
}: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 appearance-none rounded-full bg-white/[0.06] outline-none cursor-pointer
                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue
                 [&::-webkit-slider-thumb]:shadow-glow [&::-webkit-slider-thumb]:cursor-grab
                 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-panel"
    />
  );
}

/* ---------- Color swatch ---------- */
export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2.5 group cursor-pointer">
      <span className="relative w-7 h-7 rounded-md border border-border overflow-hidden shrink-0 shadow-elev">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </span>
      <div className="flex-1 min-w-0">
        {label && <div className="text-[11px] text-text-secondary truncate">{label}</div>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full bg-transparent text-[11px] font-mono text-text-primary outline-none focus:text-accent-blue truncate"
        />
      </div>
    </label>
  );
}

function normalizeHex(v: string): string {
  // Native color input only accepts #rrggbb.
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const m = v.slice(1);
    return "#" + [...m].map((c) => c + c).join("");
  }
  return "#000000";
}
