import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import { app, nativeImage } from "electron";
import { Jimp } from "jimp";
import type { AppProject, Theme } from "../types";
import { themeToCss } from "./themeCompiler";

const execFileAsync = promisify(execFile);
const MIN_ICON_DIMENSION = 256;

export interface MaterializeResult {
  warnings: string[];
}

export class TemplateGenerator {
  /**
   * Resolve the bundled template directory for the given project. URL
   * wrappers use `templates/electron-base/`; starter projects use
   * `templates/starters/<starterId>/`. In dev it's relative to the repo;
   * when packaged we ship them via electron-builder `extraResources`.
   */
  private templateRoot(project: AppProject): string {
    const root = app.isPackaged
      ? path.join(process.resourcesPath, "templates")
      : path.join(app.getAppPath(), "templates");

    if (project.kind === "starter" && project.starterId) {
      return path.join(root, "starters", project.starterId);
    }
    return path.join(root, "electron-base");
  }

  async materialize(project: AppProject, workspaceDir: string, theme?: Theme | null): Promise<MaterializeResult> {
    // Scene-compiled projects don't have a template directory — their
    // file map lives on the project record. Bypass the directory check
    // when sceneFiles is present.
    const isSceneProject = !!project.sceneFiles && Object.keys(project.sceneFiles).length > 0;

    const templateDir = isSceneProject ? null : this.templateRoot(project);
    if (templateDir !== null && !(await fs.pathExists(templateDir))) {
      throw new Error(`Template not found at ${templateDir}`);
    }

    // On Windows, fs.emptyDir() throws EBUSY when the previous build's .exe
    // is still running (or held open by Explorer/SmartScreen). Try to
    // terminate any stale executables in dist/ first, then attempt the
    // wipe with a clear, actionable error if it still fails.
    if (process.platform === "win32" && (await fs.pathExists(workspaceDir))) {
      await this.killStaleExes(workspaceDir);
    }

    try {
      await fs.emptyDir(workspaceDir);
    } catch (err) {
      if (err instanceof Error && /EBUSY|EPERM/i.test(err.message)) {
        throw new Error(
          "Couldn't clean the build workspace — a previously-built copy of the app appears to still be running. " +
          "Close it (check the taskbar / system tray) and try again.\n\n" +
          `(${err.message})`,
        );
      }
      throw err;
    }

    if (isSceneProject) {
      // Scene-compiled project: write each file from the project's
      // sceneFiles map. Keys are relative paths inside workspaceDir.
      // Subdirectories are auto-created via fs-extra's outputFile.
      for (const [relPath, content] of Object.entries(project.sceneFiles!)) {
        await fs.outputFile(path.join(workspaceDir, relPath), content, "utf-8");
      }
    } else {
      // Wrapper or directory-based starter: copy the template tree.
      await fs.copy(templateDir!, workspaceDir);
    }

    const warnings: string[] = [];
    let iconExt: string | undefined;

    if (project.iconPath && (await fs.pathExists(project.iconPath))) {
      const info = await this.copyIcon(project.iconPath, workspaceDir);
      if (info) {
        if (info.warning) warnings.push(info.warning);
        iconExt = info.ext;
      }
    }

    await this.writePackageJson(project, workspaceDir, iconExt);
    await this.writeAppConfig(project, workspaceDir);

    // Wrapper-specific artifacts (chrome.html, theme.css, userStyles.css /
    // userScript.js) don't apply to starter projects — those ship their own
    // main.js + index.html and don't use the chrome overlay system.
    if (project.kind !== "starter") {
      await this.writeTheme(theme, workspaceDir);
      await this.writeUserCode(project, workspaceDir);
      await this.bakeFrameIntoChrome(theme, workspaceDir);
    }
    return { warnings };
  }

  /**
   * Write the user's custom CSS / JS into the workspace. Always writes both
   * files (even if empty) so main.js can blindly read them — keeps the
   * runtime simple. The generated app injects them after dom-ready.
   */
  private async writeUserCode(project: AppProject, workspaceDir: string): Promise<void> {
    const css = (project.customCss ?? "").trim();
    const js = (project.customJs ?? "").trim();
    await fs.writeFile(
      path.join(workspaceDir, "userStyles.css"),
      css ? `${css}\n` : "/* No custom CSS for this project. */\n",
      "utf-8",
    );
    // Wrap user JS in an IIFE + try/catch so a syntax error in their code
    // can't crash the wrapped page or the host. The wrapper is added at
    // injection time in main.js, not here — we keep the source pristine
    // so power users can read it back unmodified.
    await fs.writeFile(
      path.join(workspaceDir, "userScript.js"),
      js ? `${js}\n` : "// No custom JS for this project.\n",
      "utf-8",
    );
  }

