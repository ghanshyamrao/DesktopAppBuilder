const {
  app, BrowserWindow, WebContentsView, Menu, Tray, shell, screen, dialog,
  nativeImage, globalShortcut, ipcMain, Notification, session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const TITLE_BAR_HEIGHT = 38;

// ─────────────────────────────────────────────────────────────────────────
// Global Chrome impersonation. Has to be done at module load (BEFORE
// app.whenReady) so it applies to:
//   - the very first navigation
//   - all default-session XHR / fetch
//   - every popup window we create later
//
// Google's "Couldn't sign you in / this browser may not be secure" check
// inspects THREE things — fixing only one is not enough:
//   1. The `User-Agent` request header   → effectiveUA below
//   2. `Sec-CH-UA*` Client Hint headers  → either disabled at Chromium
//      level via --disable-features=UserAgentClientHint, or rewritten in
//      onBeforeSendHeaders. We do BOTH for resilience.
//   3. `navigator.userAgentData`         → setUserAgent on the session
//      propagates to JS so navigator.userAgent matches what providers see.
// ─────────────────────────────────────────────────────────────────────────

function computeStockChromeUA() {
  const chromeVersion = process.versions.chrome || "130.0.0.0";
  const platform =
    process.platform === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7"
    : process.platform === "linux" ? "X11; Linux x86_64"
    : "Windows NT 10.0; Win64; x64";
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}
const STOCK_UA = computeStockChromeUA();

// Strip "Electron" from the brand list Chromium attaches to outgoing
// requests. Without this, sec-ch-ua reads:
//   "Electron";v="33", "Chromium";v="130", "Not.A/Brand";v="24"
// and Google rejects the sign-in even with a clean User-Agent.
app.commandLine.appendSwitch("disable-features", "UserAgentClientHint");

// Fallback UA used when a webContents hasn't had setUserAgent called yet —
// covers the tiny race window between window creation and our hook firing.
app.userAgentFallback = STOCK_UA;

/**
 * Install a single header-rewriter on defaultSession that:
 *   - overwrites User-Agent with the Chrome string
 *   - drops every Electron-flavoured Sec-CH-UA-* hint, replacing the
 *     three Google actually cares about with real Chrome values
 *
 * onBeforeSendHeaders REPLACES the previously-installed handler when
 * called again, so this runs exactly once per launch.
 */
function installGlobalChromeSpoof(effectiveUA) {
  const ses = session.defaultSession;
  ses.setUserAgent(effectiveUA);

  const chromeMajor = (process.versions.chrome || "130").split(".")[0];
  const platformHint =
    process.platform === "darwin" ? '"macOS"'
    : process.platform === "linux" ? '"Linux"'
    : '"Windows"';
  // Match the brand-list shape Chrome 130 sends. "Not.A/Brand" is the
  // current Google-approved GREASE entry (changes ~yearly).
  const secChUa = `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not.A/Brand";v="24"`;

  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = { ...details.requestHeaders };
    // Always rewrite UA — even when --disable-features stripped sec-ch-ua,
    // the UA header itself is still attached by Chromium with the
    // Electron version unless we replace it here.
    h["User-Agent"] = effectiveUA;

    // Header names from Chromium can come in either case. Replace if
    // present; do NOT add when absent (so --disable-features stays in
    // charge of dropping them entirely).
    for (const k of Object.keys(h)) {
      const lk = k.toLowerCase();
      if (lk === "sec-ch-ua")            { delete h[k]; h["sec-ch-ua"]            = secChUa; }
      else if (lk === "sec-ch-ua-mobile")   { delete h[k]; h["sec-ch-ua-mobile"]   = "?0"; }
      else if (lk === "sec-ch-ua-platform") { delete h[k]; h["sec-ch-ua-platform"] = platformHint; }
      else if (
        lk === "sec-ch-ua-full-version" ||
        lk === "sec-ch-ua-full-version-list" ||
        lk === "sec-ch-ua-arch" ||
        lk === "sec-ch-ua-bitness" ||
        lk === "sec-ch-ua-model" ||
        lk === "sec-ch-ua-wow64" ||
        lk === "sec-ch-ua-platform-version"
      ) {
        delete h[k];
      }
    }
    cb({ requestHeaders: h });
  });
}

/**
 * Hosts that always serve OAuth/SSO consent screens. We allow window.open()
 * for these (instead of dumping them into the system browser) and forward
 * the spoofed Chrome UA into the popup so providers don't reject the
 * sign-in as coming from "an embedded browser".
 *
 * Path-scoped providers (GitHub, Discord, Twitter, Facebook) are checked
 * separately in `isOAuthPopupTarget()` — those hosts also serve normal
 * pages we don't want to capture.
 */
const OAUTH_HOST_PATTERNS = [
  /(^|\.)accounts\.google\.com$/i,
  /(^|\.)oauth2\.googleapis\.com$/i,
  /(^|\.)appleid\.apple\.com$/i,
  /(^|\.)login\.microsoftonline\.com$/i,
  /(^|\.)login\.microsoft\.com$/i,
  /(^|\.)login\.live\.com$/i,
  /(^|\.)login\.yahoo\.com$/i,
  /(^|\.)auth0\.com$/i,
  /(^|\.)okta\.com$/i,
  /(^|\.)okta-emea\.com$/i,
  /(^|\.)oktapreview\.com$/i,
  /(^|\.)clerk\.(com|dev|services)$/i,
  /(^|\.)workos\.com$/i,
  /(^|\.)firebaseapp\.com$/i,
  /(^|\.)supabase\.co$/i,
  /(^|\.)id\.atlassian\.com$/i,
  /(^|\.)slack\.com$/i,
  /(^|\.)linkedin\.com$/i,
];

