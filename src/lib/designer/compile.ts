import { COMPONENTS, LAYOUTS } from "./registry";
import type { ComponentNode, DesignerDoc } from "./types";

/**
 * Render a single node (recursing into children when the def opts in).
 * Used by both the compile pipeline (output HTML) and the canvas preview.
 */
function renderNode(node: ComponentNode): string {
  const def = COMPONENTS[node.kind];
  if (!def) return `<!-- unknown component: ${node.kind} -->`;
  let childrenHtml = "";
  if (def.acceptsChildren && node.children?.length) {
    childrenHtml = node.children.map(renderNode).join("\n");
  }
  try { return def.render(node, childrenHtml); }
  catch (e) { return `<!-- render error in ${node.kind}: ${(e as Error).message} -->`; }
}

/**
 * Compile a DesignerDoc into a complete Electron project file map. Returns
 * `{ "main.js": "...", "index.html": "...", "package.json": "...", ... }`
 * — exactly the shape the template generator's sceneFiles path expects.
 *
 * The compiled app is fully self-contained: no build chain, no external
 * deps beyond electron itself. Users can `npm install && npm start` after
 * exporting source.
 */
export function compileDesignerDoc(doc: DesignerDoc): Record<string, string> {
  const layout = LAYOUTS[doc.layout];
  if (!layout) throw new Error(`Unknown layout: ${doc.layout}`);

  // Render each zone's nodes (recursing into containers), then substitute
  // into the layout shell.
  let shell = layout.shell;
  for (const zone of layout.zones) {
    const nodes = doc.zones[zone.key] ?? [];
    const rendered = nodes.map(renderNode).join("\n");
    shell = shell.replace(`{{ZONE:${zone.key}}}`, rendered);
  }

  return {
    "main.js":      compileMainJs(doc),
    "preload.js":   compilePreloadJs(),
    "index.html":   compileIndexHtml(doc, shell, layout.css),
    "package.json": compilePackageJson(doc),
    "config.json":  JSON.stringify({ name: doc.appName }, null, 2) + "\n",
  };
}

function compileMainJs(doc: DesignerDoc): string {
  const productName = JSON.stringify(doc.appName || "App");
  return `const { app, BrowserWindow } = require("electron");
const path = require("node:path");

let win = null;
function create() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 480,
    minHeight: 320,
    title: ${productName},
    backgroundColor: "${doc.tokens.bg}",
    autoHideMenuBar: true,
    show: false,
    icon: require("node:fs").existsSync(path.join(__dirname, "icon.png"))
      ? path.join(__dirname, "icon.png")
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
}
app.whenReady().then(create);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) create(); });
`;
}

function compilePreloadJs(): string {
  return `const { contextBridge, shell } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // openLink delegates to the OS so http(s) URLs open in the user's
  // default browser instead of attempting in-app navigation.
  openLink: (url) => { try { shell.openExternal(url); } catch {} },
});
`;
}

