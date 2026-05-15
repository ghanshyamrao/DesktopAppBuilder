import type { AIProjectDraft } from "@/types";

/**
 * One-click app templates surfaced on the Dashboard. Each entry produces an
 * AIProjectDraft["draft"] payload that hands off to the create wizard
 * exactly like the AI Assistant does — so the rest of the pipeline doesn't
 * care whether a draft came from a human prompt, the AI, or this gallery.
 *
 * Templates are FULLY CONFIGURED — they ship with a pinned theme suggestion,
 * curated customCss for the wrapped site (dark mode, hide noise), and
 * custom keyboard shortcuts where they add value. A user can click → wizard
 * → build with no manual configuration.
 */

export type TemplateCategory =
  | "productivity"
  | "communication"
  | "media"
  | "dev"
  | "social"
  | "tools";

export interface AppTemplate {
  id: string;
  name: string;
  tagline: string;
  url: string;
  /** Two-tone gradient for the card thumbnail. */
  grad: [string, string];
  /** Initials shown on the thumbnail when there's no icon yet. */
  initials: string;
  /** Used to group templates on the Dashboard. */
  category: TemplateCategory;
  /** The actual draft pre-applied when the user clicks. */
  draft: AIProjectDraft["draft"];
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  productivity:  "Productivity",
  communication: "Communication",
  media:         "Media",
  dev:           "Dev",
  social:        "Social",
  tools:         "Tools",
};

/** Order for the category groups on the Dashboard. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "productivity",
  "communication",
  "media",
  "dev",
  "social",
  "tools",
];

const baseWindow = { width: 1280, height: 800 };
const baseSecurity = {
  contextIsolation: true,
  nodeIntegration: false,
  disableContextMenu: false,
  enableDevToolsInProduction: false,
};
const baseActions = {
  applicationMenu: true,
  tray: true,
  singleInstance: true,
  minimizeToTray: false,
  startupLaunch: false,
  notifications: true,
  alwaysOnTop: false,
  deepLinkProtocol: "",
  globalShortcuts: [],
};

/* Reusable JS snippet helpers — wrapped in IIFE+try/catch at injection time
 * by main.js, so top-level vars and event listeners are safe to declare. */
const COOKIE_DISMISS_JS = `// Auto-dismiss common cookie banners on first paint.
const dismiss = () => {
  for (const sel of ["#onetrust-accept-btn-handler", "[aria-label*='Accept' i]", ".cookie-accept", "#cookieAccept"]) {
    const el = document.querySelector(sel);
    if (el) { el.click(); break; }
  }
};
window.addEventListener("DOMContentLoaded", () => setTimeout(dismiss, 600));`;