/** True for any URL we want to open as an in-app popup rather than ext. */
function isOAuthPopupTarget(urlStr) {
  try {
    const u = new URL(urlStr);
    if (OAUTH_HOST_PATTERNS.some((re) => re.test(u.hostname))) return true;
    // Path-scoped: GitHub /login, /sessions, /oauth; Facebook /dialog/oauth;
    // X /i/oauth; Discord /oauth2; Reddit /api/v1/authorize.
    if (/(^|\.)github\.com$/i.test(u.hostname) && /^\/(login|sessions|oauth)(\/|$|\?)/.test(u.pathname)) return true;
    if (/(^|\.)facebook\.com$/i.test(u.hostname) && /^\/(dialog|v\d+\.\d+\/dialog)\//.test(u.pathname)) return true;
    if (/(^|\.)(twitter|x)\.com$/i.test(u.hostname) && /^\/(i\/oauth2?|oauth)\//.test(u.pathname)) return true;
    if (/(^|\.)discord\.com$/i.test(u.hostname) && /^\/(oauth2|api\/oauth2)\//.test(u.pathname)) return true;
    if (/(^|\.)reddit\.com$/i.test(u.hostname) && /^\/api\/v1\/authorize/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

/** True when targetUrl is on the same registrable domain as baseUrl. */
function isSameSite(targetUrl, baseUrl) {
  try {
    const a = new URL(targetUrl);
    const b = new URL(baseUrl);
    if (a.origin === b.origin) return true;
    // Allow naive subdomain match — myapp.com ↔ www.myapp.com ↔ app.myapp.com.
    const lastTwo = (h) => h.split(".").slice(-2).join(".");
    return lastTwo(a.hostname) === lastTwo(b.hostname);
  } catch {
    return false;
  }
}

/**
 * BrowserWindow options for an OAuth popup. Parented to the main window
 * so it floats and closes with the app, sized like a real browser popup,
 * and configured with the same security model as the wrapper.
 *
 * IMPORTANT: webPreferences.partition is *omitted* on purpose — leaving
 * it unset makes the popup share defaultSession with the parent, which
 * is what makes OAuth cookies land in the right cookie jar so the main
 * view sees the session after the popup closes.
 *
 * `effectiveUA` is forwarded only as documentation; the actual UA wiring
 * happens in `bindOAuthChild()` after the BrowserWindow exists.
 */
function oauthPopupOptions(parentView, title, features, _effectiveUA) {
  // Honour the width/height hints the wrapped site passed via window.open's
  // features string ("width=480,height=620"), but cap to something sane.
  const wMatch = /width=(\d+)/.exec(features || "");
  const hMatch = /height=(\d+)/.exec(features || "");
  const width = clamp(wMatch ? parseInt(wMatch[1], 10) : 520, 360, 900);
  const height = clamp(hMatch ? parseInt(hMatch[1], 10) : 700, 480, 1100);

  // Find the owning BrowserWindow for the parent view so we can attach.
  // WebContentsView doesn't expose .getOwnerBrowserWindow(); we look up by
  // walking BrowserWindow.getAllWindows() instead.
  const owner =
    BrowserWindow.getAllWindows().find((w) =>
      w.contentView && w.contentView.children && w.contentView.children.some((c) => c === parentView),
    ) || BrowserWindow.getFocusedWindow() || undefined;

  return {
    width,
    height,
    parent: owner,
    modal: false,
    title: title || "Sign in",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    minimizable: false,
    maximizable: false,
    webPreferences: {
      // Load the same preload as the main view so the JS-level Chrome
      // fingerprint spoof (navigator.userAgentData, window.chrome.runtime,
      // navigator.webdriver, navigator.plugins) is installed in the OAuth
      // popup too. Without this, Google's "Couldn't sign you in / browser
      // not secure" check fires inside the popup even when the parent
      // window passes — the popup is a brand-new webContents with no
      // inherited preload, and Google's JS sniff runs there.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * After Electron creates a popup we asked for, attach the spoofed UA,
 * the recursive popup handler (some flows pop a second window for SAML
 * IdPs), and an auto-close on callback so users don't end up stuck
 * staring at "You're signed in" pages with a parked popup.
 */
function bindOAuthChild(parentView, childWindow, initialUrl, effectiveUA) {
  if (!childWindow || childWindow.isDestroyed()) return;
  const wc = childWindow.webContents;

  // 1. UA — webContents-level only. defaultSession was already configured
  //    in installGlobalChromeSpoof(); re-registering onBeforeSendHeaders
  //    here would *replace* (not extend) the global handler with a less
  //    complete one that misses Sec-CH-UA rewrites.
  try { wc.setUserAgent(effectiveUA); } catch { /* best-effort */ }

  // 2. Recursive popup handling — Microsoft's enterprise SSO pops a
  //    nested popup for federated IdP login. Same rules apply there.
  wc.setWindowOpenHandler(({ url, features }) => {
    if (isOAuthPopupTarget(url) || isSameSite(url, initialUrl || "")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: oauthPopupOptions(parentView, "Sign in", features, effectiveUA),
      };
    }
    shell.openExternal(url).catch(() => { /* ignore */ });
    return { action: "deny" };
  });
  wc.on("did-create-window", (grand, det) => {
    bindOAuthChild(parentView, grand, det && det.url, effectiveUA);
  });

  // 3. Auto-close popup once it lands back on the wrapper's origin —
  //    that's the OAuth callback. The cookie has already landed in the
  //    shared session by the time `did-navigate` fires; reload the
  //    main view so the wrapped app sees the freshly-authenticated state.
  const closeIfCallback = (_event, navUrl) => {
    if (!navUrl) return;
    if (isSameSite(navUrl, (typeof config !== "undefined" && config.url) || "")) {
      // Tiny delay so the wrapped site's callback handler can complete its
      // own postMessage / cookie work before we close the popup.
      setTimeout(() => {
        if (childWindow.isDestroyed()) return;
        try {
          childWindow.close();
        } catch {
          /* ignore */
        }
      }, 250);
    }
  };
  wc.on("did-redirect-navigation", closeIfCallback);
  wc.on("did-navigate", closeIfCallback);

  // 4. When the popup actually closes, kick the main view to refresh —
  //    most OAuth flows expect window.opener.location.reload() to fire,
  //    which doesn't always happen reliably across navigations. A reload
  //    is cheap and makes the wrapped app re-fetch its session state.
  childWindow.on("closed", () => {
    if (parentView && parentView.webContents && !parentView.webContents.isDestroyed()) {
      try {
        parentView.webContents.reload();
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Map theme.windowFrame to native BrowserWindow options. Returns:
 *   { winOpts, useNativeOverlay }
 *
 * - "windows11" on win32: hand the caption controls to Windows (real min/max/
 *   close + mica) via titleBarOverlay; chrome.html hides its CSS-painted
 *   .win-controls when useNativeOverlay is true.
 * - everything else: keep titleBarStyle:"hidden" so we paint controls in CSS
 *   while preserving Aero snap, drag-to-tile, the resize border, and the
 *   right-click system menu.
 */
function frameToWindowOpts(frame) {
  if (frame === "windows11" && process.platform === "win32") {
    return {
      winOpts: {
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#1c1c1e",
          symbolColor: "#f5f5f7",
          height: TITLE_BAR_HEIGHT,
        },
        backgroundMaterial: "mica",
      },
      useNativeOverlay: true,
    };
  }
  return { winOpts: { titleBarStyle: "hidden" }, useNativeOverlay: false };
}

let config;
let configError = null;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf-8"));
} catch (err) {
  configError = err;
  config = { name: "App", url: "about:blank", window: {}, security: {}, actions: {} };
}

// Actions config — all native capability flags. Backwards-compatible with the
// old `features` block; we merge so existing builds keep working.
const APP_DISPLAY_NAME = String(config.name || "App").trim() || "App";

try {
  app.setName(APP_DISPLAY_NAME);
  if (process.platform === "win32") {
    // Windows uses this as the notification app label.
    app.setAppUserModelId(APP_DISPLAY_NAME);
  }
} catch {
  /* best-effort branding */
}

const actions = Object.assign(
  {
    applicationMenu: true,
    tray: true,
    singleInstance: true,
    minimizeToTray: false,
    startupLaunch: false,
    notifications: true,
    alwaysOnTop: false,
    deepLinkProtocol: "",
    globalShortcuts: [],
  },
  config.features || {},
  config.actions || {},
);

// Legacy alias used throughout the file.
const features = {
  applicationMenu: actions.applicationMenu,
  systemTray:      actions.tray,
  singleInstance:  actions.singleInstance,
  minimizeToTray:  actions.minimizeToTray,
};

const LOG_PATH = path.join(app.getPath("userData"), "app.log");

function logLine(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch { /* ignore */ }
  if (level === "error") console.error(line);
  else console.log(line);
}

const STATE_PATH = path.join(app.getPath("userData"), "window-state.json");

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")); } catch { return null; }
}

/**
 * True when the rectangle (x, y, w, h) overlaps any currently-attached
 * display by at least 100×100 px. Used before applying saved window
 * coordinates — if the user saved their position on a second monitor and
 * later disconnects it, the BrowserWindow gets created off-screen and
 * the taskbar icon becomes the only visible trace of the app (clicking
 * it minimizes/restores to the same off-screen position).
 *
 * Re-running screen.getAllDisplays() each call is fine — the result is
 * cheap and reflects hot-plug state.
 */
function boundsAreVisible(x, y, w, h) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const displays = screen.getAllDisplays();
  for (const d of displays) {
    const wa = d.workArea;
    const ix = Math.max(x, wa.x);
    const iy = Math.max(y, wa.y);
    const iw = Math.min(x + w, wa.x + wa.width)  - ix;
    const ih = Math.min(y + h, wa.y + wa.height) - iy;
    if (iw >= 100 && ih >= 100) return true;
  }
  return false;
}

function saveState(win) {
  if (!config.window.rememberState) return;
  try {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen() || win.isMaximized()) return;
    // Use content bounds (not getBounds) so the round-trip is independent of
    // the hidden native frame — otherwise Windows shaves a few pixels off
    // each launch when titleBarStyle:"hidden" is active.
    const bounds = win.getContentBounds();
    fs.writeFileSync(STATE_PATH, JSON.stringify(bounds));
  } catch { /* ignore */ }
}

let saveStateTimer = null;
function scheduleSaveState(win) {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => saveState(win), 400);
}

function resolveIcon() {
  const candidates = ["icon.png", "icon.ico", "icon.icns", "icon.jpg", "icon.svg"];
  for (const f of candidates) {
    const full = path.join(__dirname, f);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

/**
 * Read a workspace file (userStyles.css / userScript.js) without throwing.
 * Returns "" if the file is missing or unreadable so callers can simply
 * check truthiness before injecting.
 */
function readUserAsset(name) {
  try { return fs.readFileSync(path.join(__dirname, name), "utf-8"); }
  catch { return ""; }
}

function loadErrorHtml(name, errorDescription, validatedURL) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name)} — Failed to load</title>
<style>
  html, body { height: 100%; margin: 0; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #1c1c1e; color: #e6e8ed; }
  .wrap { height: 100%; display: flex; align-items: center; justify-content: center; padding: 32px; }
  .card { max-width: 560px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #9aa3b2; line-height: 1.55; margin: 6px 0; font-size: 14px; }
  code { background: #2a2a2c; padding: 2px 6px; border-radius: 4px; }
  button { margin-top: 18px; padding: 10px 18px; border-radius: 8px; border: 0; background: #3b82f6; color: white; font-size: 14px; cursor: pointer; }
  button:hover { filter: brightness(1.1); }
</style></head><body>
<div class="wrap"><div class="card">
  <h1>Couldn't load ${escapeHtml(name)}</h1>
  <p>${escapeHtml(errorDescription)}</p>
  <p><code>${escapeHtml(validatedURL)}</code></p>
  <button onclick="location.href=${JSON.stringify(config.url)}">Retry</button>
</div></div></body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let mainWindow = null;
let contentView = null;
let tray = null;
let quitting = false;

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (contentView && contentView.webContents && !contentView.webContents.isDestroyed()) {
    contentView.webContents.focus();
  }
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
  else showWindow();
}

function togglePin() {
  if (!mainWindow) return;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next);
  if (tray) {
    // Tray menu items don't auto-refresh when their `checked` flag changes,
    // so rebuild the menu in place to reflect the new pin state.
    tray.setContextMenu(buildTrayMenu());
  }
  // Push to the chrome so the toolbar's pin button shows its active state.
  mainWindow.webContents.send("chrome:pinned", next);
  return next;
}

function quitApp() {
  quitting = true;
  app.quit();
}

function runShortcutAction(action) {
  if (!mainWindow) return;
  switch (action) {
    case "show":      showWindow(); return;
    case "hide":      mainWindow.hide(); return;
    case "toggle":    toggleWindow(); return;
    case "reload":    contentView?.webContents.reload(); return;
    case "home":      contentView?.webContents.loadURL(config.url); return;
    case "togglePin": togglePin(); return;
    default: logLine("warn", `Unknown shortcut action: ${action}`);
  }
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => contentView?.webContents.reload() },
        { label: "Force Reload", accelerator: "CmdOrCtrl+Shift+R", click: () => contentView?.webContents.reloadIgnoringCache() },
        { type: "separator" },
        { label: "Home", accelerator: "Alt+Home", click: () => contentView?.webContents.loadURL(config.url) },
        { type: "separator" },
        isMac ? { role: "close" } : { label: "Exit", accelerator: "Alt+F4", click: () => quitApp() },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: process.platform === "darwin" ? "Ctrl+Cmd+F" : "F11",
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: "separator" },
        { label: "Zoom In",  accelerator: "CmdOrCtrl+=", click: () => zoom(+0.1) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => zoom(-0.1) },
        { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", click: () => contentView?.webContents.setZoomFactor(1) },
        ...(config.security.enableDevToolsInProduction
          ? [{ type: "separator" }, { label: "Toggle DevTools", accelerator: "F12", click: () => contentView?.webContents.toggleDevTools() }]
          : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { label: "Maximize", click: () => { if (!mainWindow) return; if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); } },
        { type: "separator" },
        { role: "close" },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function zoom(delta) {
  if (!contentView) return;
  const wc = contentView.webContents;
  wc.setZoomFactor(Math.max(0.25, Math.min(5, wc.getZoomFactor() + delta)));
}

function buildTrayMenu() {
  const pinned = !!mainWindow && mainWindow.isAlwaysOnTop();
  return Menu.buildFromTemplate([
    { label: `Open ${config.name}`, click: () => showWindow() },
    { label: "Hide", click: () => mainWindow?.hide() },
    { type: "separator" },
    { label: "Always on top", type: "checkbox", checked: pinned, click: () => togglePin() },
    { label: "Reload", click: () => contentView?.webContents.reload() },
    { type: "separator" },
    { label: "Quit", click: () => quitApp() },
  ]);
}

function createTray() {
  const iconPath = resolveIcon();
  const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  try {
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip(config.name);
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => toggleWindow());
    tray.on("double-click", () => showWindow());
  } catch (err) {
    logLine("warn", `Tray init failed: ${err.message}`);
    tray = null;
  }
}

function layoutContent(win, view) {
  if (!win || win.isDestroyed() || !view) return;
  const { width, height } = win.getContentBounds();
  const top = win.isFullScreen() ? 0 : TITLE_BAR_HEIGHT;
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}

function createWindow() {
  const saved = loadState();
  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = saved?.width ?? config.window.width ?? 1280;
  const height = saved?.height ?? config.window.height ?? 800;

  const { winOpts: frameWinOpts, useNativeOverlay } = frameToWindowOpts(config.windowFrame || "macos");

  const opts = {
    width, height,
    // width/height refer to the web content area, not the outer frame. This
    // pairs with getContentBounds() in saveState so dimensions don't drift
    // across launches when titleBarStyle:"hidden" hides the native frame.
    useContentSize: true,
    minWidth: 480, minHeight: 320,
    resizable: config.window.resizable !== false,
    fullscreen: !!config.window.fullscreen,
    icon: resolveIcon(),
    title: config.name,
    backgroundColor: "#1c1c1e",
    // Frame options (titleBarStyle / titleBarOverlay / backgroundMaterial)
    // come from the selected theme via frameToWindowOpts(). For "windows11"
    // on Windows, this hands the caption to the OS (mica + native buttons).
    // For everything else, titleBarStyle:"hidden" keeps Aero snap, the
    // resize border, and the right-click system menu while letting our
    // CSS chrome paint the buttons.
    ...frameWinOpts,
    autoHideMenuBar: true,   // shortcuts still work even though the bar is hidden
    show: false,             // wait for chrome to paint to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, "chrome-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  // Only restore the saved position when it actually intersects a
  // currently-attached display. Without this guard, an upgrade install
  // (or unplugging the monitor the app was last on) leaves the window
  // off-screen — visible in the taskbar with a hover preview, but
  // unreachable on click.
  if (saved && boundsAreVisible(saved.x, saved.y, width, height)) {
    opts.x = saved.x;
    opts.y = saved.y;
  } else if (config.window.centerOnLaunch !== false) {
    opts.x = Math.round((display.width - width) / 2);
    opts.y = Math.round((display.height - height) / 2);
  }

  const win = new BrowserWindow(opts);
  win.loadFile(path.join(__dirname, "chrome.html"));

  // Apply initial always-on-top state from the project's actions config.
  // Toggleable later via the tray menu, the togglePin shortcut, or by
  // clicking the dedicated chrome button (if the chrome exposes one).
  if (actions.alwaysOnTop) {
    try { win.setAlwaysOnTop(true); }
    catch (err) { logLine("warn", `setAlwaysOnTop failed: ${err.message}`); }
  }

  // The actual website lives in a WebContentsView placed below the title bar.
  // This keeps third-party CSS/JS from interfering with our chrome and
  // survives navigation cleanly (we don't have to re-inject anything).
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: config.security.contextIsolation !== false,
      nodeIntegration: config.security.nodeIntegration === true,
      sandbox: false,
    },
  });
  contentView = view;
  win.contentView.addChildView(view);
  layoutContent(win, view);

  win.on("resize", () => { layoutContent(win, view); scheduleSaveState(win); });
  win.on("move", () => scheduleSaveState(win));
  win.on("enter-full-screen", () => {
    layoutContent(win, view);
    win.webContents.send("chrome:fullscreen", true);
  });
  win.on("leave-full-screen", () => {
    layoutContent(win, view);
    win.webContents.send("chrome:fullscreen", false);
  });
  win.on("maximize", () => win.webContents.send("chrome:maximized", true));
  win.on("unmaximize", () => win.webContents.send("chrome:maximized", false));

  // Push initial state to the chrome once it has finished loading.
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("chrome:title", config.name);
    win.webContents.send("chrome:maximized", win.isMaximized());
    win.webContents.send("chrome:fullscreen", win.isFullScreen());
    win.webContents.send("chrome:nativeOverlay", useNativeOverlay);
    win.webContents.send("chrome:pinned", win.isAlwaysOnTop());
    broadcastNavState();
  });

  // Show the window once the chrome is painted; revealing the window before
  // the site finishes loading is fine because the chrome's `.stage` div fills
  // the area below the title bar with the same dark background, so there is
  // no white flash. Trying to wait for the site can hang on slow networks.
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  view.webContents.once("did-finish-load", () => {
    if (!win.isDestroyed()) view.webContents.focus();
  });

  // ---- content view security & event wiring ----
  if (config.security.disableContextMenu) {
    view.webContents.on("context-menu", (e) => e.preventDefault());
  }
  // UA spoof is handled globally by installGlobalChromeSpoof() in
  // app.whenReady — that sets defaultSession.setUserAgent + header
  // rewriter + commandLine flag once, before any window is created, so
  // even the very first navigation lands with the right fingerprint.
  // We only need the local `effectiveUA` here because the OAuth popup
  // helpers below still want to set it explicitly on each child
  // webContents as a third belt-and-suspenders layer.
  const effectiveUA = (config.security && config.security.customUserAgent) || STOCK_UA;
  view.webContents.setUserAgent(effectiveUA);

  // ── OAuth handling ──
  // Default behavior: keep OAuth inside the wrapper and rely on the stock
  // Chrome UA above to satisfy provider sniffing. Works for the vast
  // majority of sites (Netlify, Slack, Notion, GitHub, Linear, …).
  //
  // Opt-in deep-link mode (actions.oauthExternal + deepLinkProtocol):
  // intercept OAuth navigations and route them to the system browser, then
  // wait for the OS to deliver `<protocol>://callback?…` back to this app.
  // We rewrite that onto the original https origin and navigate the wrapper
  // webview to it, completing sign-in inside our cookie jar. This only
  // works when the OAuth provider has been configured (by the app owner)
  // to accept `<protocol>://callback` as a redirect URI — i.e. for first-
  // party apps where the user controls the OAuth client config.
  if (actions.oauthExternal && actions.deepLinkProtocol) {
    const oauthHostPatterns = [
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)appleid\.apple\.com$/i,
      /(^|\.)login\.microsoftonline\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)auth0\.com$/i,
      /(^|\.)okta\.com$/i,
      /(^|\.)okta-emea\.com$/i,
      /(^|\.)oktapreview\.com$/i,
    ];
    const isOauthUrl = (urlStr) => {
      try {
        const u = new URL(urlStr);
        if (oauthHostPatterns.some((re) => re.test(u.hostname))) return true;
        // Path-scoped providers — the host is also used for non-auth pages.
        if (/(^|\.)github\.com$/i.test(u.hostname) && /^\/login(\/|$)/.test(u.pathname)) return true;
        if (/(^|\.)facebook\.com$/i.test(u.hostname) && /^\/(dialog|v\d+\.\d+\/dialog)\//.test(u.pathname)) return true;
        if (/(^|\.)(twitter|x)\.com$/i.test(u.hostname) && /^\/i\/oauth2?\//.test(u.pathname)) return true;
        if (/(^|\.)discord\.com$/i.test(u.hostname) && /^\/oauth2\//.test(u.pathname)) return true;
        return false;
      } catch { return false; }
    };
    const externalize = (event, url) => {
      if (!isOauthUrl(url)) return;
      event.preventDefault();
      logLine("info", `OAuth externalize → ${url}`);
      shell.openExternal(url).catch((err) => {
        logLine("warn", `shell.openExternal failed: ${err.message}`);
      });
    };
    view.webContents.on("will-navigate", externalize);
    view.webContents.on("will-redirect", externalize);
  }
  if (!config.security.enableDevToolsInProduction) {
    view.webContents.on("before-input-event", (event, input) => {
      const k = (input.key || "").toLowerCase();
      const blocked = k === "f12" || (input.control && input.shift && (k === "i" || k === "j"));
      if (blocked) event.preventDefault();
    });
  }

  // ── Smart window-open handler ──────────────────────────────────────
  // The default Electron behaviour (or our previous "always deny + shell")
  // breaks every popup-based OAuth flow: providers open a sign-in popup
  // via window.open(), we hand it to the user's default browser, the
  // post-auth redirect lands there, and the desktop wrapper never sees
  // the new session cookie.
  //
  // The right shape:
  //   1. window.open() targeting an OAuth provider → in-app child window,
  //      so the cookie lands on the same defaultSession as the wrapper.
  //   2. window.open() targeting our own site → in-app child window
  //      (same reason — keep the cookie jar consistent).
  //   3. window.open() to anywhere else (random external link) → defer
  //      to shell.openExternal as before.
  //
  // The child window inherits our spoofed UA + handlers via
  // `did-create-window` below.
  view.webContents.setWindowOpenHandler(({ url, features }) => {
    if (!url || url === "about:blank") {
      // about:blank popups are usually the first frame of an OAuth flow
      // that immediately navigates — let it open and we'll catch it in
      // did-create-window.
      return {
        action: "allow",
        overrideBrowserWindowOptions: oauthPopupOptions(view, "Sign in", features, effectiveUA),
      };
    }
    if (isOAuthPopupTarget(url) || isSameSite(url, config.url)) {
      let title = "Sign in";
      try { title = new URL(url).hostname; } catch { /* keep default */ }
      logLine("info", `OAuth popup → ${url}`);
      return {
        action: "allow",
        overrideBrowserWindowOptions: oauthPopupOptions(view, title, features, effectiveUA),
      };
    }
    shell.openExternal(url).catch((err) => logLine("warn", `openExternal: ${err.message}`));
    return { action: "deny" };
  });

  // Inherit UA + smart handlers + auto-close-on-callback into popups.
  view.webContents.on("did-create-window", (childWindow, details) => {
    bindOAuthChild(view, childWindow, details && details.url, effectiveUA);
  });

  // Website-origin notifications can focus the embedded web contents without
  // raising our outer BrowserWindow. Bridge that focus back to the app shell.
  view.webContents.on("focus", () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
      showWindow();
    }
  });

  // Update toolbar back/forward state on every navigation. Both events
  // fire — `did-navigate-in-page` for SPA route changes, `did-navigate`
  // for full document navigations.
  view.webContents.on("did-navigate", () => broadcastNavState());
  view.webContents.on("did-navigate-in-page", () => broadcastNavState());

  // ---- user-authored CSS / JS injection ----
  // Read both files once at boot — they're written by the template generator
  // and bundled into the asar, so no IO surprise at runtime.
  const userStyles = readUserAsset("userStyles.css");
  const userScript = readUserAsset("userScript.js");

  // Re-inject on every navigation, not just the first load — wrapped sites
  // commonly do client-side routing where dom-ready fires once but we want
  // user CSS/JS to also apply after a hard reload.
  view.webContents.on("dom-ready", () => {
    if (userStyles && userStyles.trim() && !userStyles.startsWith("/* No custom CSS")) {
      view.webContents.insertCSS(userStyles).catch((err) => {
        logLine("warn", `insertCSS failed: ${err.message}`);
      });
    }
    if (userScript && userScript.trim() && !userScript.startsWith("// No custom JS")) {
      // Wrap in IIFE + try/catch so a syntax/runtime error in user code
      // can't blow up the wrapped site or our log noise.
      const wrapped = `(function(){try{\n${userScript}\n}catch(e){console.error("[Web2Desktop user script]",e);}})();`;
      view.webContents.executeJavaScript(wrapped, true).catch((err) => {
        logLine("warn", `executeJavaScript failed: ${err.message}`);
      });
    }
  });

  view.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — happens on normal navigations
    logLine("error", `did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
    view.webContents.loadURL(loadErrorHtml(config.name, errorDescription || `Network error ${errorCode}`, validatedURL || config.url));
  });

  view.webContents.on("render-process-gone", (_e, details) => {
    logLine("error", `render-process-gone reason=${details.reason}`);
  });

  win.on("close", (event) => {
    if (features.minimizeToTray && tray && !quitting) {
      event.preventDefault();
      win.hide();
      return;
    }
    saveState(win);
  });

  logLine("info", `Loading ${config.url}`);
  view.webContents.loadURL(config.url).catch((err) => {
    logLine("error", `loadURL failed: ${err.message}`);
    view.webContents.loadURL(loadErrorHtml(config.name, err.message, config.url));
  });

  return win;
}

// ---- IPC: window controls from the chrome ----
ipcMain.on("chrome:close", () => mainWindow?.close());
ipcMain.on("chrome:minimize", () => mainWindow?.minimize());
ipcMain.on("chrome:toggleMaximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

// ---- IPC: page navigation buttons in the chrome toolbar ----
ipcMain.on("chrome:back", () => {
  // Use webContents.navigationHistory if available (Electron 25+), fall back
  // to goBack() on older versions.
  const wc = contentView?.webContents;
  if (!wc) return;
  if (wc.navigationHistory && typeof wc.navigationHistory.canGoBack === "function") {
    if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  } else if (typeof wc.goBack === "function") {
    if (typeof wc.canGoBack === "function" ? wc.canGoBack() : true) wc.goBack();
  }
});
ipcMain.on("chrome:forward", () => {
  const wc = contentView?.webContents;
  if (!wc) return;
  if (wc.navigationHistory && typeof wc.navigationHistory.canGoForward === "function") {
    if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  } else if (typeof wc.goForward === "function") {
    if (typeof wc.canGoForward === "function" ? wc.canGoForward() : true) wc.goForward();
  }
});
ipcMain.on("chrome:reload", () => contentView?.webContents.reload());
ipcMain.on("chrome:home", () => contentView?.webContents.loadURL(config.url));
ipcMain.on("chrome:togglePin", () => togglePin());

/** Send the current can-go-back / can-go-forward state to the chrome so it
 *  can disable/enable the toolbar buttons. */
function broadcastNavState() {
  const wc = contentView?.webContents;
  if (!wc || !mainWindow) return;
  let canBack = false, canForward = false;
  try {
    if (wc.navigationHistory) {
      canBack = wc.navigationHistory.canGoBack();
      canForward = wc.navigationHistory.canGoForward();
    } else {
      canBack = wc.canGoBack?.() ?? false;
      canForward = wc.canGoForward?.() ?? false;
    }
  } catch { /* ignore */ }
  mainWindow.webContents.send("chrome:nav", { canBack, canForward });
}

// ---- IPC: native notifications from the wrapped page (preload exposes window.__w2a.notify) ----
ipcMain.handle("w2a:notify", (_e, payload) => {
  if (!actions.notifications) return false;
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: payload?.title || config.name,
    body:  payload?.body  || "",
    silent: !!payload?.silent,
    icon:  resolveIcon(),
  });
  n.on("click", () => showWindow());
  n.show();
  return true;
});

// ---- Deep linking: register a custom protocol so OS-wide links open here ----
let deepLinkProtocolCleaned = "";

/**
 * When an OAuth callback comes back as `<protocol>://callback?token=…`,
 * rewrite it onto the original https origin and navigate the wrapper
 * webview there. The provider must have been configured to redirect to
 * `<protocol>://callback?…` as a redirect URI.
 *
 * No-op if the inbound URL doesn't match our protocol or the project has
 * no original origin to map onto (config.url is missing/invalid).
 */
function handleDeepLink(rawUrl) {
  if (!rawUrl || !deepLinkProtocolCleaned) return;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return; }
  if (parsed.protocol.replace(/:$/, "").toLowerCase() !== deepLinkProtocolCleaned) return;

  let origin;
  try { origin = new URL(config.url).origin; }
  catch { logLine("warn", `deep-link: config.url is not a valid URL`); return; }

  // `myapp://callback?token=xyz` → URL parses with hostname="callback",
  // pathname="" or "/". Map both forms onto `<origin>/callback…`.
  // For more elaborate paths (`myapp://auth/callback`) preserve them.
  const segment = parsed.hostname + (parsed.pathname || "");
  const cleanedSegment = segment.replace(/^\/+/, "");
  const target = `${origin}/${cleanedSegment}${parsed.search || ""}${parsed.hash || ""}`;

  logLine("info", `deep-link → ${target}`);
  if (mainWindow) showWindow();
  if (contentView) {
    contentView.webContents.loadURL(target).catch((err) => {
      logLine("warn", `deep-link loadURL failed: ${err.message}`);
    });
  }
}

/** Pull the first deep-link URL out of an argv array. Windows hands the
 *  inbound `myapp://…` URL as the last element of argv on second-instance. */
function pickDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv) || !deepLinkProtocolCleaned) return null;
  const prefix = `${deepLinkProtocolCleaned}://`;
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i];
    if (typeof a === "string" && a.toLowerCase().startsWith(prefix)) return a;
  }
  return null;
}

