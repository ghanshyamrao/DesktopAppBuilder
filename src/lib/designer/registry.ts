import type { ComponentKind, ComponentNode, LayoutDef, LayoutKind } from "./types";

/**
 * Component registry — single source of truth for every drag-drop component.
 * Each entry knows its defaults, its inspector fields, and how to render
 * itself to HTML at compile time. Adding a new component = add an entry.
 */

export type FieldKind = "text" | "longText" | "color" | "select";

export interface PropField {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  helper?: string;
}

export interface ComponentDef {
  kind: ComponentKind;
  label: string;
  /** Single-glyph mark for the palette tile. */
  glyph: string;
  /** One-line description shown on the palette tile + inspector header. */
  description: string;
  /** Initial prop values when this component is dropped onto the canvas. */
  defaults: Record<string, string>;
  /** Editable fields shown in the right-side inspector. */
  fields: readonly PropField[];
  /**
   * Render the node to HTML. Output goes into the compiled app's index.html.
   * If the component accepts children, the second arg is the rendered
   * HTML of its children, already concatenated.
   */
  render: (node: ComponentNode, childrenHtml?: string) => string;
  /** When true, the canvas exposes drop zones inside this component and
   *  the render function receives `childrenHtml`. */
  acceptsChildren?: boolean;
}

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as const)[c]!);

