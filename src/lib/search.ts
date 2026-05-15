import { useMemo } from "react";
import { useAppStore, type Route } from "@/store/appStore";
import { FEATURES } from "@/lib/features";
import { THEME_PRESETS } from "@/lib/theme";
import { PRESETS as THEME_BUILDER_PRESETS } from "@/lib/themes/presets";
import { APP_TEMPLATES, CATEGORY_LABEL as TEMPLATE_CATEGORY_LABEL } from "@/lib/appTemplates";
import { RECIPES, RECIPE_CATEGORY_LABEL } from "@/lib/recipes";
import { CATALOG as PLUGIN_CATALOG } from "@/lib/plugins";
import type { AppProject } from "@/types";

export type SearchGroup =
  | "pages"
  | "apps"
  | "settings"
  | "themes"
  | "templates"
  | "recipes"
  | "plugins";

export interface SearchResult {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle?: string;
  /** Extra space-separated keywords matched against the query. */
  keywords?: string;
  /** Short badge (category, kind, etc) shown to the right of the title. */
  badge?: string;
  /** Single glyph or short string drawn in the icon tile. */
  glyph?: string;
  /** Tailwind gradient classes applied to the icon tile background. */
  gradient?: string;
  /** Performed when the user picks this result. */
  go: () => void;
}

const GROUP_LABEL: Record<SearchGroup, string> = {
  pages:     "Pages",
  apps:      "Your apps",
  settings:  "Settings",
  themes:    "Themes",
  templates: "App templates",
  recipes:   "Recipes",
  plugins:   "Plugins",
};

export const SEARCH_GROUP_ORDER: SearchGroup[] = [
  "pages", "apps", "settings", "themes", "templates", "recipes", "plugins",
];

export function groupLabel(g: SearchGroup): string { return GROUP_LABEL[g]; }

interface PageEntry {
  title: string;
  subtitle: string;
  keywords: string;
  glyph: string;
  gradient: string;
  route: Route;
  feature: keyof typeof FEATURES | null;
}

const PAGES: PageEntry[] = [
  { title: "Dashboard",        subtitle: "Your apps + new app gallery", keywords: "home apps overview", glyph: "▦", gradient: "from-sky-500 to-cyan-400",     route: { name: "dashboard" }, feature: "dashboard" },
  { title: "App Studio",       subtitle: "Edit project · build · ship", keywords: "editor builder",     glyph: "✦", gradient: "from-violet-500 to-fuchsia-500", route: { name: "studio" },    feature: "appStudio" },
  { title: "Builder",          subtitle: "Visual scene designer",       keywords: "drag drop scene",     glyph: "✎", gradient: "from-emerald-500 to-teal-400",   route: { name: "builder" },   feature: "builder" },
  { title: "Theme Builder",    subtitle: "Pick or fork a window theme", keywords: "color palette skin",  glyph: "◐", gradient: "from-pink-500 to-rose-500",      route: { name: "themes" },    feature: "themeBuilder" },
  { title: "Action Builder",   subtitle: "Tray · shortcuts · deep links", keywords: "hotkey shortcut menu", glyph: "⚡", gradient: "from-amber-500 to-orange-500", route: { name: "actions" }, feature: "actionBuilder" },
  { title: "Recipes",          subtitle: "Reusable project tweaks",     keywords: "snippets library",    glyph: "✦", gradient: "from-lime-500 to-emerald-400",   route: { name: "recipes" },   feature: "recipes" },
  { title: "Plugin Marketplace", subtitle: "Browse and install plugins", keywords: "addon extension",   glyph: "◇", gradient: "from-blue-500 to-indigo-500",   route: { name: "plugins" },   feature: "plugins" },
  { title: "Deploy",           subtitle: "Publish to GitHub Releases",  keywords: "publish release",     glyph: "↑", gradient: "from-purple-500 to-pink-500",    route: { name: "deploy" },    feature: "deploy" },
  { title: "AI Assistant",     subtitle: "Generate apps from prompts",  keywords: "chat gpt sparkle",    glyph: "✧", gradient: "from-fuchsia-500 to-blue-500",   route: { name: "ai" },        feature: "aiAssistant" },
  { title: "Settings",         subtitle: "Workspace preferences",       keywords: "preferences config",  glyph: "⚙", gradient: "from-slate-500 to-zinc-500",     route: { name: "settings" },  feature: "settings" },
];