function registerDeepLink(protocol) {
  if (!protocol) return;
  const cleaned = String(protocol).replace(/[^a-z0-9+\-.]/gi, "").toLowerCase();
  if (!cleaned) return;
  deepLinkProtocolCleaned = cleaned;
  // setAsDefaultProtocolClient is a no-op if already registered.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(cleaned, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(cleaned);
  }
  // Inbound URL on macOS:
  app.on("open-url", (event, url) => {
    event.preventDefault();
    logLine("info", `deep-link open-url: ${url}`);
    handleDeepLink(url);
  });
  // Inbound URL on cold start (Windows): the protocol URL is in argv when
  // the OS launches our exe to handle the link.
  const initial = pickDeepLinkFromArgv(process.argv);
  if (initial) {
    app.whenReady().then(() => handleDeepLink(initial));
  }
}
registerDeepLink(actions.deepLinkProtocol);

// ---- Startup launch (per-user, current Electron exe) ----
/**
 * Configure electron-updater against the user's feed URL (a directory hosting
 * `latest.yml` and the installer artifacts). The package is `require()`d
 * lazily so apps without an updateFeedUrl skip the dependency entirely if
 * for some reason it didn't ship — and so a transient install hiccup
 * never blocks the app from booting.
 *
 * Checks once on launch, then every 4 hours while the app is running.
 */
