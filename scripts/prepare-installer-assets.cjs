/**
 * Generate Windows installer assets from `logo2.png`.
 *
 * Two-icon strategy — the running app and the installer are *different*
 * contexts and need different icons:
 *
 *   - The running app, taskbar window, and desktop shortcut use the
 *     white-on-transparent `build/icon.png`. That logo was designed for
 *     dark UIs and looks right against a dark taskbar.
 *
 *   - The *installer* (EXE in Explorer, wizard dialog, Add/Remove
 *     Programs entry, uninstaller) uses `logo2.png`. NSIS dialog
 *     chrome is white, and Add/Remove Programs is light in most setups,
 *     so the white app icon would render invisibly there.
 *
 * Outputs to `build/`:
 *   - installerIcon.ico     (multi-size .ico — installer EXE icon)
 *   - uninstallerIcon.ico
 *   - installerHeader.bmp   (150x57, top-right of installer pages)
 *   - installerSidebar.bmp  (164x314, welcome/finish pages)
 *   - uninstallerSidebar.bmp
 *
 * Each bitmap centers the logo inside a white canvas at ~80% scale so
 * there's even margin and the result matches Slack/Zoom-style installers.
 */
const path = require("node:path");
const fs = require("node:fs");
const { Jimp } = require("jimp");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "logo2.png");
const OUT = path.join(ROOT, "build");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const HEADER_SIZE = { w: 150, h: 57 };
const SIDEBAR_SIZE = { w: 164, h: 314 };

// Windows + OneDrive + Defender can briefly lock freshly written files,
// producing errno -4094 ('UNKNOWN') on the next open. Writing to a temp
// file and renaming into place — with a few retries — sidesteps both.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeWrite(outPath, buf) {
  const tmp = `${outPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, buf);

  let lastErr;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.promises.rm(outPath, { force: true });
      await fs.promises.rename(tmp, outPath);
      return;
    } catch (err) {
      lastErr = err;
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "UNKNOWN"].includes(err.code)) throw err;
      await sleep(200 * (attempt + 1));
    }
  }
  await fs.promises.rm(tmp, { force: true }).catch(() => {});
  throw lastErr;
}

async function buildIco(srcPath, outPath) {
  const src = await Jimp.read(srcPath);
  const pngBuffers = await Promise.all(
    ICO_SIZES.map(async (size) => src.clone().resize({ w: size, h: size }).getBuffer("image/png")),
  );
  const ico = await pngToIco(pngBuffers);
  await safeWrite(outPath, ico);
  console.log(`  wrote ${path.relative(ROOT, outPath)} (${ICO_SIZES.join(",")})`);
}

async function buildBmp(srcPath, outPath, w, h) {
  const src = await Jimp.read(srcPath);
  // Fit the logo inside the canvas at ~80% so there's white margin —
  // matches what professional installers do (Slack, Zoom, etc.).
  const inset = Math.min(w, h) * 0.8;
  const fitted = src.clone().scaleToFit({ w: inset, h: inset });

  const canvas = new Jimp({ width: w, height: h, color: 0xffffffff });
  const x = Math.round((w - fitted.bitmap.width) / 2);
  const y = Math.round((h - fitted.bitmap.height) / 2);
  canvas.composite(fitted, x, y);

  const buf = await canvas.getBuffer("image/bmp");
  await safeWrite(outPath, buf);
  console.log(`  wrote ${path.relative(ROOT, outPath)} (${w}x${h})`);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.warn(`[installer-assets] ${SRC} not found — skipping.`);
    return;
  }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log("[installer-assets] generating from logo2.png …");
  await buildIco(SRC, path.join(OUT, "installerIcon.ico"));
  await buildIco(SRC, path.join(OUT, "uninstallerIcon.ico"));
  await buildBmp(SRC, path.join(OUT, "installerHeader.bmp"), HEADER_SIZE.w, HEADER_SIZE.h);
  await buildBmp(SRC, path.join(OUT, "installerSidebar.bmp"), SIDEBAR_SIZE.w, SIDEBAR_SIZE.h);
  await buildBmp(SRC, path.join(OUT, "uninstallerSidebar.bmp"), SIDEBAR_SIZE.w, SIDEBAR_SIZE.h);
  console.log("[installer-assets] done.");
}

main().catch((err) => {
  console.error("[installer-assets] failed:", err);
  process.exit(1);
});
