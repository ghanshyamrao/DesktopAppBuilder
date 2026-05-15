import type { ActionsConfig } from "@/types";

/**
 * Recipes — small, reusable bundles of project tweaks that can be applied
 * to ANY project with one click. They overlay onto an existing project
 * without replacing its identity (URL, name, icon stay) — only the fields
 * the recipe touches are merged.
 *
 * The merge is additive for `customCss` and `customJs` (concatenated with a
 * separator comment), and structural-merge for `actions` (only set keys
 * override). This means you can stack recipes: apply "Hide ads" + "Dark
 * mode" + "Cookie auto-dismiss" and they layer cleanly.
 */

export type RecipeCategory = "appearance" | "focus" | "shortcuts" | "behavior";

export interface RecipeBody {
  /** CSS appended to the project's userStyles.css. */
  customCss?: string;
  /** JS appended to userScript.js (each recipe wrapped in its own IIFE
   *  comment block so failures stay isolated and the source stays readable). */
  customJs?: string;
  /** Partial actions merge — only set keys override the project's actions. */
  actions?: Partial<ActionsConfig>;
}

export interface Recipe {
  id: string;
  name: string;
  tagline: string;
  category: RecipeCategory;
  /** Two-tone gradient for the card thumbnail. */
  grad: [string, string];
  /** Single-glyph mark on the thumbnail. */
  glyph: string;
  /** What the recipe touches — shown as small chips on the card. */
  touches: Array<"css" | "js" | "actions">;
  body: RecipeBody;
}

export const RECIPE_CATEGORY_LABEL: Record<RecipeCategory, string> = {
  appearance: "Appearance",
  focus:      "Focus",
  shortcuts:  "Shortcuts",
  behavior:   "Behavior",
};

export const RECIPE_CATEGORY_ORDER: RecipeCategory[] = [
  "appearance", "focus", "shortcuts", "behavior",
];

/* Reusable JS snippet — works on most cookie banners. */
const COOKIE_DISMISS_JS = `// Auto-dismiss common cookie banners on first paint.
const dismiss = () => {
  for (const sel of [
    "#onetrust-accept-btn-handler",
    "[aria-label*='Accept' i]",
    ".cookie-accept",
    "#cookieAccept",
    "[data-testid='cookie-policy-accept']",
  ]) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent) { el.click(); break; }
  }
};
window.addEventListener("DOMContentLoaded", () => setTimeout(dismiss, 600));`;