  /**
   * Windows-only: terminate any leftover .exe files in the workspace's
   * dist/ folder so the upcoming `fs.emptyDir(workspace)` can delete them.
   *
   * electron-builder writes installers + the unpacked app under dist/, and
   * users frequently leave the previous build's app running. Without this,
   * a rebuild fails with EBUSY on the .exe that's still loaded.
   *
   * Each `taskkill` call is best-effort — silently swallowed if the process
   * isn't running. After killing, we wait a short moment for Windows to
   * release the file handle.
   */
  private async killStaleExes(workspaceDir: string): Promise<void> {
    const distDir = path.join(workspaceDir, "dist");
    if (!(await fs.pathExists(distDir))) return;

    let exeNames: string[] = [];
    try {
      const collected = new Set<string>();
      // dist/ contains both top-level installer .exes (e.g. "App Setup
      // 1.0.0.exe") AND a "win-unpacked" subdir containing the actual app
      // .exe. Walk shallowly into both.
      const top = await fs.readdir(distDir, { withFileTypes: true });
      for (const e of top) {
        if (e.isFile() && e.name.toLowerCase().endsWith(".exe")) collected.add(e.name);
        if (e.isDirectory()) {
          try {
            const sub = await fs.readdir(path.join(distDir, e.name), { withFileTypes: true });
            for (const s of sub) {
              if (s.isFile() && s.name.toLowerCase().endsWith(".exe")) collected.add(s.name);
            }
          } catch { /* ignore unreadable subdir */ }
        }
      }
      exeNames = Array.from(collected);
    } catch { return; }

    if (exeNames.length === 0) return;

    for (const name of exeNames) {
      // /f = force, /t = include child processes. Errors are non-fatal —
      // the process may already be gone.
      try { await execFileAsync("taskkill", ["/f", "/t", "/im", name]); }
      catch { /* not running, or taskkill not available — ignore */ }
    }
    // Brief pause: Windows can hold the file lock for a few hundred ms
    // after the process exits while it flushes mapped sections.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  /**
   * Replace the static `data-frame` and `--w2a-frame` defaults in chrome.html
   * with the project theme's chosen frame. The runtime JS still re-applies
   * the value from theme.css on load (defense in depth), but baking it in
   * means the first paint already shows the right layout — no flash of
   * macOS traffic lights when the user picked windows11/frameless/unified.
   */
  private async bakeFrameIntoChrome(theme: Theme | null | undefined, workspaceDir: string): Promise<void> {
    const frame = theme?.windowFrame ?? "macos";
    const chromePath = path.join(workspaceDir, "chrome.html");
    if (!(await fs.pathExists(chromePath))) return;
    let html = await fs.readFile(chromePath, "utf-8");
    html = html.replace(/--w2a-frame:\s*"[^"]*";/g, `--w2a-frame:         "${frame}";`);
    html = html.replace(/<body\s+data-frame="[^"]*">/g, `<body data-frame="${frame}">`);
    await fs.writeFile(chromePath, html, "utf-8");
  }

  /**
   * Write the project's chosen theme as `theme.css` next to chrome.html. The
   * chrome's `<link rel="stylesheet" href="theme.css">` picks it up and the
   * --w2a-* variables override the defaults baked into chrome.html.
   * If no theme is configured we still write an empty stub so the link tag
   * doesn't 404 in dev tools.
   */
  private async writeTheme(theme: Theme | null | undefined, workspaceDir: string): Promise<void> {
    const css = theme
      ? themeToCss(theme)
      : "/* No custom theme — chrome.html defaults apply. */\n";
    await fs.writeFile(path.join(workspaceDir, "theme.css"), css, "utf-8");
  }

  private async writePackageJson(
    project: AppProject,
    workspaceDir: string,
    iconExt: string | undefined,
  ): Promise<void> {
    const pkgPath = path.join(workspaceDir, "package.json");
    const pkg = (await fs.readJson(pkgPath)) as Record<string, unknown>;
    const safeName = project.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "web2app";

    pkg.name = safeName;
    pkg.productName = project.name;
    pkg.description = project.description ?? "";
    pkg.version = "1.0.0";

    const winCfg: Record<string, unknown> = { target: "nsis" };
    const macCfg: Record<string, unknown> = { target: "dmg" };
    const linuxCfg: Record<string, unknown> = { target: "AppImage" };

    if (iconExt === ".ico") winCfg.icon = "icon.ico";
    if (iconExt === ".icns") macCfg.icon = "icon.icns";
    if (iconExt === ".png") {
      winCfg.icon = "icon.png";
      linuxCfg.icon = "icon.png";
    }

    if (project.kind === "starter") {
      // Starters ship their own electron-builder config (the right `files`
      // list for their structure, etc). Only override identity + icons +
      // appId — leave the rest of `build` alone so the starter's authored
      // config (file globs, NSIS, mac/linux targets) is respected.
      const existingBuild = (pkg.build ?? {}) as Record<string, unknown>;
      pkg.build = {
        ...existingBuild,
        appId: `com.web2desktop.${safeName}`,
        productName: project.name,
        win:   { ...((existingBuild.win   as object | undefined) ?? {}), ...winCfg },
        mac:   { ...((existingBuild.mac   as object | undefined) ?? {}), ...macCfg },
        linux: { ...((existingBuild.linux as object | undefined) ?? {}), ...linuxCfg },
      };
    } else {
      pkg.build = {
        appId: `com.web2app.${safeName}`,
        productName: project.name,
        directories: { output: "dist" },
        files: ["main.js", "preload.js", "chrome.html", "chrome-preload.js", "theme.css", "userStyles.css", "userScript.js", "config.json", "icon.*", "package.json"],
        asar: true,
        // Register the custom protocol so the OS routes <protocol>://… here.
        protocols: project.actions?.deepLinkProtocol
          ? [{ name: `${project.name} Protocol`, schemes: [project.actions.deepLinkProtocol] }]
          : undefined,
        win: { ...winCfg, target: [
          { target: "nsis", arch: ["x64"] },
          { target: "portable", arch: ["x64"] },
        ] },
        nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },
        mac: macCfg,
        linux: linuxCfg,
      };
    }

    await fs.writeJson(pkgPath, pkg, { spaces: 2 });
  }