function setupAutoUpdater() {
  if (!config.updateFeedUrl) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    logLine("warn", `electron-updater not available: ${err.message}`);
    return;
  }
  try {
    autoUpdater.setFeedURL({ provider: "generic", url: config.updateFeedUrl });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("error", (err) => logLine("warn", `auto-update error: ${err?.message || err}`));
    autoUpdater.on("update-available", (i) => logLine("info", `update available: ${i?.version}`));
    autoUpdater.on("update-downloaded", (i) => logLine("info", `update downloaded: ${i?.version}`));
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logLine("warn", `checkForUpdatesAndNotify failed: ${err?.message || err}`);
    });
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => { /* logged via 'error' listener */ });
    }, 4 * 60 * 60 * 1000);
  } catch (err) {
    logLine("warn", `auto-updater setup failed: ${err.message}`);
  }
}

function applyStartupLaunch(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
    });
  } catch (err) {
    logLine("warn", `setLoginItemSettings failed: ${err.message}`);
  }
}
applyStartupLaunch(actions.startupLaunch);
// Auto-updater runs after app.whenReady() — defer until createWindow has
// finished so we never check before the user can see status.
app.whenReady().then(() => { setupAutoUpdater(); }).catch(() => { /* logged elsewhere */ });

// ---- single-instance lock (acquire early, exit hard if we lose) ----
if (features.singleInstance) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.exit(0);
  } else {
    app.on("second-instance", (_event, argv) => {
      if (mainWindow) showWindow();
      const url = pickDeepLinkFromArgv(argv);
      if (url) handleDeepLink(url);
    });
  }
}

