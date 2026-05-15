import type { Theme } from "./types";

/**
 * Seven curated presets. Each is a complete Theme — users can fork any of them
 * by tweaking values in the inspector (which then snapshots into a "custom" id).
 */

const macos: Theme = {
  id: "macos",
  name: "macOS",
  tagline: "Frosted glass, traffic lights, soft accents",
  windowFrame: "macos",
  sidebar: "wide",
  background: "mesh",
  density: "comfortable",
  animation: "smooth",
  colors: {
    bg:        "#1c1c1e",
    surface:   "#2c2c2e",
    titlebar:  "linear-gradient(180deg, #2c2c2e 0%, #1f1f21 100%)",
    accent:    "#0a84ff",
    accent2:   "#bf5af2",
    text:      "#f5f5f7",
    textMuted: "rgba(245,245,247,0.55)",
    border:    "rgba(255,255,255,0.08)",
    lights:    { close: "#ff5f57", min: "#febc2e", max: "#28c840" },
  },
  radius: 10,
  glass: 80,
  shadow: 2,
  titleBarHeight: 38,
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
};

const windows11: Theme = {
  id: "windows11",
  name: "Windows 11",
  tagline: "Mica acrylic, right-side controls, Fluent",
  windowFrame: "windows11",
  sidebar: "wide",
  background: "gradient",
  density: "comfortable",
  animation: "smooth",
  colors: {
    bg:        "#202020",
    surface:   "#2b2b2b",
    titlebar:  "rgba(32,32,32,0.6)",
    accent:    "#60cdff",
    accent2:   "#9bb1ff",
    text:      "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    border:    "rgba(255,255,255,0.06)",
    lights:    { close: "#e81123", min: "#404040", max: "#404040" },
  },
  radius: 8,
  glass: 70,
  shadow: 1,
  titleBarHeight: 32,
  font: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
};

const cyberpunk: Theme = {
  id: "cyberpunk",
  name: "Cyberpunk",
  tagline: "Neon edges, magenta and cyan, brutalist",
  windowFrame: "frameless",
  sidebar: "rail",
  background: "mesh",
  density: "compact",
  animation: "snappy",
  colors: {
    bg:        "#070014",
    surface:   "#10001d",
    titlebar:  "linear-gradient(90deg, #1a0033 0%, #0a0019 100%)",
    accent:    "#ff2bd6",
    accent2:   "#00f0ff",
    text:      "#f0e8ff",
    textMuted: "rgba(255,43,214,0.7)",
    border:    "rgba(0,240,255,0.25)",
    lights:    { close: "#ff2bd6", min: "#fffb00", max: "#00f0ff" },
  },
  radius: 2,
  glass: 40,
  shadow: 3,
  titleBarHeight: 36,
  font: "'JetBrains Mono', ui-monospace, monospace",
};

const gaming: Theme = {
  id: "gaming",
  name: "Gaming",
  tagline: "Aggressive crimson, sharp angles, RGB-ready",
  windowFrame: "unified",
  sidebar: "rail",
  background: "gradient",
  density: "compact",
  animation: "snappy",
  colors: {
    bg:        "#0a0a0a",
    surface:   "#141414",
    titlebar:  "linear-gradient(90deg, #1a0000 0%, #0a0000 100%)",
    accent:    "#ff2a2a",
    accent2:   "#ff8800",
    text:      "#f5f5f5",
    textMuted: "rgba(255,255,255,0.5)",
    border:    "rgba(255,42,42,0.2)",
    lights:    { close: "#ff2a2a", min: "#ff8800", max: "#ffd000" },
  },
  radius: 4,
  glass: 30,
  shadow: 3,
  titleBarHeight: 40,
  font: "'Inter', system-ui, sans-serif",
};

const minimal: Theme = {
  id: "minimal",
  name: "Minimal SaaS",
  tagline: "Clean, professional, lots of whitespace",
  windowFrame: "macos",
  sidebar: "wide",
  background: "solid",
  density: "spacious",
  animation: "smooth",
  colors: {
    bg:        "#fafafa",
    surface:   "#ffffff",
    titlebar:  "#ffffff",
    accent:    "#3b82f6",
    accent2:   "#8b5cf6",
    text:      "#0f172a",
    textMuted: "#64748b",
    border:    "rgba(15,23,42,0.08)",
    lights:    { close: "#ef4444", min: "#f59e0b", max: "#10b981" },
  },
  radius: 12,
  glass: 0,
  shadow: 1,
  titleBarHeight: 44,
  font: "'Inter', system-ui, sans-serif",
};

const material: Theme = {
  id: "material",
  name: "Material UI",
  tagline: "Bold solids, elevation, classic Material",
  windowFrame: "windows11",
  sidebar: "wide",
  background: "solid",
  density: "comfortable",
  animation: "bouncy",
  colors: {
    bg:        "#121212",
    surface:   "#1e1e1e",
    titlebar:  "#1976d2",
    accent:    "#1976d2",
    accent2:   "#9c27b0",
    text:      "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    border:    "rgba(255,255,255,0.12)",
    lights:    { close: "#f44336", min: "#ff9800", max: "#4caf50" },
  },
  radius: 4,
  glass: 0,
  shadow: 3,
  titleBarHeight: 56,
  font: "'Roboto', 'Inter', system-ui, sans-serif",
};

const discord: Theme = {
  id: "discord",
  name: "Discord",
  tagline: "Blurple accents, dark surfaces, chat-app density",
  windowFrame: "unified",
  sidebar: "rail",
  background: "solid",
  density: "compact",
  animation: "smooth",
  colors: {
    bg:        "#1e1f22",
    surface:   "#2b2d31",
    titlebar:  "#1e1f22",
    accent:    "#5865f2",
    accent2:   "#eb459e",
    text:      "#f2f3f5",
    textMuted: "#b5bac1",
    border:    "rgba(255,255,255,0.06)",
    lights:    { close: "#ed4245", min: "#faa81a", max: "#3ba55c" },
  },
  radius: 8,
  glass: 0,
  shadow: 2,
  titleBarHeight: 40,
  font: "'gg sans', 'Inter', system-ui, sans-serif",
};

export const PRESETS: Theme[] = [macos, windows11, cyberpunk, gaming, minimal, material, discord];

export const PRESETS_BY_ID: Record<string, Theme> = Object.fromEntries(
  PRESETS.map((t) => [t.id, t]),
);

export const DEFAULT_THEME = macos;