  private async writeAppConfig(project: AppProject, workspaceDir: string): Promise<void> {
    const config = {
      name: project.name,
      url: project.url,
      window: project.window,
      security: project.security,
      actions: project.actions ?? null,
      // main.js reads this to choose native window options (titleBarOverlay,
      // mica, frame:false, etc) per the user's selected theme.
      windowFrame: project.theme?.windowFrame ?? "macos",
      // electron-updater feed URL — generated app reads this in
      // setupAutoUpdater(); empty/undefined means no update check.
      updateFeedUrl: project.updateFeedUrl ?? "",
    };
    await fs.writeJson(path.join(workspaceDir, "config.json"), config, { spaces: 2 });
  }

  private async copyIcon(
    srcPath: string,
    workspaceDir: string,
  ): Promise<{ ext: string; dimensions?: { w: number; h: number }; warning?: string } | undefined> {
    const srcExt = path.extname(srcPath).toLowerCase();
    if (![".ico", ".icns", ".png", ".jpg", ".jpeg", ".svg"].includes(srcExt)) return undefined;

    // For raster sources we always normalize to a PNG that is at least
    // 256×256 — electron-builder rejects smaller icons during the Windows
    // build even when no `win.icon` is explicitly set, because it
    // auto-discovers icon.* in the project root.
    if (srcExt === ".png" || srcExt === ".jpg" || srcExt === ".jpeg") {
      const target = path.join(workspaceDir, "icon.png");
      const { width, height, upscaled } = await this.normalizePng(srcPath, target);
      const warning = upscaled
        ? `Icon was ${width}×${height} — upscaled to ${MIN_ICON_DIMENSION}×${MIN_ICON_DIMENSION} for the Windows installer. Upload a larger PNG (or .ico) to avoid blurriness.`
        : undefined;
      return { ext: ".png", dimensions: { w: width, h: height }, warning };
    }

    // .ico needs the same 256×256 floor enforced — electron-builder rejects
    // small .ico files during the Windows build with "must be at least
    // 256x256". Parse the ICO directory and either pass it through (when
    // a large frame already exists) or rebuild it from an upscaled PNG
    // frame.
    if (srcExt === ".ico") {
      const target = path.join(workspaceDir, "icon.ico");
      const result = await this.normalizeIco(srcPath, target);
      return { ext: ".ico", dimensions: result.dimensions, warning: result.warning };
    }

    // .icns / .svg are passed through unchanged — they're not used on
    // Windows and electron-builder accepts them as-is on their target OSes.
    const target = path.join(workspaceDir, `icon${srcExt}`);
    await fs.copy(srcPath, target);
    return { ext: srcExt };
  }

