import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { Theme } from "@/lib/themes/types";
import { cn } from "@/lib/utils";

/**
 * Compact thumbnail of a preset theme — colored swatches plus name.
 * Click to apply the preset.
 */
export function PresetCard({
  theme,
  active,
  edited,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  /** Active preset whose values have been customized in the inspector. */
  edited?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative w-full text-left rounded-xl p-3 border transition group",
        active
          ? "bg-white/[0.06] border-accent-blue/50 shadow-glow"
          : "bg-bg-card/60 border-border hover:border-border-strong hover:bg-white/[0.04]",
      )}
    >
      {/* mini preview */}
      <div
        className="aspect-[16/10] rounded-lg overflow-hidden border mb-2.5 relative"
        style={{ background: theme.colors.bg, borderColor: theme.colors.border }}
      >
        {/* tiny title bar */}
        <div
          className="h-3.5 flex items-center px-1.5"
          style={{
            background: theme.colors.titlebar,
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <div className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full" style={{ background: theme.colors.lights.close }} />
            <span className="w-1 h-1 rounded-full" style={{ background: theme.colors.lights.min }} />
            <span className="w-1 h-1 rounded-full" style={{ background: theme.colors.lights.max }} />
          </div>
        </div>
        {/* sidebar + content */}
        <div className="absolute inset-x-0 bottom-0 top-3.5 flex">
          <div
            className="w-3"
            style={{ background: theme.colors.surface, borderRight: `1px solid ${theme.colors.border}` }}
          />
          <div className="flex-1 p-1 flex flex-col gap-1">
            <div
              className="h-1.5 rounded-sm"
              style={{
                background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.accent2})`,
                width: "60%",
              }}
            />
            <div className="h-1 rounded-sm w-full" style={{ background: theme.colors.surface }} />
            <div className="h-1 rounded-sm w-3/4" style={{ background: theme.colors.surface }} />
          </div>
        </div>
        {/* mesh tint */}
        {(theme.background === "mesh" || theme.background === "gradient") && (
          <div
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background: `radial-gradient(120% 60% at 100% 100%, ${theme.colors.accent}30 0%, transparent 60%)`,
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold truncate">{theme.name}</div>
          <div className="text-[10px] text-text-muted truncate">{theme.tagline}</div>
        </div>
        {/* swatch trio */}
        <div className="flex -space-x-1.5 shrink-0">
          <span className="w-3.5 h-3.5 rounded-full border border-bg-panel" style={{ background: theme.colors.accent }} />
          <span className="w-3.5 h-3.5 rounded-full border border-bg-panel" style={{ background: theme.colors.accent2 }} />
          <span className="w-3.5 h-3.5 rounded-full border border-bg-panel" style={{ background: theme.colors.surface }} />
        </div>
      </div>

      {active && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {edited && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-amber bg-accent-amber/15 border border-accent-amber/40 rounded px-1.5 py-0.5">
              edited
            </span>
          )}
          <div className="w-5 h-5 rounded-full bg-accent-blue text-white flex items-center justify-center shadow-glow">
            <Check size={12} strokeWidth={3} />
          </div>
        </div>
      )}
    </motion.button>
  );
}