export const COMPONENTS: Record<ComponentKind, ComponentDef> = {
  heading: {
    kind: "heading",
    label: "Heading",
    glyph: "H",
    description: "Large title text",
    defaults: { text: "Heading", level: "h2", align: "left" },
    fields: [
      { key: "text",  label: "Text",  kind: "text" },
      { key: "level", label: "Level", kind: "select", options: ["h1", "h2", "h3"] },
      { key: "align", label: "Align", kind: "select", options: ["left", "center", "right"] },
    ],
    render: (n) => {
      const level = ["h1", "h2", "h3"].includes(n.props.level) ? n.props.level : "h2";
      const align = n.props.align || "left";
      return `<${level} class="c-heading" style="text-align:${align}">${escapeHtml(n.props.text || "")}</${level}>`;
    },
  },

  paragraph: {
    kind: "paragraph",
    label: "Paragraph",
    glyph: "¶",
    description: "Body text block",
    defaults: { text: "Some paragraph text. Explain what this app does, link to documentation, anything that helps the user.", muted: "false" },
    fields: [
      { key: "text",  label: "Text",      kind: "longText" },
      { key: "muted", label: "Muted",     kind: "select", options: ["false", "true"], helper: "Render in secondary color" },
    ],
    render: (n) => {
      const cls = n.props.muted === "true" ? "c-paragraph muted" : "c-paragraph";
      return `<p class="${cls}">${escapeHtml(n.props.text || "")}</p>`;
    },
  },

  button: {
    kind: "button",
    label: "Button",
    glyph: "▭",
    description: "Click target with a label",
    defaults: { label: "Click me", variant: "primary", action: "alert", actionData: "Hello!" },
    fields: [
      { key: "label",      label: "Label",   kind: "text" },
      { key: "variant",    label: "Variant", kind: "select", options: ["primary", "secondary"] },
      { key: "action",     label: "Action",  kind: "select", options: ["alert", "openLink", "none"], helper: "What happens on click" },
      { key: "actionData", label: "Action data", kind: "text", helper: "Message for alert · URL for openLink" },
    ],
    render: (n) => {
      const cls = n.props.variant === "secondary" ? "c-button secondary" : "c-button primary";
      const action = n.props.action || "none";
      const data = (n.props.actionData || "").replace(/"/g, "&quot;");
      return `<button class="${cls}" data-action="${action}" data-action-data="${data}">${escapeHtml(n.props.label || "Button")}</button>`;
    },
  },

  "stat-card": {
    kind: "stat-card",
    label: "Stat card",
    glyph: "▢",
    description: "Big-number metric tile",
    defaults: { value: "0", label: "Stat", tone: "blue" },
    fields: [
      { key: "value", label: "Value", kind: "text" },
      { key: "label", label: "Label", kind: "text" },
      { key: "tone",  label: "Tone",  kind: "select", options: ["blue", "green", "violet", "amber", "red"] },
    ],
    render: (n) => `
      <div class="c-stat tone-${n.props.tone || "blue"}">
        <div class="c-stat-value">${escapeHtml(n.props.value || "0")}</div>
        <div class="c-stat-label">${escapeHtml(n.props.label || "")}</div>
      </div>`,
  },

  "list-item": {
    kind: "list-item",
    label: "List item",
    glyph: "≡",
    description: "Title + subtitle row, sits inside lists",
    defaults: { title: "Item", subtitle: "Description goes here", icon: "•" },
    fields: [
      { key: "icon",     label: "Icon (1 char)", kind: "text" },
      { key: "title",    label: "Title",         kind: "text" },
      { key: "subtitle", label: "Subtitle",      kind: "text" },
    ],
    render: (n) => `
      <div class="c-list-item">
        <div class="c-list-icon">${escapeHtml((n.props.icon || "•").slice(0, 2))}</div>
        <div class="c-list-body">
          <div class="c-list-title">${escapeHtml(n.props.title || "")}</div>
          <div class="c-list-subtitle">${escapeHtml(n.props.subtitle || "")}</div>
        </div>
      </div>`,
  },

  divider: {
    kind: "divider",
    label: "Divider",
    glyph: "—",
    description: "Horizontal rule",
    defaults: {},
    fields: [],
    render: () => `<hr class="c-divider" />`,
  },

  spacer: {
    kind: "spacer",
    label: "Spacer",
    glyph: "↕",
    description: "Vertical breathing room",
    defaults: { size: "16" },
    fields: [
      { key: "size", label: "Size (px)", kind: "text" },
    ],
    render: (n) => {
      const px = parseInt(n.props.size || "16", 10) || 16;
      return `<div class="c-spacer" style="height:${px}px"></div>`;
    },
  },

  image: {
    kind: "image",
    label: "Image",
    glyph: "▧",
    description: "Image from URL with optional caption",
    defaults: { src: "", alt: "", caption: "" },
    fields: [
      { key: "src",     label: "Source URL", kind: "text" },
      { key: "alt",     label: "Alt text",   kind: "text" },
      { key: "caption", label: "Caption",    kind: "text" },
    ],
    render: (n) => {
      const src = (n.props.src || "").replace(/"/g, "&quot;");
      const alt = (n.props.alt || "").replace(/"/g, "&quot;");
      const caption = n.props.caption ? `<div class="c-image-caption">${escapeHtml(n.props.caption)}</div>` : "";
      return `<figure class="c-image">${src ? `<img src="${src}" alt="${alt}" />` : `<div class="c-image-placeholder">No source</div>`}${caption}</figure>`;
    },
  },

  container: {
    kind: "container",
    label: "Container",
    glyph: "▣",
    description: "Group elements; arrange as row or column",
    defaults: { layout: "column", gap: "12", padding: "16", title: "" },
    fields: [
      { key: "title",   label: "Title (optional)", kind: "text" },
      { key: "layout",  label: "Layout",   kind: "select", options: ["column", "row"] },
      { key: "gap",     label: "Gap (px)", kind: "text" },
      { key: "padding", label: "Padding (px)", kind: "text" },
    ],
    acceptsChildren: true,
    render: (n, childrenHtml = "") => {
      const layout = n.props.layout === "row" ? "row" : "column";
      const gap = parseInt(n.props.gap || "12", 10) || 12;
      const padding = parseInt(n.props.padding || "16", 10) || 16;
      const titleHtml = n.props.title
        ? `<div class="c-container-title">${escapeHtml(n.props.title)}</div>`
        : "";
      return `<div class="c-container c-container-${layout}" style="gap:${gap}px;padding:${padding}px">${titleHtml}${childrenHtml}</div>`;
    },
  },

  form: {
    kind: "form",
    label: "Form",
    glyph: "☰",
    description: "Input form with submit — drop Inputs/Selects inside",
    defaults: { title: "Sign in", submitLabel: "Submit", submitAction: "alert", submitMessage: "Submitted!" },
    fields: [
      { key: "title",         label: "Title",         kind: "text" },
      { key: "submitLabel",   label: "Submit label",  kind: "text" },
      { key: "submitAction",  label: "On submit",     kind: "select", options: ["alert", "log", "none"], helper: "alert shows the values · log prints to devtools" },
      { key: "submitMessage", label: "Alert prefix",  kind: "text" },
    ],
    acceptsChildren: true,
    render: (n, childrenHtml = "") => {
      const title = n.props.title ? `<div class="c-form-title">${escapeHtml(n.props.title)}</div>` : "";
      const submit = `<button type="submit" class="c-button primary" data-form-submit="${n.props.submitAction || "alert"}" data-submit-message="${(n.props.submitMessage || "").replace(/"/g, "&quot;")}">${escapeHtml(n.props.submitLabel || "Submit")}</button>`;
      return `<form class="c-form" onsubmit="return false">${title}${childrenHtml}${submit}</form>`;
    },
  },

  input: {
    kind: "input",
    label: "Input",
    glyph: "│",
    description: "Single-line text input — sits inside Forms",
    defaults: { name: "field", label: "Label", type: "text", placeholder: "" },
    fields: [
      { key: "label",       label: "Label",       kind: "text" },
      { key: "name",        label: "Field name",  kind: "text", helper: "Used in form submission" },
      { key: "type",        label: "Type",        kind: "select", options: ["text", "email", "password", "number", "tel", "url"] },
      { key: "placeholder", label: "Placeholder", kind: "text" },
    ],
    render: (n) => {
      const name = (n.props.name || "field").replace(/[^\w-]/g, "_");
      const type = ["text", "email", "password", "number", "tel", "url"].includes(n.props.type) ? n.props.type : "text";
      return `<label class="c-field">
        <span class="c-field-label">${escapeHtml(n.props.label || "Label")}</span>
        <input class="c-input" name="${name}" type="${type}" placeholder="${(n.props.placeholder || "").replace(/"/g, "&quot;")}" />
      </label>`;
    },
  },

  select: {
    kind: "select",
    label: "Select",
    glyph: "▾",
    description: "Dropdown picker — sits inside Forms",
    defaults: { name: "choice", label: "Label", options: "Option A, Option B, Option C" },
    fields: [
      { key: "label",   label: "Label",       kind: "text" },
      { key: "name",    label: "Field name",  kind: "text" },
      { key: "options", label: "Options",     kind: "text", helper: "Comma-separated" },
    ],
    render: (n) => {
      const name = (n.props.name || "choice").replace(/[^\w-]/g, "_");
      const opts = (n.props.options || "").split(",").map((s) => s.trim()).filter(Boolean);
      const optionsHtml = opts.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      return `<label class="c-field">
        <span class="c-field-label">${escapeHtml(n.props.label || "Label")}</span>
        <select class="c-input" name="${name}">${optionsHtml}</select>
      </label>`;
    },
  },
};

/** Order of components in the palette. */
export const PALETTE_ORDER: ComponentKind[] = [
  "container", "form", "heading", "paragraph", "button",
  "input", "select",
  "stat-card", "list-item", "divider", "spacer", "image",
];

/* ─────────── Layouts ─────────── */

export const LAYOUTS: Record<LayoutKind, LayoutDef> = {
  single: {
    kind: "single",
    label: "Single column",
    zones: [{ key: "main", label: "Main" }],
    css: `
      .layout-single { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
    `,
    shell: `<div class="layout-single">{{ZONE:main}}</div>`,
  },

  sidebar: {
    kind: "sidebar",
    label: "Sidebar + main",
    zones: [
      { key: "sidebar", label: "Sidebar" },
      { key: "main",    label: "Main content" },
    ],
    css: `
      .layout-sidebar { display: grid; grid-template-columns: 240px 1fr; height: 100vh; }
      .layout-sidebar > .zone-sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 20px 16px; overflow-y: auto; }
      .layout-sidebar > .zone-main { padding: 28px 32px; overflow-y: auto; }
    `,
    shell: `<div class="layout-sidebar">
      <aside class="zone-sidebar">{{ZONE:sidebar}}</aside>
      <main class="zone-main">{{ZONE:main}}</main>
    </div>`,
  },

  dashboard: {
    kind: "dashboard",
    label: "Dashboard",
    zones: [
      { key: "topbar",  label: "Top bar" },
      { key: "stats",   label: "Stats row" },
      { key: "content", label: "Content list" },
    ],
    css: `
      .layout-dashboard { display: grid; grid-template-rows: auto auto 1fr; height: 100vh; }
      .layout-dashboard > .zone-topbar { padding: 18px 28px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
      .layout-dashboard > .zone-stats { padding: 20px 28px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
      .layout-dashboard > .zone-content { padding: 8px 28px 28px; overflow-y: auto; }
    `,
    shell: `<div class="layout-dashboard">
      <div class="zone-topbar">{{ZONE:topbar}}</div>
      <div class="zone-stats">{{ZONE:stats}}</div>
      <div class="zone-content">{{ZONE:content}}</div>
    </div>`,
  },
};
