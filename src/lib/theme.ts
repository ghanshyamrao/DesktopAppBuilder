/**
 * WebToDesktop Builder UI theme system. Three modes:
 *   - "light"  — light surfaces, dark text, vivid accents
 *   - "dark"   — default neon-on-near-black palette
 *   - "custom" — dark base with a user-chosen accent color, used by the
 *                color picker in Settings → Appearance
 *
 * Themes are applied by toggling `<html data-theme="…">`. The actual color
 * values live in src/index.css under matching `[data-theme="…"]` rules.
 *
 * Persistence:
 *   - Renderer: localStorage["w2a:theme"] is read in src/main.tsx BEFORE
 *     React mounts so the first paint is correct (no dark→light flash).
 *   - Backend: SettingsStore.theme is the source of truth across launches
 *     and machines. Settings page writes to both.
 */

export type ThemeKey = "light" | "dark" | "custom";

export interface ThemePreset {
  key: ThemeKey;
  label: string;
  description: string;
  /** Swatches shown in the picker card (3 representative colors). */
  swatches: [string, string, string];
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    key: "dark",
    label: "Dark",
    description: "Default. Near-black canvas with neon accents.",
    swatches: ["#070910", "#101622", "#5B9DFF"],
  },
  {
    key: "light",
    label: "Light",
    description: "White surfaces, deep slate text, daylight-friendly.",
    swatches: ["#f5f7fb", "#ffffff", "#2563eb"],
  },
  {
    key: "custom",
    label: "Custom",
    description: "Dark base with your own accent color.",
    swatches: ["#070910", "#101622", "#A78BFA"],
  },
];

export interface CustomThemeOptions {
  /** Hex like "#7c3aed" — the user's chosen accent. */
  accent: string;
}

const DEFAULT_CUSTOM: CustomThemeOptions = { accent: "#A78BFA" };

const STORAGE_THEME = "w2a:theme";
const STORAGE_CUSTOM = "w2a:theme:custom";

/**
 * Apply a theme to the document. Safe to call before React mounts.
 * Idempotent — calling with the same args is a no-op.
 */
export function applyTheme(key: ThemeKey, custom: CustomThemeOptions = DEFAULT_CUSTOM): void {
  const html = document.documentElement;
  html.setAttribute("data-theme", key);

  // Custom theme = dark base with --accent-blue overridden. We also recolor
  // the canvas gradients + rail glow so the override actually shows up
  // somewhere noticeable.
  if (key === "custom") {
    const rgb = hexToRgbTriplet(custom.accent);
    html.style.setProperty("--accent-blue", rgb);
    html.style.setProperty(
      "--canvas-grad-1",
      `radial-gradient(800px 400px at 0% 0%, rgb(${rgb} / 0.08), transparent 60%)`,
    );
    html.style.setProperty(
      "--canvas-grad-2",
      `radial-gradient(900px 500px at 100% 100%, rgb(${rgb} / 0.05), transparent 60%)`,
    );
    html.style.setProperty("--border-glow", `rgb(${rgb} / 0.4)`);
  } else {
    // Wipe any inline overrides so the [data-theme] block wins again.
    html.style.removeProperty("--accent-blue");
    html.style.removeProperty("--canvas-grad-1");
    html.style.removeProperty("--canvas-grad-2");
    html.style.removeProperty("--border-glow");
  }
}

/** Cache the last-used theme so the next launch paints correctly. */
export function cacheTheme(key: ThemeKey, custom?: CustomThemeOptions): void {
  try {
    localStorage.setItem(STORAGE_THEME, key);
    if (custom) localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(custom));
  } catch {
    /* localStorage can be unavailable (e.g. private browsing) — ignore */
  }
}

/** Read the cached theme. Used by main.tsx for first-paint, no React. */
export function readCachedTheme(): { key: ThemeKey; custom: CustomThemeOptions } {
  let key: ThemeKey = "dark";
  let custom = DEFAULT_CUSTOM;
  try {
    const raw = localStorage.getItem(STORAGE_THEME);
    if (raw === "light" || raw === "dark" || raw === "custom") key = raw;
    const customRaw = localStorage.getItem(STORAGE_CUSTOM);
    if (customRaw) {
      const parsed = JSON.parse(customRaw) as Partial<CustomThemeOptions>;
      if (parsed.accent && /^#[0-9a-f]{6}$/i.test(parsed.accent)) custom = { accent: parsed.accent };
    }
  } catch {
    /* ignore */
  }
  return { key, custom };
}

/** "#5B9DFF" → "91 157 255" (the format Tailwind's CSS vars expect). */
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "91 157 255";
  const v = parseInt(m[1], 16);
  return `${(v >> 16) & 0xff} ${(v >> 8) & 0xff} ${v & 0xff}`;
}

export const DEFAULT_CUSTOM_THEME = DEFAULT_CUSTOM;
