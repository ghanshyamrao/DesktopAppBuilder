import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { registerIpcHandlers, reconcileSubscriptionOnStartup } from "./ipc/handlers";

// Load .env so POSTHOG_API_KEY and POSTHOG_HOST are available in the main
// process. Wrapped in try/catch + lazy require so:
//   1. A missing `dotenv` module never crashes the packaged build (which
//      historically happened when the dep wasn't declared in package.json).
//   2. Two search paths cover both dev and packaged layouts:
//        dev:      <project>/.env             — via __dirname/../.env
//        packaged: resources/.env             — via process.resourcesPath
//      The first existing file wins.
try {
  const candidates = [
    path.join(__dirname, "..", ".env"),
    process.resourcesPath ? path.join(process.resourcesPath, ".env") : "",
  ].filter(Boolean);
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (envPath) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config: dotenvConfig } = require("dotenv");
    dotenvConfig({ path: envPath });
  }
} catch (err) {
  console.warn("[main] dotenv load failed — analytics keys may be missing:", err);
}
import { ProjectStore } from "./services/projectStore";
import { SettingsStore } from "./services/settingsStore";
import { BuildOrchestrator } from "./services/buildOrchestrator";
import { AIService } from "./services/aiService";
import { AuthService } from "./services/authService";
import { FirstRunService } from "./services/firstRunService";
import { PaddleService, summarize } from "./services/paddleService";

// Disable Electron's transparent asar virtualization for the builder's own
// fs operations. Generated apps' artifacts contain `app.asar` files and
// fs-extra walks would otherwise try to descend into them as directories.
process.noAsar = true;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const APP_PROTOCOL = "web2desktop";

let mainWindow: BrowserWindow | null = null;

// Module-level service refs so the deep-link handler can reach them
// without a parameter chain. Assigned inside `app.whenReady`.
let paddleService: PaddleService | null = null;
let settingsStoreRef: SettingsStore | null = null;
let authServiceRef: AuthService | null = null;

/**
 * Bring the main window forward — used by both the OAuth-callback browser
 * tab (via the `web2desktop://focus` protocol) and the second-instance
 * launch handler.
 */
function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/**
 * Route an incoming web2desktop://... URL. Currently handles:
 *   - web2desktop://focus               → just bring window forward
 *   - web2desktop://billing-success?_ptxn=...
 *                                       → verify Paddle transaction + persist
 *   - web2desktop://billing-cancel      → notify renderer (no-op state)
 */
