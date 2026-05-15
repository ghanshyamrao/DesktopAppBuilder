import { motion } from "framer-motion";
import { Home, Search, Bell, Settings as SettingsIcon, Activity, Folder, Star, Plus } from "lucide-react";
import type { Theme } from "@/lib/themes/types";
import { themeToReactStyle } from "@/lib/themes/compile";
import { cn } from "@/lib/utils";

/**
 * A faithful styled mock of a built desktop app, driven entirely by CSS
 * variables from the current theme. Updates live as the user edits.
 */
export function PreviewWindow({ theme }: { theme: Theme }) {
  const style = themeToReactStyle(theme);
  const frame = theme.windowFrame;
  const hasMacLights = frame === "macos" || frame === "frameless";
  const hasWinControls = frame === "windows11" || frame === "unified";

  return (
    <motion.div
      key={theme.id}
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={style}
      className="rounded-xl overflow-hidden border border-border-strong shadow-elev"
    >
      {/* fake "browser-window" backdrop showing the rounded corners against the desktop */}
      <div
        className="relative aspect-[16/10] w-full"
        style={{
          background: "var(--w2a-bg)",
          color: "var(--w2a-text)",
          fontFamily: "var(--w2a-font)",
          borderRadius: "var(--w2a-radius-lg)",
          boxShadow: "var(--w2a-shadow)",
        }}
      >
        {/* canvas tint based on chosen background style */}
        <CanvasBackdrop background={theme.background} />

        {/* title bar */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex items-center px-3 z-10",
            frame === "windows11" ? "justify-between" : "justify-between",
          )}
          style={{
            height: "var(--w2a-titlebar-h)",
            background: "var(--w2a-titlebar)",
            backdropFilter: "blur(var(--w2a-blur))",
            WebkitBackdropFilter: "blur(var(--w2a-blur))",
            borderBottom: "1px solid var(--w2a-border)",
          }}
        >
          {hasMacLights ? <TrafficLights theme={theme} /> : <span className="w-12" />}
          <div className="text-[11px] font-medium opacity-70 truncate px-3">{theme.name} App</div>
          {hasWinControls ? <WinControls theme={theme} /> : <span className="w-12" />}
        </div>

        {/* body — sidebar + content */}
        <div
          className="absolute inset-x-0 bottom-0 flex"
          style={{ top: "var(--w2a-titlebar-h)" }}
        >
          {theme.sidebar !== "hidden" && <PreviewSidebar theme={theme} />}
          <PreviewContent theme={theme} />
        </div>
      </div>
    </motion.div>
  );
}

function TrafficLights({ theme }: { theme: Theme }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full" style={{ background: theme.colors.lights.close }} />
      <span className="w-3 h-3 rounded-full" style={{ background: theme.colors.lights.min }} />
      <span className="w-3 h-3 rounded-full" style={{ background: theme.colors.lights.max }} />
    </div>
  );
}

function WinControls({ theme }: { theme: Theme }) {
  return (
    <div className="flex items-center gap-3 text-xs opacity-70" style={{ color: theme.colors.text }}>
      <span>—</span>
      <span>▢</span>
      <span style={{ color: theme.colors.lights.close }}>×</span>
    </div>
  );
}

function CanvasBackdrop({ background }: { background: Theme["background"] }) {
  if (background === "solid") return null;
  if (background === "mesh") {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 40% at 10% -10%, color-mix(in srgb, var(--w2a-accent-2) 22%, transparent) 0%, transparent 60%), " +
            "radial-gradient(45% 35% at 100% 0%, color-mix(in srgb, var(--w2a-accent) 16%, transparent) 0%, transparent 60%), " +
            "radial-gradient(50% 45% at 50% 110%, color-mix(in srgb, var(--w2a-accent) 12%, transparent) 0%, transparent 60%)",
        }}
      />
    );
  }
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(80% 50% at 0% 0%, color-mix(in srgb, var(--w2a-accent) 14%, transparent) 0%, transparent 60%), " +
          "radial-gradient(80% 50% at 100% 100%, color-mix(in srgb, var(--w2a-accent-2) 12%, transparent) 0%, transparent 60%)",
      }}
    />
  );
}