function compileIndexHtml(doc: DesignerDoc, body: string, layoutCss: string): string {
  const t = doc.tokens;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:" />
<title>${escape(doc.appName || "App")}</title>
<style>
:root {
  --bg:      ${t.bg};
  --surface: ${t.surface};
  --accent:  ${t.accent};
  --text:    ${t.text};
  --muted:   ${t.muted};
  --border:  ${t.border};
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font: 14px -apple-system, "Segoe UI", system-ui, sans-serif;
}
${layoutCss}
/* ─── Component styles ─── */
.c-heading { font-weight: 600; letter-spacing: -0.01em; }
h1.c-heading { font-size: 32px; margin: 16px 0; }
h2.c-heading { font-size: 22px; margin: 12px 0; }
h3.c-heading { font-size: 16px; margin: 8px 0; }
.c-paragraph { line-height: 1.6; margin: 8px 0; }
.c-paragraph.muted { color: var(--muted); }
.c-button {
  display: inline-block; margin: 6px 0; padding: 10px 18px;
  border: 0; border-radius: 8px; font: inherit; cursor: default;
  transition: filter 100ms, transform 100ms, background 100ms;
}
.c-button.primary   { background: var(--accent); color: white; }
.c-button.secondary { background: rgba(255,255,255,0.06); color: var(--text); border: 1px solid var(--border); }
.c-button:hover  { filter: brightness(1.1); }
.c-button:active { transform: translateY(1px); }
.c-stat {
  padding: 16px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--border);
}
.c-stat-value { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.c-stat-label { color: var(--muted); font-size: 12px; margin-top: 4px; }
.c-stat.tone-blue   { box-shadow: inset 3px 0 0 #5b9dff; }
.c-stat.tone-green  { box-shadow: inset 3px 0 0 #10b981; }
.c-stat.tone-amber  { box-shadow: inset 3px 0 0 #f59e0b; }
.c-stat.tone-violet { box-shadow: inset 3px 0 0 #a78bfa; }
.c-stat.tone-red    { box-shadow: inset 3px 0 0 #ef4444; }
.c-list-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 12px; margin: 4px 0; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface);
}
.c-list-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04); color: var(--accent); font-weight: 600;
}
.c-list-title    { font-weight: 500; }
.c-list-subtitle { color: var(--muted); font-size: 12px; margin-top: 2px; }
.c-divider { border: 0; border-top: 1px solid var(--border); margin: 16px 0; }
.c-spacer  { flex-shrink: 0; }
.c-image { margin: 8px 0; }
.c-image img { max-width: 100%; border-radius: 8px; display: block; }
.c-image-placeholder {
  padding: 32px; text-align: center; border: 1px dashed var(--border);
  border-radius: 8px; color: var(--muted);
}
.c-image-caption { color: var(--muted); font-size: 12px; margin-top: 6px; }
/* Container */
.c-container {
  display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: 10px;
  background: rgba(255,255,255,0.02);
}
.c-container-row { flex-direction: row; flex-wrap: wrap; }
.c-container-title { font-weight: 600; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
/* Form */
.c-form {
  display: flex; flex-direction: column; gap: 14px;
  padding: 20px; border: 1px solid var(--border); border-radius: 12px;
  background: var(--surface); max-width: 480px;
}
.c-form-title { font-size: 18px; font-weight: 600; }
.c-field { display: flex; flex-direction: column; gap: 6px; }
.c-field-label { font-size: 12px; color: var(--muted); }
.c-input {
  padding: 9px 11px; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--border);
  color: var(--text); font: inherit; outline: none;
  transition: border-color 100ms;
}
.c-input:focus { border-color: var(--accent); }
</style>
</head>
<body>
${body}
<script>
// Generic action dispatcher. Buttons in the compiled app declare their
// intent via data-action; we route here at runtime so users get sensible
// behavior without authoring custom JS for every button.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const data = btn.getAttribute("data-action-data") || "";
  if (action === "alert") {
    alert(data || btn.textContent);
  } else if (action === "openLink" && data) {
    if (window.api && window.api.openLink) window.api.openLink(data);
    else window.open(data, "_blank");
  }
});

// Form-submit handler. Forms render with onsubmit=return false to suppress
// the native navigation, so we delegate clicks on data-form-submit buttons
// to collect field values and run the configured action.
document.addEventListener("click", (e) => {
  const submit = e.target.closest("[data-form-submit]");
  if (!submit) return;
  const form = submit.closest("form");
  if (!form) return;
  const action = submit.getAttribute("data-form-submit") || "alert";
  const message = submit.getAttribute("data-submit-message") || "";
  const values = {};
  for (const el of form.elements) {
    if (el.name) values[el.name] = el.value;
  }
  if (action === "alert") {
    const summary = Object.entries(values).map(([k, v]) => k + ": " + v).join("\\n");
    alert((message ? message + "\\n\\n" : "") + summary);
  } else if (action === "log") {
    console.log("[form submit]", values);
  }
});
</script>
</body>
</html>
`;
}

function compilePackageJson(doc: DesignerDoc): string {
  const safeName = (doc.appName || "designer-app").toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "designer-app";
  const pkg = {
    name: safeName,
    productName: doc.appName || "App",
    version: "1.0.0",
    description: "Generated by WebToDesktop Builder",
    main: "main.js",
    scripts: { start: "electron ." },
    devDependencies: {
      electron: "^33.2.0",
      "electron-builder": "^25.1.8",
    },
    build: {
      appId: `com.web2desktop.designer.${safeName}`,
      productName: doc.appName || "App",
      directories: { output: "dist" },
      files: ["main.js", "preload.js", "index.html", "config.json", "icon.*", "package.json"],
      win:   { target: "nsis" },
      mac:   { target: "dmg" },
      linux: { target: "AppImage" },
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as const)[c]!);
}