interface SettingsEntry {
  key: string;
  title: string;
  subtitle: string;
  keywords: string;
  glyph: string;
  gradient: string;
}

const SETTINGS_SECTIONS: SettingsEntry[] = [
  { key: "profile",    title: "Profile",         subtitle: "Account · sign-in · plan",       keywords: "account user identity",            glyph: "👤", gradient: "from-slate-500 to-zinc-500" },
  { key: "appearance", title: "Appearance",      subtitle: "Theme · accent color",            keywords: "dark light theme color",          glyph: "🎨", gradient: "from-pink-500 to-rose-500" },
  { key: "window",     title: "Default window",  subtitle: "Width · height · resizable",      keywords: "size dimensions",                  glyph: "▭",  gradient: "from-cyan-500 to-blue-500" },
  { key: "security",   title: "Security",        subtitle: "Context isolation · devtools",    keywords: "sandbox permission",               glyph: "🛡", gradient: "from-emerald-500 to-teal-500" },
  { key: "ai",         title: "AI Assistant",    subtitle: "Anthropic API key",               keywords: "api key model claude",             glyph: "🤖", gradient: "from-fuchsia-500 to-blue-500" },
  { key: "github",     title: "GitHub",          subtitle: "Token · default repo",            keywords: "git token release",                glyph: "🐙", gradient: "from-zinc-500 to-stone-500" },
  { key: "signing",    title: "Code signing",    subtitle: "Certificate · password",          keywords: "sign certificate",                 glyph: "🔑", gradient: "from-yellow-500 to-amber-500" },
];

/**
 * Build the entire search index. Pure function of inputs (projects + a navigate
 * callback) so callers can memoize on the project list.
 */
export function buildIndex(projects: AppProject[], navigate: (r: Route) => void): SearchResult[] {
  const out: SearchResult[] = [];

  /* Pages — gated by the FEATURES flag where one exists. */
  for (const p of PAGES) {
    if (p.feature && !FEATURES[p.feature]) continue;
    out.push({
      id: `page:${p.route.name}`,
      group: "pages",
      title: p.title,
      subtitle: p.subtitle,
      keywords: p.keywords,
      glyph: p.glyph,
      gradient: p.gradient,
      go: () => navigate(p.route),
    });
  }

  /* User's own apps — clicking opens the build/edit page for that project. */
  for (const proj of projects) {
    out.push({
      id: `app:${proj.id}`,
      group: "apps",
      title: proj.name,
      subtitle: proj.url || proj.description || "Project",
      keywords: [proj.url, proj.description, proj.kind].filter(Boolean).join(" "),
      badge: proj.kind === "starter" ? "starter" : "wrapper",
      glyph: initialOf(proj.name),
      gradient: "from-blue-500 to-violet-500",
      go: () => navigate({ name: "build", projectId: proj.id }),
    });
  }

  /* Settings sub-sections — single landing page, but the route now carries
     the section so Settings can scroll/select to it. */
  if (FEATURES.settings) {
    for (const s of SETTINGS_SECTIONS) {
      out.push({
        id: `settings:${s.key}`,
        group: "settings",
        title: s.title,
        subtitle: s.subtitle,
        keywords: `settings ${s.keywords}`,
        glyph: s.glyph,
        gradient: s.gradient,
        go: () => navigate({ name: "settings", section: s.key }),
      });
    }
  }

  /* UI theme presets (Settings → Appearance) — light/dark/custom. */
  for (const t of THEME_PRESETS) {
    out.push({
      id: `ui-theme:${t.key}`,
      group: "themes",
      title: `${t.label} theme`,
      subtitle: t.description,
      keywords: `ui theme appearance ${t.key}`,
      badge: "UI",
      glyph: "◐",
      gradient: "from-slate-500 to-zinc-500",
      go: () => navigate({ name: "settings", section: "appearance" }),
    });
  }

  /* Window-frame theme presets (Theme Builder). */
  if (FEATURES.themeBuilder) {
    for (const t of THEME_BUILDER_PRESETS) {
      out.push({
        id: `theme:${t.id}`,
        group: "themes",
        title: t.name,
        subtitle: t.tagline,
        keywords: `theme builder ${t.id}`,
        badge: "Builder",
        glyph: "◐",
        gradient: "from-pink-500 to-fuchsia-500",
        go: () => navigate({ name: "themes" }),
      });
    }
  }

  /* App templates — one-click "create this app" from the dashboard gallery. */
  for (const tpl of APP_TEMPLATES) {
    out.push({
      id: `template:${tpl.id}`,
      group: "templates",
      title: tpl.name,
      subtitle: tpl.tagline,
      keywords: `${tpl.url} ${TEMPLATE_CATEGORY_LABEL[tpl.category] ?? ""}`,
      badge: TEMPLATE_CATEGORY_LABEL[tpl.category] ?? tpl.category,
      glyph: tpl.initials,
      gradient: "from-cyan-500 to-blue-500",
      go: () => navigate({ name: "wizard", draft: tpl.draft }),
    });
  }

  /* Recipes — only when the feature ships in this build. */
  if (FEATURES.recipes) {
    for (const r of RECIPES) {
      out.push({
        id: `recipe:${r.id}`,
        group: "recipes",
        title: r.name,
        subtitle: r.tagline,
        keywords: `recipe ${RECIPE_CATEGORY_LABEL[r.category] ?? ""} ${r.touches.join(" ")}`,
        badge: RECIPE_CATEGORY_LABEL[r.category] ?? r.category,
        glyph: r.glyph,
        gradient: "from-emerald-500 to-teal-500",
        go: () => navigate({ name: "recipes" }),
      });
    }
  }

  /* Plugins — only when the marketplace feature ships. */
  if (FEATURES.plugins) {
    for (const p of PLUGIN_CATALOG) {
      out.push({
        id: `plugin:${p.id}`,
        group: "plugins",
        title: p.name,
        subtitle: p.tagline,
        keywords: `plugin ${p.author} ${p.category} ${p.description}`,
        badge: p.category,
        glyph: p.iconGlyph,
        gradient: p.iconGradient,
        go: () => navigate({ name: "plugins" }),
      });
    }
  }

  return out;
}

