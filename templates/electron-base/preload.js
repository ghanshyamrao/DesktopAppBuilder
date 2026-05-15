const { contextBridge, ipcRenderer, webFrame } = require("electron");

// ─────────────────────────────────────────────────────────────────────────
//  Chrome fingerprint spoofing (JS layer)
//
//  main.js handles HTTP-level spoofing (User-Agent + Sec-CH-UA headers +
//  --disable-features=UserAgentClientHint). That's enough to fool Google's
//  *server-side* OAuth UA check, but the sign-in page ALSO runs JS that
//  inspects:
//    • navigator.userAgentData       — must look like real Chrome
//    • window.chrome (+ .runtime)    — Electron's stripped version triggers
//                                      "Couldn't sign you in / browser not secure"
//    • navigator.webdriver           — must be false-y
//
//  We inject the spoof into the page's MAIN world (not the preload's
//  isolated world) via a one-shot <script> tag. That has to happen at
//  document_start so the override is in place before any page script
//  reads these properties.
// ─────────────────────────────────────────────────────────────────────────

function deriveChromeMajor() {
  // Read the UA *the session decided to send* — main.js sets this via
  // session.setUserAgent before any navigation, so it always carries the
  // stock-Chrome version string we want the JS shims to agree with.
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent || "");
  return m ? m[1] : "130";
}

function derivePlatformLabel() {
  const p = (navigator.platform || "").toLowerCase();
  if (p.includes("mac")) return "macOS";
  if (p.includes("linux")) return "Linux";
  return "Windows";
}

function buildSpoofSource() {
  const chromeMajor = deriveChromeMajor();
  const platformLabel = derivePlatformLabel();
  // Stringified so we can drop it into a <script> tag in the main world.
  // No closures over preload-scope variables — everything the spoof needs
  // is inlined as a literal.
  return `(function(){
  try {
    var brands = [
      { brand: "Chromium",     version: "${chromeMajor}" },
      { brand: "Google Chrome", version: "${chromeMajor}" },
      { brand: "Not.A/Brand",  version: "24" }
    ];
    var fullVersionList = brands.map(function(b){
      return { brand: b.brand, version: b.version + ".0.0.0" };
    });
    var uaData = {
      brands: brands,
      mobile: false,
      platform: "${platformLabel}",
      getHighEntropyValues: function(hints) {
        return Promise.resolve({
          architecture: "x86",
          bitness: "64",
          brands: brands,
          fullVersionList: fullVersionList,
          mobile: false,
          model: "",
          platform: "${platformLabel}",
          platformVersion: "10.0.0",
          uaFullVersion: "${chromeMajor}.0.0.0",
          wow64: false
        });
      },
      toJSON: function() {
        return { brands: brands, mobile: false, platform: "${platformLabel}" };
      }
    };
    try {
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: function(){ return uaData; },
        configurable: true
      });
    } catch (_) { /* property may already be locked — fall through */ }

    // Google's check looks for window.chrome with a runtime stub. Real
    // Chrome exposes this even without extensions installed.
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        // id is undefined in stock Chrome (no extension context)
        id: undefined,
        OnInstalledReason: { INSTALL: "install", UPDATE: "update" },
        OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
        PlatformArch: { ARM: "arm", ARM64: "arm64", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
        PlatformNaclArch: { ARM: "arm", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
        PlatformOs: { ANDROID: "android", CROS: "cros", LINUX: "linux", MAC: "mac", OPENBSD: "openbsd", WIN: "win" },
        RequestUpdateCheckStatus: { NO_UPDATE: "no_update", THROTTLED: "throttled", UPDATE_AVAILABLE: "update_available" }
      };
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
        RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
        getDetails: function(){ return null; },
        getIsInstalled: function(){ return false; },
        isInstalled: false
      };
    }
    if (!window.chrome.csi) window.chrome.csi = function(){ return {}; };
    if (!window.chrome.loadTimes) window.chrome.loadTimes = function(){ return {}; };

    // Strip the webdriver flag. Some Electron builds expose it as true,
    // which is the single most reliable embedded-browser tell.
    try {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: function(){ return false; },
        configurable: true
      });
    } catch (_) { /* ignore */ }

    // Some sniffers check navigator.plugins.length > 0 as a "real browser"
    // signal. Electron's plugin list is empty by default — install a
    // minimal stub so the length check passes.
    try {
      if (!navigator.plugins || navigator.plugins.length === 0) {
        var fakePlugins = [
          { name: "PDF Viewer",                description: "Portable Document Format", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer",         description: "Portable Document Format", filename: "internal-pdf-viewer" },
          { name: "Chromium PDF Viewer",       description: "Portable Document Format", filename: "internal-pdf-viewer" },
          { name: "Microsoft Edge PDF Viewer", description: "Portable Document Format", filename: "internal-pdf-viewer" },
          { name: "WebKit built-in PDF",       description: "Portable Document Format", filename: "internal-pdf-viewer" }
        ];
        Object.defineProperty(Navigator.prototype, "plugins", {
          get: function(){ return fakePlugins; },
          configurable: true
        });
      }
    } catch (_) { /* ignore */ }
  } catch (_) {
    // Spoofing is best-effort — never break the wrapped page.
  }
})();`;
}

/**
 * Run the spoof in the page's MAIN world before any page script executes.
 *
 *   1. webFrame.executeJavaScript — documented Electron API, runs in the
 *      main world. Queued execution is fine because preload happens before
 *      the page's first script tag is parsed.
 *   2. <script> tag injection — belt-and-suspenders fallback in case
 *      executeJavaScript is unavailable or rejects.
 *
 * Both paths are idempotent (the spoof's `if (!window.chrome.*)` guards),
 * so running them together is safe.
 */
function installFingerprintSpoof() {
  const source = buildSpoofSource();
  try {
    webFrame.executeJavaScript(source).catch(() => { /* fallback below */ });
  } catch (_) {
    /* fallback below */
  }
  try {
    const root = document.documentElement;
    if (root) {
      const tag = document.createElement("script");
      tag.textContent = source;
      root.appendChild(tag);
      tag.remove();
    }
  } catch (_) {
    /* best-effort */
  }
}

installFingerprintSpoof();

contextBridge.exposeInMainWorld("__w2a", {
  isWeb2App: true,
  version: "1.0.0",
  /** Fire a native OS notification. Returns true if shown. */
  notify: (payload) => ipcRenderer.invoke("w2a:notify", payload),
});
