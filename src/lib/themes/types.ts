/**
 * Theme schema — drives both the in-builder live preview AND the CSS variables
 * baked into each generated app's chrome.html at build time.
 *
 * Keep this file dependency-free: it's imported by the renderer, the electron
 * main process, and the template generator.
 */

export type WindowFrameStyle =
  | "macos"      // traffic lights left, centered title, glass
  | "windows11"  // controls right, mica-style glass, square corners
  | "unified"    // single-tone bar fused with content
  | "frameless"; // minimal — only buttons, no chrome bar

export type SidebarStyle =
  | "rail"       // narrow icon-only rail
  | "wide"       // 240px labelled sidebar
  | "floating"   // inset, rounded, glassy
  | "hidden";    // no sidebar

export type AnimationStyle = "smooth" | "snappy" | "bouncy" | "none";

export type BackgroundStyle = "solid" | "gradient" | "mesh" | "image";

export type Density = "compact" | "comfortable" | "spacious";

export interface ThemeColors {
  /** App canvas — the deepest background. */
  bg: string;
  /** Sidebar / surface. */
  surface: string;
  /** Title bar fill (gradient endpoints comma-separated, or solid). */
  titlebar: string;
  /** Primary brand / button accent. */
  accent: string;
  /** Secondary accent — used for highlights and badges. */
  accent2: string;
  /** Primary text. */
  text: string;
  /** Muted text. */
  textMuted: string;
  /** Border / divider. */
  border: string;
  /** Traffic light colors (close, min, max). */
  lights: { close: string; min: string; max: string };
}

export interface Theme {
  /** Stable id — preset slug, or "custom" for user-edited themes. */
  id: string;
  /** Display label. */
  name: string;
  /** Tagline shown in the preset card. */
  tagline?: string;

  windowFrame: WindowFrameStyle;
  sidebar: SidebarStyle;
  background: BackgroundStyle;
  density: Density;
  animation: AnimationStyle;

  colors: ThemeColors;

  /** Border radius scale (px). */
  radius: number;
  /** Glass / blur intensity 0..100. 0 = solid surfaces, 100 = max blur. */
  glass: number;
  /** Shadow depth 0..3. */
  shadow: number;
  /** Title bar height (px). */
  titleBarHeight: number;

  /** Optional font family override (e.g. 'Inter', 'JetBrains Mono'). */
  font?: string;
}