/* ─────────── matching / scoring ─────────── */

/**
 * Score a single entry against the query. Higher = better match. Returns 0
 * when nothing matches and the entry should be filtered out.
 *
 * Scoring layers (largest → smallest weight):
 *   - title startsWith query           (700)
 *   - title contains query             (400)
 *   - subtitle contains query          (200)
 *   - keywords / badge contains query  (100)
 *   - per-token: title contains token  (40)
 *   - per-token: anywhere contains tok (10)
 * Shorter titles tie-break ahead of longer ones.
 */
function score(entry: SearchResult, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title    = entry.title.toLowerCase();
  const subtitle = (entry.subtitle ?? "").toLowerCase();
  const keywords = (entry.keywords ?? "").toLowerCase();
  const badge    = (entry.badge ?? "").toLowerCase();
  const haystack = `${title} ${subtitle} ${keywords} ${badge}`;

  let s = 0;
  if (title.startsWith(q)) s += 700;
  if (title.includes(q))   s += 400;
  if (subtitle.includes(q)) s += 200;
  if (keywords.includes(q) || badge.includes(q)) s += 100;

  /* Token-level — survives multi-word queries like "dark theme" matching
     "Dark mode" + "theme" in keywords even though the literal phrase doesn't
     appear in either field. */
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  for (const tok of tokens) {
    if (title.includes(tok))    s += 40;
    if (haystack.includes(tok)) s += 10;
  }

  if (s > 0) s += Math.max(0, 30 - title.length); // shorter titles bubble up
  return s;
}

/** Rank + filter the index for the given query. Empty query → empty array. */
export function search(index: SearchResult[], query: string, limit = 30): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  return index
    .map((r) => ({ r, s: score(r, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}

/** Hook: live search results for `query` against the current app state. */
export function useGlobalSearch(query: string): SearchResult[] {
  const projects = useAppStore((s) => s.projects);
  const navigate = useAppStore((s) => s.navigate);

  const index = useMemo(() => buildIndex(projects, navigate), [projects, navigate]);
  return useMemo(() => search(index, query), [index, query]);
}

/** Default suggestions (no query yet) — pages first, then a few apps. */
export function useDefaultSuggestions(limit = 8): SearchResult[] {
  const projects = useAppStore((s) => s.projects);
  const navigate = useAppStore((s) => s.navigate);
  return useMemo(() => {
    const all = buildIndex(projects, navigate);
    const pages = all.filter((r) => r.group === "pages");
    const apps  = all.filter((r) => r.group === "apps").slice(0, 3);
    return [...pages, ...apps].slice(0, limit);
  }, [projects, navigate, limit]);
}

function initialOf(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}
