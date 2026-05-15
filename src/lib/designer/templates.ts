import type { DesignerDoc } from "./types";
import { genNodeId } from "./types";

/**
 * Pre-built designer templates. Each is a complete starting point a user
 * can drop into the canvas, then modify via drag-drop + the inspector.
 *
 * Templates are PURE DATA — no functions, no closures — so they can be
 * deep-cloned via JSON.parse(JSON.stringify(...)) to give each new project
 * its own mutable copy.
 */

export interface DesignerTemplate {
  id: string;
  name: string;
  tagline: string;
  /** Two-tone gradient + glyph for the picker card. */
  grad: [string, string];
  glyph: string;
  doc: DesignerDoc;
}

const baseTokens = {
  bg:      "#0b0b0d",
  surface: "#16171a",
  accent:  "#5b9dff",
  text:    "#f5f5f7",
  muted:   "rgba(245,245,247,0.55)",
  border:  "rgba(255,255,255,0.08)",
};

/** Helper to keep node creation tight. */
const n = (kind: string, props: Record<string, string>) => ({
  id: genNodeId(),
  kind: kind as any,
  props,
});

const WELCOME: DesignerTemplate = {
  id: "welcome",
  name: "Welcome",
  tagline: "Hero, tagline, primary action — single column.",
  grad: ["#5b9dff", "#a78bfa"],
  glyph: "✦",
  doc: {
    layout: "single",
    appName: "Welcome",
    appTagline: "Built with WebToDesktop Builder",
    tokens: { ...baseTokens },
    zones: {
      main: [
        n("heading",   { text: "Welcome to your app",                level: "h1", align: "center" }),
        n("paragraph", { text: "Drop more components from the palette on the left, or tweak the existing ones in the inspector on the right.", muted: "true" }),
        n("spacer",    { size: "12" }),
        n("button",    { label: "Get started", variant: "primary", action: "alert", actionData: "Hello!" }),
      ],
    },
  },
};

const DASHBOARD: DesignerTemplate = {
  id: "dashboard",
  name: "Dashboard",
  tagline: "Top bar + stats row + content list — the classic admin layout.",
  grad: ["#10b981", "#0ea5e9"],
  glyph: "▦",
  doc: {
    layout: "dashboard",
    appName: "Dashboard",
    appTagline: "Built with WebToDesktop Builder",
    tokens: { ...baseTokens, accent: "#10b981" },
    zones: {
      topbar: [
        n("heading",   { text: "Dashboard", level: "h2", align: "left" }),
      ],
      stats: [
        n("stat-card", { value: "12,458", label: "Active users",   tone: "blue"   }),
        n("stat-card", { value: "$8,402", label: "Revenue today",  tone: "green"  }),
        n("stat-card", { value: "47",     label: "Open tickets",   tone: "amber"  }),
        n("stat-card", { value: "98.4%",  label: "Uptime",         tone: "violet" }),
      ],
      content: [
        n("heading",   { text: "Recent activity", level: "h3", align: "left" }),
        n("list-item", { icon: "✓", title: "Build succeeded",  subtitle: "myapp v1.2.0 — 2 minutes ago" }),
        n("list-item", { icon: "↑", title: "Release published", subtitle: "Tagged v1.2.0 on GitHub — 5 minutes ago" }),
        n("list-item", { icon: "★", title: "New star",          subtitle: "octocat starred your repo — 12 minutes ago" }),
        n("list-item", { icon: "✎", title: "Issue opened",      subtitle: "#42 — Login screen flicker on cold boot" }),
      ],
    },
  },
};

/* Helper for a node with children (containers / forms). */
const c = (kind: string, props: Record<string, string>, children: any[]) => ({
  id: genNodeId(),
  kind: kind as any,
  props,
  children: children as any,
});

const SIGN_IN: DesignerTemplate = {
  id: "sign-in",
  name: "Sign in form",
  tagline: "Centered login form — Email + Password + Submit. Everything is wired and works on first build.",
  grad: ["#a855f7", "#3b82f6"],
  glyph: "☰",
  doc: {
    layout: "single",
    appName: "Sign in",
    appTagline: "Demo of a fully-wired form",
    tokens: { ...baseTokens, accent: "#a855f7" },
    zones: {
      main: [
        n("heading",   { text: "Sign in", level: "h1", align: "center" }),
        n("paragraph", { text: "Use any email + password — the form's submit action is set to alert the captured values.", muted: "true" }),
        n("spacer",    { size: "8" }),
        c("form", {
          title: "",
          submitLabel: "Sign in",
          submitAction: "alert",
          submitMessage: "Form submitted with:",
        }, [
          n("input",  { label: "Email",    name: "email",    type: "email",    placeholder: "you@example.com" }),
          n("input",  { label: "Password", name: "password", type: "password", placeholder: "••••••••" }),
        ]),
      ],
    },
  },
};

export const DESIGNER_TEMPLATES: DesignerTemplate[] = [DASHBOARD, WELCOME, SIGN_IN];

/** Deep clone a template's doc so each new project gets its own copy. */
export function cloneTemplate(t: DesignerTemplate): DesignerDoc {
  // The doc is pure data, so JSON round-trip is the cleanest deep clone.
  // Re-id all nodes so the clone has fresh ids that won't collide if the
  // user duplicates nodes inside the canvas later.
  const doc = JSON.parse(JSON.stringify(t.doc)) as DesignerDoc;
  for (const zoneKey of Object.keys(doc.zones)) {
    doc.zones[zoneKey] = doc.zones[zoneKey].map((node) => ({ ...node, id: genNodeId() }));
  }
  return doc;
}