  /**
   * Ensure an `icon.ico` written to the workspace has at least one
   * 256×256 frame (electron-builder's hard floor for Windows installers).
   *
   * Strategy:
   *   1. Parse the ICO directory header to enumerate frames.
   *   2. If any frame is already ≥ 256 on both axes, copy the file
   *      unchanged — multi-resolution icons are preserved as authored.
   *   3. Otherwise pick the best PNG-encoded frame (Jimp can decode it),
   *      upscale to 256×256 with transparent padding, and rebuild a new
   *      .ico via png-to-ico so the Windows pipeline succeeds.
   *   4. If no frame is PNG-encoded (legacy BMP-only .ico), copy as-is
   *      and warn the user — there's no single-frame fallback we can
   *      decode reliably without a BMP-DIB parser.
   */
  private async normalizeIco(
    srcPath: string,
    target: string,
  ): Promise<{ dimensions?: { w: number; h: number }; warning?: string }> {
    const buf = await fs.readFile(srcPath);
    const frames = this.parseIcoFrames(buf);

    if (frames.length === 0) {
      // Couldn't parse — let electron-builder be the judge.
      await fs.writeFile(target, buf);
      return {};
    }

    const largest = frames.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));

    if (largest.width >= MIN_ICON_DIMENSION && largest.height >= MIN_ICON_DIMENSION) {
      await fs.writeFile(target, buf);
      return { dimensions: { w: largest.width, h: largest.height } };
    }

    // Need to upscale. Try to extract a PNG frame inline first (zero-copy
    // path, works for modern .ico files with embedded PNG data). If only
    // BMP-encoded frames exist, fall back to Electron's nativeImage which
    // decodes ICO BMP frames natively via the OS image decoder — neither
    // Jimp nor png-to-ico can read those headers because the DIB is
    // stripped and an AND mask follows the pixel data.
    const pngSource = frames
      .filter((f) => f.isPng)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];

    let pngBuf: Buffer;
    try {
      if (pngSource) {
        pngBuf = pngSource.data;
      } else {
        const decoded = nativeImage.createFromPath(srcPath);
        if (decoded.isEmpty()) {
          throw new Error("nativeImage couldn't decode the .ico file");
        }
        pngBuf = decoded.toPNG();
      }
    } catch (err) {
      await fs.writeFile(target, buf);
      return {
        dimensions: { w: largest.width, h: largest.height },
        warning: `Icon's largest frame is ${largest.width}×${largest.height} and couldn't be decoded for upscaling (${err instanceof Error ? err.message : String(err)}). Re-export at ${MIN_ICON_DIMENSION}×${MIN_ICON_DIMENSION} or larger.`,
      };
    }

    try {
      const png = await Jimp.read(pngBuf);
      const origW = png.bitmap.width;
      const origH = png.bitmap.height;
      const scale = MIN_ICON_DIMENSION / Math.max(origW, origH);
      const newW = Math.max(1, Math.round(origW * scale));
      const newH = Math.max(1, Math.round(origH * scale));
      png.resize({ w: newW, h: newH });
      const canvas = new Jimp({ width: MIN_ICON_DIMENSION, height: MIN_ICON_DIMENSION, color: 0x00000000 });
      canvas.composite(png, Math.floor((MIN_ICON_DIMENSION - newW) / 2), Math.floor((MIN_ICON_DIMENSION - newH) / 2));
      const bigPng = await canvas.getBuffer("image/png");

      // png-to-ico ships as ESM in recent versions, so a static require()
      // throws ERR_REQUIRE_ESM under CommonJS. We need a real dynamic
      // import() at runtime — but TypeScript with module:"CommonJS"
      // transpiles `await import(...)` back into `require(...)`, which
      // would re-trigger the same error. The Function constructor hides
      // the import() from TS's transformer so it survives to runtime as
      // a native ES dynamic import.
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)",
      ) as (s: string) => Promise<unknown>;
      const pngToIcoModule = (await dynamicImport("png-to-ico")) as
        | ((input: Buffer | Buffer[]) => Promise<Buffer>)
        | { default: (input: Buffer | Buffer[]) => Promise<Buffer> };
      const pngToIco =
        typeof pngToIcoModule === "function" ? pngToIcoModule : pngToIcoModule.default;
      const icoBuf = await pngToIco([bigPng]);
      await fs.writeFile(target, icoBuf);

      return {
        dimensions: { w: largest.width, h: largest.height },
        warning: `Icon's largest frame was ${largest.width}×${largest.height} — upscaled to ${MIN_ICON_DIMENSION}×${MIN_ICON_DIMENSION} for the Windows installer. Upload a larger source to avoid blurriness.`,
      };
    } catch (err) {
      // Decode/encode failure — leave the original .ico in place rather
      // than ship no icon. The build will still fail downstream, but the
      // surfaced warning tells the user what to do.
      await fs.writeFile(target, buf);
      return {
        dimensions: { w: largest.width, h: largest.height },
        warning: `Couldn't upscale icon (${err instanceof Error ? err.message : String(err)}). Re-export at ${MIN_ICON_DIMENSION}×${MIN_ICON_DIMENSION} or larger.`,
      };
    }
  }

  /**
   * Parse an ICO file's directory header into frame metadata. Each entry
   * in the directory carries a width/height byte (where 0 means 256), the
   * size of the embedded image data, and its offset. We slice the actual
   * image bytes out so the caller can sniff for the PNG signature without
   * re-reading the file.
   */
  private parseIcoFrames(
    buf: Buffer,
  ): Array<{ width: number; height: number; data: Buffer; isPng: boolean }> {
    if (buf.length < 6) return [];
    const reserved = buf.readUInt16LE(0);
    const type = buf.readUInt16LE(2);
    const count = buf.readUInt16LE(4);
    if (reserved !== 0 || type !== 1 || count === 0) return [];

    const frames: Array<{ width: number; height: number; data: Buffer; isPng: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16;
      if (entryOffset + 16 > buf.length) break;
      const w = buf.readUInt8(entryOffset) || 256;
      const h = buf.readUInt8(entryOffset + 1) || 256;
      const dataSize = buf.readUInt32LE(entryOffset + 8);
      const dataOffset = buf.readUInt32LE(entryOffset + 12);
      if (dataOffset + dataSize > buf.length || dataSize === 0) continue;
      const data = buf.subarray(dataOffset, dataOffset + dataSize);
      const isPng =
        data.length >= 8 &&
        data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
        data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
      frames.push({ width: w, height: h, data, isPng });
    }
    return frames;
  }

  /**
   * Read the source image with jimp, upscale it to MIN_ICON_DIMENSION on the
   * shorter edge if needed (preserving aspect ratio, then padding to a
   * square), and write a PNG to `target`. Returns the ORIGINAL dimensions
   * plus an `upscaled` flag so callers can warn the user.
   */
  private async normalizePng(
    srcPath: string,
    target: string,
  ): Promise<{ width: number; height: number; upscaled: boolean }> {
    const img = await Jimp.read(srcPath);
    const origW = img.bitmap.width;
    const origH = img.bitmap.height;
    const needsUpscale = origW < MIN_ICON_DIMENSION || origH < MIN_ICON_DIMENSION;

    if (needsUpscale) {
      // Scale so the longer edge hits MIN_ICON_DIMENSION, then pad with
      // transparent pixels into a square canvas. This avoids stretching a
      // non-square icon out of proportion.
      const scale = MIN_ICON_DIMENSION / Math.max(origW, origH);
      const newW = Math.max(1, Math.round(origW * scale));
      const newH = Math.max(1, Math.round(origH * scale));
      img.resize({ w: newW, h: newH });

      const canvas = new Jimp({ width: MIN_ICON_DIMENSION, height: MIN_ICON_DIMENSION, color: 0x00000000 });
      canvas.composite(img, Math.floor((MIN_ICON_DIMENSION - newW) / 2), Math.floor((MIN_ICON_DIMENSION - newH) / 2));
      const buf = await canvas.getBuffer("image/png");
      await fs.writeFile(target, buf);
    } else {
      const buf = await img.getBuffer("image/png");
      await fs.writeFile(target, buf);
    }

    return { width: origW, height: origH, upscaled: needsUpscale };
  }

}