let pendingDeepLink: string | null = null;
async function handleDeepLink(rawUrl: string): Promise<void> {
  if (!rawUrl) return;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (url.protocol !== `${APP_PROTOCOL}:`) return;
  focusMainWindow();

  // host portion identifies the action — protocol URLs of the form
  // `web2desktop://billing-success?...` parse with hostname="billing-success".
  const action = url.hostname;

  if (action === "billing-success") {
    // Paddle redirects with `?_ptxn=<transaction_id>` (their canonical
    // checkout-success param). Accept `session_id` too as a back-compat
    // fallback for any old Stripe-issued links that may still be in
    // flight from before the cutover.
    const sessionId =
      url.searchParams.get("_ptxn") ?? url.searchParams.get("session_id");
    if (!sessionId) return;
    // Defer the apply until the renderer + paddleService are both ready.
    // If services aren't initialized yet (cold launch), queue it.
    if (!paddleService || !settingsStoreRef || !authServiceRef) {
      pendingDeepLink = rawUrl;
      return;
    }
    try {
      const user = authServiceRef.currentUser();
      if (!user) {
        // Renderer will show a "Sign in to apply your purchase" toast.
        mainWindow?.webContents.send("billing:applyFailed", {
          reason: "Sign in to apply your purchase.",
        });
        return;
      }
      const prev = settingsStoreRef.get().subscription;
      // Verify in whichever Paddle environment the checkout was opened
      // in (persisted on the subscription by openCheckout). Falls back
      // to the service's current mode if no checkout is in flight.
      const mode = prev?.paddleMode ?? paddleService.currentMode;
      const next = await paddleService.verifyAndApplySession({
        sessionId,
        googleSub: user.sub,
        previous: prev,
        mode,
      });
      const updated = await settingsStoreRef.update({ subscription: next });
      mainWindow?.webContents.send("billing:state", summarize(updated.subscription));
    } catch (e) {
      mainWindow?.webContents.send("billing:applyFailed", {
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (action === "billing-cancel") {
    mainWindow?.webContents.send("billing:cancelled");
    return;
  }
}

/** Pluck the first web2desktop://… arg out of an argv array (Windows). */
function findProtocolUrlInArgv(argv: string[]): string | null {
  for (const a of argv) {
    if (typeof a === "string" && a.startsWith(`${APP_PROTOCOL}://`)) return a;
  }
  return null;
}

// Register the custom URI scheme. Browser tabs can navigate to
// `web2desktop://focus` after Google OAuth completes, and Windows/macOS
// will hand the URL to our running instance via `second-instance` /
// `open-url` instead of launching a new copy.
//
// In dev `process.execPath` is the Electron CLI binary, so we have to
// also pass our entry script path so Windows knows how to relaunch us.
if (process.platform === "win32") {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
  }
} else {
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

// Single-instance lock — when a second copy is launched (e.g. by the
// browser following `web2desktop://focus`), it just relays the URL to us
// via `second-instance` and exits.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", (_event, argv) => {
  focusMainWindow();
  const url = findProtocolUrlInArgv(argv);
  if (url) void handleDeepLink(url);
});

// macOS uses `open-url` for protocol handlers (Windows uses argv).
app.on("open-url", (event, url) => {
  event.preventDefault();
  focusMainWindow();
  void handleDeepLink(url);
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0B0E13",
    title: "WebToDesktop Builder",
    autoHideMenuBar: true,
    // Frameless on Win/Linux so we can paint our own chrome. On Windows the
    // `titleBarOverlay` keeps native min/max/close (with Win11 snap-layout
    // hover, accessibility) but recolors them to match our theme. macOS gets
    // hiddenInset which preserves the traffic-light buttons in the top-left.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay:
      process.platform === "win32"
        ? { color: "#0B0E13", symbolColor: "#E5E7EB", height: 32 }
        : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: 1.0,
    },
  });

  // Forward maximize state changes to the renderer so the title bar can
  // swap its restore/maximize glyph when the user double-clicks the drag
  // region or uses snap layouts.
  const emitMaxState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  };
  mainWindow.on("maximize", emitMaxState);
  mainWindow.on("unmaximize", emitMaxState);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  // Hard-pin the renderer zoom to 100% — Chromium persists Ctrl +/- changes
  // per origin in the user data dir, so we reset on every load and disable
  // the keyboard shortcuts and pinch-zoom that would mutate it.
  const resetZoom = (): void => {
    if (!mainWindow) return;
    mainWindow.webContents.setZoomFactor(1.0);
    mainWindow.webContents.setZoomLevel(0);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  };

  mainWindow.webContents.on("did-finish-load", resetZoom);
  mainWindow.webContents.on("did-navigate", resetZoom);
  mainWindow.webContents.on("did-navigate-in-page", resetZoom);

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    if (!ctrl) return;
    const k = (input.key || "").toLowerCase();
    if (k === "-" || k === "=" || k === "+" || k === "0") {
      event.preventDefault();
      resetZoom();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    if (process.env.W2A_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const projectStore = new ProjectStore();
  const settingsStore = new SettingsStore();
  const authService = new AuthService();
  const firstRunService = new FirstRunService();
  await projectStore.init();
  await settingsStore.init();
  await authService.init();
  await firstRunService.init();
  const orchestrator = new BuildOrchestrator(projectStore, settingsStore);
  const aiService = new AIService(settingsStore);
  paddleService = new PaddleService();

  // Expose to the deep-link handler. Until these are set, any incoming
  // protocol URL is queued in `pendingDeepLink` instead of being lost.
  settingsStoreRef = settingsStore;
  authServiceRef = authService;

  registerIpcHandlers({
    projectStore,
    settingsStore,
    orchestrator,
    aiService,
    authService,
    firstRunService,
    paddleService,
    getWindow: () => mainWindow,
  });

  createWindow();

  // After the renderer has loaded, drain any deep-link URL that arrived
  // before services were ready (cold-launched via a protocol click) and
  // reconcile the persisted subscription against Paddle so the BillingPage
  // reflects out-of-band changes (cross-device payments, dashboard cancels,
  // legacy Stripe state from before the migration).
  mainWindow?.webContents.once("did-finish-load", () => {
    // On Windows the launch URL sits in argv; on macOS it would have been
    // delivered via `open-url` and already queued.
    const argvUrl = findProtocolUrlInArgv(process.argv);
    if (argvUrl && !pendingDeepLink) pendingDeepLink = argvUrl;
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      void handleDeepLink(url);
    }
    // Capture the narrowed (non-null) reference for the closure — the
    // module-level `paddleService` is typed as nullable.
    const paddleSvc = paddleService;
    if (paddleSvc) {
      void reconcileSubscriptionOnStartup({
        settingsStore,
        paddleService: paddleSvc,
        getWindow: () => mainWindow,
      });
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, navigationUrl) => {
    const url = new URL(navigationUrl);
    if (url.origin !== "http://localhost:5173" && !navigationUrl.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});