export const RECIPES: Recipe[] = [
  /* ─────────── APPEARANCE ─────────── */
  {
    id: "dark-everything",
    name: "Dark mode (any site)",
    tagline: "Inverts colors site-wide while preserving images",
    category: "appearance",
    grad: ["#0f172a", "#020617"],
    glyph: "◐",
    touches: ["css"],
    body: {
      customCss: `/* Universal dark mode — invert + hue-rotate so colors look natural,
   then re-invert media so images/video aren't broken. */
html {
  filter: invert(1) hue-rotate(180deg);
  background: #0a0a0a;
}
img, picture, video, iframe, [style*="background-image"], canvas, svg image {
  filter: invert(1) hue-rotate(180deg);
}`,
    },
  },
  {
    id: "tighter-density",
    name: "Tighter density",
    tagline: "Compact spacing for information-dense layouts",
    category: "appearance",
    grad: ["#475569", "#1e293b"],
    glyph: "≡",
    touches: ["css"],
    body: {
      customCss: `/* Shrink line-height and reduce default padding for compact reading */
:root { line-height: 1.4 !important; }
button, a { padding: 4px 8px !important; }`,
    },
  },
  {
    id: "monospace-everywhere",
    name: "Monospace reading",
    tagline: "Force all text into a coding font",
    category: "appearance",
    grad: ["#10b981", "#064e3b"],
    glyph: "{}",
    touches: ["css"],
    body: {
      customCss: `* { font-family: "JetBrains Mono", "SF Mono", Consolas, monospace !important; }`,
    },
  },

  /* ─────────── FOCUS ─────────── */
  {
    id: "hide-ads",
    name: "Hide common ads",
    tagline: "Removes the most frequent ad slots",
    category: "focus",
    grad: ["#dc2626", "#7f1d1d"],
    glyph: "✕",
    touches: ["css"],
    body: {
      customCss: `/* Common ad / promo containers across many sites */
[id*="ad-" i], [class*="ad-banner" i], [class*="adslot" i],
[id*="google_ads" i], [data-ad-slot], .adsbygoogle,
.promo, .promoted, [aria-label*="advertisement" i],
[class*="sponsor" i] { display: none !important; }`,
    },
  },
  {
    id: "hide-cookies",
    name: "Auto-dismiss cookie banners",
    tagline: "Clicks Accept on common banners",
    category: "focus",
    grad: ["#f59e0b", "#92400e"],
    glyph: "🍪",
    touches: ["js"],
    body: {
      customJs: COOKIE_DISMISS_JS,
    },
  },
  {
    id: "minimalist",
    name: "Minimalist mode",
    tagline: "Hides headers, footers, sidebars",
    category: "focus",
    grad: ["#0ea5e9", "#0c4a6e"],
    glyph: "▢",
    touches: ["css"],
    body: {
      customCss: `/* Strip site chrome to keep the eye on the main content area */
header:not([role="banner"]) { display: none !important; }
footer { display: none !important; }
aside, [role="complementary"] { display: none !important; }`,
    },
  },
  {
    id: "reader-width",
    name: "Reader width",
    tagline: "Caps content at a comfortable reading width",
    category: "focus",
    grad: ["#a855f7", "#581c87"],
    glyph: "‖",
    touches: ["css"],
    body: {
      customCss: `/* Cap article-like content at a readable width */
article, main, [role="main"] { max-width: 720px !important; margin: 0 auto !important; }`,
    },
  },

  /* ─────────── SHORTCUTS ─────────── */
  {
    id: "vim-scroll",
    name: "Vim-style scrolling",
    tagline: "j/k to scroll, gg / G to jump",
    category: "shortcuts",
    grad: ["#16a34a", "#14532d"],
    glyph: "vim",
    touches: ["js"],
    body: {
      customJs: `// j / k = down / up; gg = top; G = bottom. No-op when typing in inputs.
let lastG = 0;
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, [contenteditable]")) return;
  if (e.key === "j") window.scrollBy({ top: 80, behavior: "smooth" });
  else if (e.key === "k") window.scrollBy({ top: -80, behavior: "smooth" });
  else if (e.key === "g") {
    const now = Date.now();
    if (now - lastG < 400) window.scrollTo({ top: 0, behavior: "smooth" });
    lastG = now;
  } else if (e.key === "G") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}, true);`,
    },
  },
  {
    id: "quick-search",
    name: "Quick search",
    tagline: "Slash (/) focuses the page's search input",
    category: "shortcuts",
    grad: ["#3b82f6", "#1e3a8a"],
    glyph: "/",
    touches: ["js"],
    body: {
      customJs: `// Pressing "/" focuses the most likely search field.
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, [contenteditable]")) return;
  if (e.key === "/") {
    const candidates = ['input[type="search"]', 'input[name*="search" i]', 'input[placeholder*="search" i]'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) { e.preventDefault(); el.focus(); break; }
    }
  }
}, true);`,
    },
  },

  /* ─────────── BEHAVIOR ─────────── */
  {
    id: "always-pinned",
    name: "Always on top",
    tagline: "Window opens pinned above all others",
    category: "behavior",
    grad: ["#ec4899", "#831843"],
    glyph: "📌",
    touches: ["actions"],
    body: {
      actions: { alwaysOnTop: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+P", action: "togglePin" }] },
    },
  },
  {
    id: "tray-quiet",
    name: "Quiet tray app",
    tagline: "Close goes to tray; single-instance lock",
    category: "behavior",
    grad: ["#6366f1", "#312e81"],
    glyph: "⊠",
    touches: ["actions"],
    body: {
      actions: { tray: true, minimizeToTray: true, singleInstance: true },
    },
  },
];

export function groupRecipesByCategory(): Array<{ category: RecipeCategory; label: string; entries: Recipe[] }> {
  const groups: Record<RecipeCategory, Recipe[]> = {
    appearance: [], focus: [], shortcuts: [], behavior: [],
  };
  for (const r of RECIPES) groups[r.category].push(r);
  return RECIPE_CATEGORY_ORDER
    .map((cat) => ({ category: cat, label: RECIPE_CATEGORY_LABEL[cat], entries: groups[cat] }))
    .filter((g) => g.entries.length > 0);
}

/**
 * Apply a recipe's body onto an existing project's fields. CSS/JS is
 * additive (concatenated under a separator comment); actions structurally
 * merge (recipe keys win).
 */
export function applyRecipeToFields(
  current: { customCss?: string; customJs?: string; actions?: ActionsConfig | undefined },
  recipe: Recipe,
): { customCss?: string; customJs?: string; actions?: ActionsConfig | undefined } {
  const next = { ...current };

  if (recipe.body.customCss) {
    const existing = (current.customCss ?? "").trim();
    const banner = `/* ── recipe: ${recipe.name} ── */`;
    next.customCss = existing
      ? `${existing}\n\n${banner}\n${recipe.body.customCss}`
      : `${banner}\n${recipe.body.customCss}`;
  }
  if (recipe.body.customJs) {
    const existing = (current.customJs ?? "").trim();
    const banner = `// ── recipe: ${recipe.name} ──`;
    next.customJs = existing
      ? `${existing}\n\n${banner}\n${recipe.body.customJs}`
      : `${banner}\n${recipe.body.customJs}`;
  }
  if (recipe.body.actions) {
    next.actions = { ...(current.actions ?? {} as ActionsConfig), ...recipe.body.actions };
    // Append global shortcuts rather than replacing — most recipes only
    // add one or two; we don't want them clobbering existing bindings.
    if (recipe.body.actions.globalShortcuts && current.actions?.globalShortcuts) {
      const existing = current.actions.globalShortcuts;
      const incoming = recipe.body.actions.globalShortcuts;
      const seen = new Set(existing.map((s) => s.accelerator));
      next.actions.globalShortcuts = [
        ...existing,
        ...incoming.filter((s) => !seen.has(s.accelerator)),
      ];
    }
  }
  return next;
}