function PreviewSidebar({ theme }: { theme: Theme }) {
  const wide = theme.sidebar === "wide";
  const floating = theme.sidebar === "floating";

  const items = [
    { icon: <Home size={13} />, label: "Home", active: true },
    { icon: <Activity size={13} />, label: "Activity" },
    { icon: <Folder size={13} />, label: "Projects" },
    { icon: <Star size={13} />, label: "Favourites" },
    { icon: <SettingsIcon size={13} />, label: "Settings" },
  ];

  return (
    <aside
      className={cn("relative shrink-0 z-[1]", floating && "m-2 rounded-lg overflow-hidden")}
      style={{
        width: wide ? 110 : 38,
        background: floating
          ? `color-mix(in srgb, ${theme.colors.surface} 80%, transparent)`
          : theme.colors.surface,
        borderRight: floating ? "none" : `1px solid ${theme.colors.border}`,
        backdropFilter: "blur(var(--w2a-blur))",
        WebkitBackdropFilter: "blur(var(--w2a-blur))",
        boxShadow: floating ? "var(--w2a-shadow)" : "none",
      }}
    >
      <div className="p-2 flex flex-col gap-0.5">
        {items.map((it, i) => (
          <button
            key={i}
            className="flex items-center gap-2 h-7 px-2 text-left transition"
            style={{
              borderRadius: "var(--w2a-radius-sm)",
              color: it.active ? theme.colors.accent : theme.colors.textMuted,
              background: it.active
                ? `color-mix(in srgb, ${theme.colors.accent} 14%, transparent)`
                : "transparent",
              fontSize: 10,
            }}
          >
            <span className="shrink-0">{it.icon}</span>
            {wide && <span className="truncate">{it.label}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}

function PreviewContent({ theme }: { theme: Theme }) {
  const accent = theme.colors.accent;
  const accent2 = theme.colors.accent2;

  return (
    <div className="flex-1 min-w-0 relative">
      <div className="p-3 flex flex-col gap-3 h-full">
        {/* search bar */}
        <div
          className="h-7 flex items-center gap-2 px-2.5"
          style={{
            background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
            borderRadius: "var(--w2a-radius-sm)",
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textMuted,
            fontSize: 10,
          }}
        >
          <Search size={11} />
          <span className="flex-1 truncate">Search…</span>
          <Bell size={11} />
        </div>

        {/* hero card */}
        <div
          className="p-3 relative overflow-hidden"
          style={{
            borderRadius: "var(--w2a-radius)",
            background: `color-mix(in srgb, ${theme.colors.surface} ${Math.round(Number((1 - theme.glass / 200).toFixed(2)) * 100)}%, transparent)`,
            border: `1px solid ${theme.colors.border}`,
            backdropFilter: "blur(var(--w2a-blur))",
            WebkitBackdropFilter: "blur(var(--w2a-blur))",
            boxShadow: "var(--w2a-shadow)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <div
              className="w-8 h-8 flex items-center justify-center text-white shrink-0"
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accent2})`,
                borderRadius: "var(--w2a-radius-sm)",
                boxShadow: `0 0 18px -4px ${accent}80`,
              }}
            >
              <Plus size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-tight truncate">
                Welcome to <span style={{ color: accent }}>{theme.name}</span>
              </div>
              <div className="text-[9.5px] mt-0.5 leading-tight" style={{ color: theme.colors.textMuted }}>
                {theme.tagline}
              </div>
              <div className="flex gap-1.5 mt-2">
                <span
                  className="px-2 py-0.5 text-[9px] font-medium"
                  style={{
                    background: accent,
                    color: pickContrast(accent),
                    borderRadius: "var(--w2a-radius-sm)",
                  }}
                >
                  Get started
                </span>
                <span
                  className="px-2 py-0.5 text-[9px] font-medium"
                  style={{
                    background: "transparent",
                    color: theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: "var(--w2a-radius-sm)",
                  }}
                >
                  Learn more
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* row of small tiles */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-2"
              style={{
                background: theme.colors.surface,
                borderRadius: "var(--w2a-radius-sm)",
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div className="w-4 h-4 mb-1.5" style={{ background: i === 1 ? accent : i === 2 ? accent2 : theme.colors.border, borderRadius: "var(--w2a-radius-sm)" }} />
              <div className="text-[9px] font-medium truncate">Tile {i}</div>
              <div className="text-[8px] truncate" style={{ color: theme.colors.textMuted }}>Stat label</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Pick black or white text against the given hex bg. */
function pickContrast(bg: string): string {
  const hex = bg.startsWith("#") ? bg.slice(1) : bg;
  if (hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0b0f18" : "#ffffff";
}