export const APP_TEMPLATES: AppTemplate[] = [
  /* ─────────── PRODUCTIVITY ─────────── */
  {
    id: "notion",
    name: "Notion",
    tagline: "Focus mode + quick capture",
    url: "https://www.notion.so",
    grad: ["#0f0f0f", "#3a3a3a"],
    initials: "N",
    category: "productivity",
    draft: {
      name: "Notion",
      url: "https://www.notion.so",
      description: "Notion as a focused desktop app",
      window: { ...baseWindow, width: 1400, height: 900 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true,
        globalShortcuts: [
          { accelerator: "CmdOrCtrl+Shift+N", action: "toggle" },
          { accelerator: "CmdOrCtrl+Shift+Q", action: "show" },
        ] },
      customCss: `/* Hide the help bubble that nags you in the bottom-right */
.notion-help-button { display: none !important; }
/* Subtle scrollbar for long pages */
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 5px; }`,
      customJs: `// Cmd/Ctrl+\\ → quick toggle the sidebar (Notion's built-in does the same,
// but exposing it as our own shortcut means we can re-bind globally later).
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "\\\\") {
    const btn = document.querySelector("[aria-label='Close sidebar'], [aria-label='Open sidebar']");
    if (btn) btn.click();
  }
}, true);`,
      suggestedThemeId: "minimal",
    },
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Issue tracker + deep links",
    url: "https://linear.app",
    grad: ["#5e6ad2", "#1f1f23"],
    initials: "L",
    category: "productivity",
    draft: {
      name: "Linear",
      url: "https://linear.app",
      description: "Linear desktop with linear:// deep links",
      window: baseWindow,
      security: baseSecurity,
      actions: { ...baseActions, deepLinkProtocol: "linear",
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+L", action: "show" }] },
      customCss: `/* Slightly tighter density at desktop sizes */
[class*="StyledMain"] { font-size: 14px; }`,
      suggestedThemeId: "macos",
    },
  },
  {
    id: "calendar",
    name: "Google Calendar",
    tagline: "Always-on-top schedule view",
    url: "https://calendar.google.com",
    grad: ["#dc2626", "#f59e0b"],
    initials: "C",
    category: "productivity",
    draft: {
      name: "Calendar",
      url: "https://calendar.google.com",
      description: "Google Calendar in a pinnable window",
      window: { ...baseWindow, width: 1100, height: 760 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true,
        globalShortcuts: [
          { accelerator: "CmdOrCtrl+Shift+C", action: "toggle" },
          { accelerator: "CmdOrCtrl+Shift+P", action: "togglePin" },
        ] },
      suggestedThemeId: "macos",
    },
  },

  /* ─────────── COMMUNICATION ─────────── */
  {
    id: "whatsapp",
    name: "WhatsApp",
    tagline: "Tray-friendly messenger",
    url: "https://web.whatsapp.com",
    grad: ["#25d366", "#075e54"],
    initials: "W",
    category: "communication",
    draft: {
      name: "WhatsApp",
      url: "https://web.whatsapp.com",
      description: "WhatsApp Web in a tray-friendly window",
      window: { ...baseWindow, width: 1100, height: 760 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+W", action: "toggle" }] },
      suggestedThemeId: "minimal",
    },
  },
  {
    id: "discord",
    name: "Discord",
    tagline: "Compact-density chat",
    url: "https://discord.com/app",
    grad: ["#5865f2", "#1e2030"],
    initials: "D",
    category: "communication",
    draft: {
      name: "Discord",
      url: "https://discord.com/app",
      description: "Discord wrapped as a desktop app",
      window: { ...baseWindow, width: 1300, height: 850 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+D", action: "toggle" }] },
      customCss: `/* Reduce server-list outer padding for tighter layout */
[class*="wrapper-1Rf01"] { padding: 4px 0 !important; }`,
      suggestedThemeId: "discord",
    },
  },
  {
    id: "gmail",
    name: "Gmail",
    tagline: "Inbox + tray notifications",
    url: "https://mail.google.com",
    grad: ["#ea4335", "#fbbc04"],
    initials: "@",
    category: "communication",
    draft: {
      name: "Gmail",
      url: "https://mail.google.com",
      description: "Gmail desktop with tray notifications",
      window: baseWindow,
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true, notifications: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+G", action: "toggle" }] },
      suggestedThemeId: "minimal",
    },
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Workspace messenger",
    url: "https://app.slack.com/client",
    grad: ["#4a154b", "#ecb22e"],
    initials: "#",
    category: "communication",
    draft: {
      name: "Slack",
      url: "https://app.slack.com/client",
      description: "Slack workspace in a focused window",
      window: { ...baseWindow, width: 1300, height: 850 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true, notifications: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+S", action: "toggle" }] },
      suggestedThemeId: "minimal",
    },
  },

  /* ─────────── MEDIA ─────────── */
  {
    id: "youtube",
    name: "YouTube",
    tagline: "Distraction-free video",
    url: "https://www.youtube.com",
    grad: ["#ef4444", "#7f1d1d"],
    initials: "▶",
    category: "media",
    draft: {
      name: "YouTube",
      url: "https://www.youtube.com",
      description: "YouTube without the noise",
      window: { ...baseWindow, width: 1400, height: 900 },
      security: baseSecurity,
      actions: { ...baseActions,
        globalShortcuts: [
          { accelerator: "CmdOrCtrl+Shift+Y", action: "toggle" },
          { accelerator: "CmdOrCtrl+Shift+P", action: "togglePin" },
        ] },
      customCss: `/* Hide the homepage feed and trending shelf for a focused experience */
ytd-rich-section-renderer,
ytd-mini-guide-renderer { display: none !important; }
/* Hide comments by default — show explicitly via DevTools when needed */
#comments { display: none; }`,
      customJs: `// Press . to toggle comments (the page hides them by default).
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === ".") {
    const c = document.getElementById("comments");
    if (c) c.style.display = c.style.display === "none" ? "" : "none";
  }
}, true);`,
      suggestedThemeId: "macos",
    },
  },
  {
    id: "spotify",
    name: "Spotify",
    tagline: "Focused player + media keys",
    url: "https://open.spotify.com",
    grad: ["#1db954", "#0d2818"],
    initials: "S",
    category: "media",
    draft: {
      name: "Spotify",
      url: "https://open.spotify.com",
      description: "Spotify in a focused player window",
      window: { ...baseWindow, width: 1200, height: 760 },
      security: baseSecurity,
      actions: { ...baseActions,
        globalShortcuts: [
          { accelerator: "CmdOrCtrl+Shift+M", action: "toggle" },
          { accelerator: "MediaPlayPause",     action: "show"  },
        ] },
      suggestedThemeId: "macos",
    },
  },
  {
    id: "music",
    name: "Apple Music",
    tagline: "Web player",
    url: "https://music.apple.com",
    grad: ["#fb7185", "#a855f7"],
    initials: "♪",
    category: "media",
    draft: {
      name: "Apple Music",
      url: "https://music.apple.com",
      description: "Apple Music in a focused window",
      window: { ...baseWindow, width: 1200, height: 760 },
      security: baseSecurity,
      actions: { ...baseActions,
        globalShortcuts: [{ accelerator: "MediaPlayPause", action: "show" }] },
      suggestedThemeId: "macos",
    },
  },

  /* ─────────── DEV ─────────── */
  {
    id: "github",
    name: "GitHub",
    tagline: "Repos + keyboard shortcuts",
    url: "https://github.com",
    grad: ["#0d1117", "#30363d"],
    initials: "G",
    category: "dev",
    draft: {
      name: "GitHub",
      url: "https://github.com",
      description: "GitHub desktop wrapper",
      window: { ...baseWindow, width: 1400, height: 900 },
      security: baseSecurity,
      actions: { ...baseActions, deepLinkProtocol: "github",
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+H", action: "show" }] },
      customCss: `/* Hide the marketing dashboard widgets on the home feed */
.feed-prompt, .feed-widget { display: none !important; }`,
      suggestedThemeId: "macos",
    },
  },
  {
    id: "stackoverflow",
    name: "Stack Overflow",
    tagline: "Distraction-free Q&A",
    url: "https://stackoverflow.com",
    grad: ["#f48024", "#1e2531"],
    initials: "S",
    category: "dev",
    draft: {
      name: "Stack Overflow",
      url: "https://stackoverflow.com",
      description: "Stack Overflow without ads",
      window: baseWindow,
      security: baseSecurity,
      actions: { ...baseActions },
      customCss: `/* Hide the right-hand "Hot Network Questions" + ad slots */
#hot-network-questions, .everyonelovesstackoverflow { display: none !important; }
.js-dismissable-hero, #onetrust-banner-sdk { display: none !important; }`,
      customJs: COOKIE_DISMISS_JS,
      suggestedThemeId: "minimal",
    },
  },

  /* ─────────── SOCIAL ─────────── */
  {
    id: "twitter",
    name: "X / Twitter",
    tagline: "Compact timeline",
    url: "https://x.com",
    grad: ["#000000", "#1d9bf0"],
    initials: "𝕏",
    category: "social",
    draft: {
      name: "X",
      url: "https://x.com",
      description: "X wrapped as a focused desktop app",
      window: { ...baseWindow, width: 1100, height: 800 },
      security: baseSecurity,
      actions: { ...baseActions,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+X", action: "toggle" }] },
      customCss: `/* Hide the right-hand "What's happening" sidebar + trends */
[data-testid="sidebarColumn"] { display: none !important; }
/* And the bottom "Don't miss what's happening" bar */
[data-testid="BottomBar"] { display: none !important; }`,
      suggestedThemeId: "minimal",
    },
  },
  {
    id: "reddit",
    name: "Reddit",
    tagline: "Focused reading",
    url: "https://www.reddit.com",
    grad: ["#ff4500", "#0b1416"],
    initials: "R",
    category: "social",
    draft: {
      name: "Reddit",
      url: "https://www.reddit.com",
      description: "Reddit in a focused desktop window",
      window: baseWindow,
      security: baseSecurity,
      actions: { ...baseActions },
      customCss: `/* Hide the right column with promoted communities */
.subgrid-container > :nth-child(2),
[data-testid="frontpage-sidebar"] { display: none !important; }`,
      customJs: COOKIE_DISMISS_JS,
      suggestedThemeId: "minimal",
    },
  },

  /* ─────────── TOOLS ─────────── */
  {
    id: "maps",
    name: "Maps",
    tagline: "Always-on-top widget",
    url: "https://www.google.com/maps",
    grad: ["#10b981", "#0ea5e9"],
    initials: "M",
    category: "tools",
    draft: {
      name: "Maps",
      url: "https://www.google.com/maps",
      description: "Always-on-top maps widget",
      window: { ...baseWindow, width: 900, height: 700 },
      security: baseSecurity,
      actions: { ...baseActions, alwaysOnTop: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+M", action: "togglePin" }] },
      suggestedThemeId: "macos",
    },
  },
  {
    id: "translate",
    name: "Google Translate",
    tagline: "Pinned translator",
    url: "https://translate.google.com",
    grad: ["#0ea5e9", "#6366f1"],
    initials: "Aあ",
    category: "tools",
    draft: {
      name: "Translate",
      url: "https://translate.google.com",
      description: "Always-on-top translator",
      window: { width: 800, height: 600, resizable: true, fullscreen: false, centerOnLaunch: true, rememberState: true },
      security: baseSecurity,
      actions: { ...baseActions, alwaysOnTop: true,
        globalShortcuts: [{ accelerator: "CmdOrCtrl+Shift+T", action: "toggle" }] },
      suggestedThemeId: "macos",
    },
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    tagline: "Pinnable assistant",
    url: "https://chat.openai.com",
    grad: ["#10a37f", "#0a3d2c"],
    initials: "🤖",
    category: "tools",
    draft: {
      name: "ChatGPT",
      url: "https://chat.openai.com",
      description: "ChatGPT in a focused window",
      window: { ...baseWindow, width: 900, height: 800 },
      security: baseSecurity,
      actions: { ...baseActions, minimizeToTray: true,
        globalShortcuts: [
          { accelerator: "CmdOrCtrl+Shift+A", action: "toggle" },
          { accelerator: "CmdOrCtrl+Shift+P", action: "togglePin" },
        ] },
      suggestedThemeId: "minimal",
    },
  },
];

/** Group templates by category for the Dashboard layout. */
export function groupByCategory(): Array<{ category: TemplateCategory; label: string; entries: AppTemplate[] }> {
  const groups: Record<TemplateCategory, AppTemplate[]> = {
    productivity: [], communication: [], media: [], dev: [], social: [], tools: [],
  };
  for (const t of APP_TEMPLATES) groups[t.category].push(t);
  return CATEGORY_ORDER
    .map((cat) => ({ category: cat, label: CATEGORY_LABEL[cat], entries: groups[cat] }))
    .filter((g) => g.entries.length > 0);
}
