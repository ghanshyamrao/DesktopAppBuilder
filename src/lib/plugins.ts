/**
 * Curated plugin catalog. The runtime is a future-phase project; for now this
 * powers the marketplace UI with persistent install state.
 */

export type PluginCategory = "ui" | "ai" | "build" | "integration" | "productivity" | "security";

export interface Plugin {
  id: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  category: PluginCategory;
  rating: number;       // 0–5
  installs: number;
  version: string;
  badges?: ("verified" | "new" | "official" | "beta")[];
  /** Tailwind gradient class for the icon tile. */
  iconGradient: string;
  iconGlyph: string;    // single emoji-like glyph for the tile
}

export const CATEGORIES: { id: PluginCategory | "all"; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "ui",           label: "UI & Themes" },
  { id: "ai",           label: "AI" },
  { id: "build",        label: "Build & Deploy" },
  { id: "integration",  label: "Integrations" },
  { id: "productivity", label: "Productivity" },
  { id: "security",     label: "Security" },
];

export const CATALOG: Plugin[] = [
  {
    id: "theme-aurora",
    name: "Aurora Theme Pack",
    tagline: "12 hand-tuned dark themes",
    description: "A premium pack of 12 dark themes inspired by the northern lights. Includes Aurora, Borealis, Polaris and more — each ships with matching glass and accent palettes.",
    author: "WebToDesktop Builder",
    category: "ui",
    rating: 4.8,
    installs: 18420,
    version: "1.4.2",
    badges: ["official", "verified"],
    iconGradient: "from-violet-500 to-cyan-400",
    iconGlyph: "✦",
  },
  {
    id: "ai-app-architect",
    name: "App Architect AI",
    tagline: "Generate complete app blueprints",
    description: "Goes beyond the basic AI Assistant — picks themes, action sets, security profile and an icon palette in one prompt.",
    author: "Anthropic Community",
    category: "ai",
    rating: 4.9,
    installs: 9341,
    version: "0.6.0",
    badges: ["new", "beta"],
    iconGradient: "from-fuchsia-500 to-blue-500",
    iconGlyph: "✷",
  },
  {
    id: "build-bun",
    name: "Bun Builder",
    tagline: "Replace npm with Bun in builds",
    description: "Drops Bun into the build pipeline for ~5× faster install + bundle. Falls back to npm if Bun isn't installed.",
    author: "Lattice OSS",
    category: "build",
    rating: 4.6,
    installs: 12058,
    version: "2.1.0",
    badges: ["verified"],
    iconGradient: "from-amber-400 to-rose-500",
    iconGlyph: "⚡",
  },
  {
    id: "integration-slack",
    name: "Slack Notifier",
    tagline: "Build status in your channel",
    description: "Posts a Slack message when a build succeeds or fails. Per-project webhook, optional rich blocks with download links.",
    author: "Channels Inc",
    category: "integration",
    rating: 4.5,
    installs: 7621,
    version: "1.0.5",
    iconGradient: "from-emerald-400 to-cyan-500",
    iconGlyph: "◈",
  },
  {
    id: "integration-github",
    name: "GitHub Releases",
    tagline: "One-click GH release upload",
    description: "Publish your built artifacts to a GitHub Release on save. Tag, changelog and asset upload all wired up.",
    author: "Octolab",
    category: "integration",
    rating: 4.7,
    installs: 14200,
    version: "3.2.1",
    badges: ["verified"],
    iconGradient: "from-slate-700 to-slate-400",
    iconGlyph: "◉",
  },
  {
    id: "productivity-snippets",
    name: "Snippet Drawer",
    tagline: "Reusable per-project preload snippets",
    description: "Inject ad-blockers, dark-mode CSS, autofill helpers etc. into any wrapped page. Library + per-project toggles.",
    author: "Studio Plus",
    category: "productivity",
    rating: 4.4,
    installs: 5990,
    version: "0.9.3",
    iconGradient: "from-blue-500 to-indigo-500",
    iconGlyph: "✎",
  },
  {
    id: "ui-arc-theme",
    name: "Arc Browser Theme",
    tagline: "Spaces & Sidebar styling, ported",
    description: "A faithful port of Arc's signature look — vertical sidebar with spaces, glassy command bar, sand-paper textures.",
    author: "Sky Labs",
    category: "ui",
    rating: 4.6,
    installs: 8300,
    version: "1.1.0",
    badges: ["new"],
    iconGradient: "from-rose-400 to-orange-400",
    iconGlyph: "◐",
  },
  {
    id: "security-csp-shield",
    name: "CSP Shield",
    tagline: "Strict CSP for wrapped pages",
    description: "Locks down the wrapped page with a strict CSP and a per-project allowlist editor. Blocks third-party trackers by default.",
    author: "WebToDesktop Security",
    category: "security",
    rating: 4.7,
    installs: 4200,
    version: "1.0.2",
    badges: ["official"],
    iconGradient: "from-emerald-500 to-emerald-300",
    iconGlyph: "🛡",
  },
  {
    id: "build-codesign",
    name: "Code Signing Helper",
    tagline: "Win + macOS signing made simple",
    description: "Wraps signtool / codesign so you can sign without remembering the flags. EV cert support, notarization for macOS.",
    author: "PKI Labs",
    category: "build",
    rating: 4.5,
    installs: 3150,
    version: "0.7.4",
    iconGradient: "from-yellow-400 to-amber-500",
    iconGlyph: "✓",
  },
  {
    id: "ai-prompt-library",
    name: "Prompt Library",
    tagline: "100+ prompts for app design",
    description: "Curated prompt templates that pair with the AI Assistant to produce themes, names, descriptions and store copy.",
    author: "Prompt Foundry",
    category: "ai",
    rating: 4.3,
    installs: 6780,
    version: "2.0.0",
    iconGradient: "from-purple-500 to-pink-500",
    iconGlyph: "❖",
  },
  {
    id: "productivity-window-mgr",
    name: "Snap Layouts",
    tagline: "Power-user window management",
    description: "Add Spectacle/Rectangle-style window snapping shortcuts to every generated app. Cross-platform.",
    author: "Tile Labs",
    category: "productivity",
    rating: 4.6,
    installs: 9420,
    version: "1.2.0",
    iconGradient: "from-cyan-400 to-blue-500",
    iconGlyph: "▦",
  },
  {
    id: "integration-sentry",
    name: "Sentry Crash Reporter",
    tagline: "Capture renderer + main crashes",
    description: "Auto-instruments uncaught exceptions, render-process crashes and main-process logs into Sentry projects per app.",
    author: "Sentry Community",
    category: "integration",
    rating: 4.8,
    installs: 11560,
    version: "4.5.0",
    badges: ["verified"],
    iconGradient: "from-orange-400 to-red-500",
    iconGlyph: "◓",
  },
];