process.on("uncaughtException", (err) => {
  logLine("error", `uncaughtException: ${err.stack || err.message}`);
});
process.on("unhandledRejection", (reason) => {
  logLine("error", `unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});

app.whenReady().then(() => {
  if (configError) {
    dialog.showErrorBox("Configuration error", `Could not read config.json:\n${configError.message}`);
    app.exit(1);
    return;
  }

  // Install the Chrome impersonator on defaultSession BEFORE the main view
  // attaches. Every navigation, XHR, fetch, and popup window that lands on
  // defaultSession (which is all of them by default) gets the spoofed UA
  // and the Sec-CH-UA rewrite.
  const effectiveUA = (config.security && config.security.customUserAgent) || STOCK_UA;
  installGlobalChromeSpoof(effectiveUA);

  if (features.applicationMenu) {
    Menu.setApplicationMenu(buildAppMenu());
  } else {
    Menu.setApplicationMenu(null);
  }

  try {
    mainWindow = createWindow();
  } catch (err) {
    logLine("error", `createWindow failed: ${err.stack || err.message}`);
    dialog.showErrorBox(`${config.name} — Startup error`, `The app failed to start.\n\n${err.message}\n\nLog: ${LOG_PATH}`);
    app.exit(1);
    return;
  }

  if (features.systemTray) createTray();

  // ---- Global shortcuts (system-wide accelerators) ----
  for (const sc of (actions.globalShortcuts || [])) {
    if (!sc?.accelerator || !sc?.action) continue;
    try {
      const ok = globalShortcut.register(sc.accelerator, () => runShortcutAction(sc.action));
      if (!ok) logLine("warn", `globalShortcut.register failed for ${sc.accelerator}`);
    } catch (err) {
      logLine("warn", `globalShortcut.register threw for ${sc.accelerator}: ${err.message}`);
    }
  }

  app.on("activate", () => {
    // Fires on macOS dock click and on Windows when the user re-launches
    // an already-running single-instance app. Recreate if there's no
    // window, otherwise unhide/restore so a tray-minimized or hidden
    // window comes back to the foreground.
    if (BrowserWindow.getAllWindows().length === 0) {
      try { mainWindow = createWindow(); }
      catch (err) { logLine("error", `createWindow (activate) failed: ${err.stack || err.message}`); }
    } else if (mainWindow) {
      showWindow();
    }
  });
}).catch((err) => {
  logLine("error", `whenReady handler threw: ${err.stack || err.message}`);
});

app.on("before-quit", () => { quitting = true; });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
});
