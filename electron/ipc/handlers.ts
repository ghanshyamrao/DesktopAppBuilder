import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";
import fs from "fs-extra";
import path from "node:path";
import type { AppProject, GlobalSettings, IpcResult, SubscriptionState } from "../types";
import { ProjectStore } from "../services/projectStore";
import { SettingsStore } from "../services/settingsStore";
import { BuildOrchestrator } from "../services/buildOrchestrator";
import { AIService } from "../services/aiService";
import { AuthService } from "../services/authService";
import { FirstRunService } from "../services/firstRunService";
import { PaddleService, summarize, isDowngrade, planByKey, todayKey, type SubscriptionSummary } from "../services/paddleService";
import { probeSymlinkPrivilege } from "../services/windowsCapabilities";

interface Deps {
  projectStore: ProjectStore;
  settingsStore: SettingsStore;
  orchestrator: BuildOrchestrator;
  aiService: AIService;
  authService: AuthService;
  firstRunService: FirstRunService;
  paddleService: PaddleService;
  getWindow: () => BrowserWindow | null;
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerIpcHandlers(deps: Deps): void {
  const { projectStore, settingsStore, orchestrator, aiService, authService, firstRunService, paddleService, getWindow } = deps;

  // Window control IPC — backs the custom title bar's File→Exit / Window
  // menus and the explicit min/max/close buttons (used as a fallback on
  // platforms where titleBarOverlay isn't supported).
  ipcMain.handle("window:minimize", async () => {
    try { getWindow()?.minimize(); return ok(undefined); } catch (e) { return fail(e); }
  });
  ipcMain.handle("window:toggleMaximize", async () => {
    try {
      const w = getWindow();
      if (!w) return ok({ maximized: false });
      if (w.isMaximized()) w.unmaximize(); else w.maximize();
      return ok({ maximized: w.isMaximized() });
    } catch (e) { return fail(e); }
  });
  ipcMain.handle("window:close", async () => {
    try { getWindow()?.close(); return ok(undefined); } catch (e) { return fail(e); }
  });
  ipcMain.handle("window:isMaximized", async () => {
    try { return ok({ maximized: getWindow()?.isMaximized() ?? false }); } catch (e) { return fail(e); }
  });
  ipcMain.handle("window:reload", async () => {
    try { getWindow()?.webContents.reload(); return ok(undefined); } catch (e) { return fail(e); }
  });
  ipcMain.handle("window:toggleDevTools", async () => {
    try { getWindow()?.webContents.toggleDevTools(); return ok(undefined); } catch (e) { return fail(e); }
  });

  // Repaint the native min/max/close overlay region to match the renderer's
  // current theme. Called whenever the user switches between dark/light so
  // the overlay never visibly clashes with the title bar around it.
  ipcMain.handle("window:setTitleBarOverlay", async (_e, color: string, symbolColor: string) => {
    try {
      const w = getWindow();
      // setTitleBarOverlay is Windows-only — calling it on macOS/Linux throws.
      if (w && process.platform === "win32") {
        w.setTitleBarOverlay({ color, symbolColor, height: 32 });
      }
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("projects:list", async () => {
    try {
      return ok(projectStore.list());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("projects:get", async (_e, id: string) => {
    try {
      const p = projectStore.get(id);
      if (!p) return fail(new Error("Project not found"));
      return ok(p);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("projects:create", async (_e, input: Omit<AppProject, "id" | "createdAt" | "updatedAt">) => {
    try {
      validateProjectInput(input);
      const created = await projectStore.create(input);
      return ok(created);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("projects:update", async (_e, id: string, patch: Partial<AppProject>) => {
    try {
      // Skip URL validation for starter/scene projects — they don't use it.
      if (patch.url) {
        const existing = projectStore.get(id);
        if (existing?.kind !== "starter") validateUrl(patch.url);
      }
      const updated = await projectStore.update(id, patch);
      return ok(updated);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("projects:delete", async (_e, id: string) => {
    try {
      await projectStore.delete(id);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:start", async (_e, projectId: string) => {
    try {
      const project = projectStore.get(projectId);
      if (!project) throw new Error("Project not found");
      const buildId = await orchestrator.start(project);
      return ok({ buildId });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:cancel", async (_e, buildId: string) => {
    try {
      orchestrator.cancel(buildId);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:revealOutput", async (_e, projectId: string) => {
    try {
      await orchestrator.revealOutput(projectId);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:runApp", async (_e, projectId: string) => {
    try {
      await orchestrator.runApp(projectId);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:installApp", async (_e, projectId: string) => {
    try {
      await orchestrator.installApp(projectId);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:export", async (_e, projectId: string, destDir?: string) => {
    try {
      let target = destDir;
      if (!target) {
        const win = getWindow();
        const result = await dialog.showOpenDialog(win!, {
          title: "Choose where to save the build",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || !result.filePaths[0]) return ok({ cancelled: true });
        target = result.filePaths[0];
      }
      const files = await orchestrator.exportTo(projectId, target);
      return ok({ cancelled: false, destDir: target, files });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("builds:getLogs", async (_e, projectId: string) => {
    try {
      const logs = await orchestrator.getLogs(projectId);
      return ok(logs);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("settings:get", async () => {
    try {
      return ok(settingsStore.get());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("settings:update", async (_e, patch: Partial<GlobalSettings>) => {
    try {
      const next = await settingsStore.update(patch);
      return ok(next);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("ai:hasApiKey", async () => {
    try { return ok(aiService.hasApiKey()); }
    catch (e) { return fail(e); }
  });

  ipcMain.handle("ai:generateProject", async (_e, prompt: string) => {
    try { return ok(await aiService.generateProject(prompt)); }
    catch (e) { return fail(e); }
  });

  ipcMain.handle("ai:chat", async (_e, messages, context) => {
    try { return ok(await aiService.chat(messages, context)); }
    catch (e) { return fail(e); }
  });

  ipcMain.handle("dialog:pickIcon", async () => {
    try {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: "Select App Icon",
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "ico", "icns", "svg", "gif"] }],
      });
      if (result.canceled || !result.filePaths[0]) return ok(null);
      const filePath = result.filePaths[0];
      const buf = await fs.readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "ico" ? "image/x-icon" : `image/${ext}`;
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      return ok({ path: filePath, dataUrl });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Try to grab a high-resolution icon for `urlStr` from the site itself
   * (apple-touch-icon, favicon) and fall back to Google's favicon service.
   * Saves the result under <userData>/fetched-icons and returns it shaped
   * like the file picker so the IconUploader flow doesn't care where the
   * icon came from.
   */
  ipcMain.handle("dialog:fetchFavicon", async (_e, urlStr: string) => {
    try {
      if (!urlStr || typeof urlStr !== "string") throw new Error("URL is required");
      const u = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
      const host = u.host;

      // Order matters: high-res Apple-touch icons first (often 180–512px),
      // then Google's service (up to 256), then the bare favicon (16–32).
      const sources: { url: string; ext: string; mime: string }[] = [
        { url: `${u.protocol}//${host}/apple-touch-icon-precomposed.png`, ext: "png", mime: "image/png" },
        { url: `${u.protocol}//${host}/apple-touch-icon.png`, ext: "png", mime: "image/png" },
        { url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`, ext: "png", mime: "image/png" },
        { url: `${u.protocol}//${host}/favicon.ico`, ext: "ico", mime: "image/x-icon" },
      ];

      let buffer: Buffer | null = null;
      let chosenExt = "png";
      let chosenMime = "image/png";

      for (const src of sources) {
        try {
          const res = await fetch(src.url, { redirect: "follow" });
          if (!res.ok) continue;
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (!ct.startsWith("image/")) continue;
          const arr = await res.arrayBuffer();
          // Reject suspiciously tiny payloads — usually a 1×1 placeholder.
          if (arr.byteLength < 200) continue;
          buffer = Buffer.from(arr);
          if (ct.includes("png")) { chosenExt = "png"; chosenMime = "image/png"; }
          else if (ct.includes("ico") || ct.includes("icon")) { chosenExt = "ico"; chosenMime = "image/x-icon"; }
          else if (ct.includes("svg")) { chosenExt = "svg"; chosenMime = "image/svg+xml"; }
          else { chosenExt = src.ext; chosenMime = src.mime; }
          break;
        } catch { /* try next */ }
      }

      if (!buffer) return ok(null);

      const dir = path.join(app.getPath("userData"), "fetched-icons");
      await fs.ensureDir(dir);
      const safeHost = host.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const filePath = path.join(dir, `${safeHost}-${Date.now()}.${chosenExt}`);
      await fs.writeFile(filePath, buffer);

      const dataUrl = `data:${chosenMime};base64,${buffer.toString("base64")}`;
      return ok({ path: filePath, dataUrl });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Persist a base64 PNG (rendered in the renderer from the icon library)
   * to <userData>/library-icons and return the same shape pickIcon uses.
   */
  ipcMain.handle("dialog:saveIconDataUrl", async (_e, dataUrl: string, hint: string) => {
    try {
      if (!dataUrl || typeof dataUrl !== "string") throw new Error("dataUrl is required");
      const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!m) throw new Error("Expected a base64 PNG data URL");
      const buf = Buffer.from(m[1], "base64");

      const dir = path.join(app.getPath("userData"), "library-icons");
      await fs.ensureDir(dir);
      const safeHint = (hint || "icon").replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 32);
      const filePath = path.join(dir, `${safeHint}-${Date.now()}.png`);
      await fs.writeFile(filePath, buf);

      return ok({ path: filePath, dataUrl });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Export the project's workspace source folder to a directory the user
   * picks. Copies everything under `~/.w2a/<id>/` EXCEPT node_modules and
   * dist (regenerable via `npm install`). The output is a self-contained
   * Electron project: the user can `cd <folder> && npm install && npm start`
   * to run it locally, or commit it to git for further development.
   *
   * For wrapper projects this gives them the materialized main.js / chrome.html
   * etc; for starter projects it gives them the full starter codebase with
   * their name + icon already applied.
   */
  ipcMain.handle("projects:exportSource", async (_e, projectId: string) => {
    try {
      const project = projectStore.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      const workspace = projectStore.workspaceDir(projectId);
      if (!(await fs.pathExists(workspace))) {
        throw new Error(
          "This project hasn't been built yet — its source folder doesn't exist. " +
          "Click Build once to materialize the project, then export.",
        );
      }

      const win = getWindow();
      const safeName = project.name.replace(/[^a-z0-9-_ ]/gi, "_").trim() || "project";
      const dialogResult = await dialog.showOpenDialog(win!, {
        title: "Choose a folder to export project source",
        properties: ["openDirectory", "createDirectory"],
        defaultPath: app.getPath("documents"),
      });
      if (dialogResult.canceled || !dialogResult.filePaths[0]) return ok({ cancelled: true });

      const destRoot = dialogResult.filePaths[0];
      const destDir = path.join(destRoot, safeName);
      if (await fs.pathExists(destDir)) {
        const stat = await fs.stat(destDir);
        if (stat.isDirectory()) {
          const files = await fs.readdir(destDir);
          if (files.length > 0) {
            throw new Error(`Destination already exists and isn't empty: ${destDir}`);
          }
        }
      }

      // Copy everything except regenerable dirs. The filter receives the
      // SOURCE path on each candidate; returning false skips it.
      await fs.copy(workspace, destDir, {
        overwrite: false,
        errorOnExist: false,
        filter: (src) => {
          const rel = path.relative(workspace, src);
          if (!rel) return true;
          const top = rel.split(path.sep)[0];
          if (top === "node_modules") return false;
          if (top === "dist") return false;
          return true;
        },
      });

      // Drop in a README so the user knows exactly how to run + build the
      // exported project. Only writes if there isn't one already (don't
      // clobber a starter's authored README).
      const readmePath = path.join(destDir, "README.md");
      if (!(await fs.pathExists(readmePath))) {
        const safeName = (project.name || "App").replace(/`/g, "'");
        await fs.writeFile(readmePath, [
          `# ${safeName}`,
          ``,
          project.description ? `${project.description}\n` : ``,
          `Generated by **WebToDesktop Builder**. This is a self-contained Electron project — no external services, all dependencies declared in \`package.json\`.`,
          ``,
          `## Run in development`,
          ``,
          `\`\`\`bash`,
          `npm install`,
          `npm start`,
          `\`\`\``,
          ``,
          `## Build installers`,
          ``,
          `electron-builder is already configured. Pick the target you want:`,
          ``,
          `\`\`\`bash`,
          `# Windows installer (.exe via NSIS)`,
          `npx electron-builder --win`,
          ``,
          `# macOS .dmg`,
          `npx electron-builder --mac`,
          ``,
          `# Linux AppImage`,
          `npx electron-builder --linux`,
          `\`\`\``,
          ``,
          `Output lands in \`dist/\`.`,
          ``,
          `## Project layout`,
          ``,
          `- \`main.js\` — Electron main process. Window setup + IPC.`,
          `- \`preload.js\` — secure bridge from renderer to main (\`window.api\`).`,
          `- \`index.html\` — the UI rendered inside the window.`,
          `- \`config.json\` — runtime settings the main process reads at boot.`,
          `- \`package.json\` — deps + electron-builder config.`,
          ``,
          `Edit any of these freely. \`npm start\` picks up changes on relaunch.`,
          ``,
        ].join("\n"), "utf-8");
      }

      return ok({ cancelled: false, destDir });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Read a project's icon file and return it as a data URL the renderer
   * can drop into an `<img src="...">`. Returns null when the project
   * has no icon set, or when the icon path is missing on disk (e.g. the
   * user moved their fetched-icons folder). The renderer falls back to
   * a placeholder in those cases.
   */
  ipcMain.handle("projects:getIconDataUrl", async (_e, id: string) => {
    try {
      const project = projectStore.get(id);
      if (!project?.iconPath) return ok(null);
      if (!(await fs.pathExists(project.iconPath))) return ok(null);
      const buf = await fs.readFile(project.iconPath);
      const ext = path.extname(project.iconPath).slice(1).toLowerCase();
      const mime = ext === "svg"  ? "image/svg+xml"
                 : ext === "ico"  ? "image/x-icon"
                 : ext === "icns" ? "image/icns"
                 : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
                 : `image/${ext || "png"}`;
      return ok(`data:${mime};base64,${buf.toString("base64")}`);
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Duplicate a project. Creates a new project with a fresh id + a "(Copy)"
   * suffix on the name, copies the icon to the new project's data dir so
   * it isn't shared (avoids surprises if the user changes one), and resets
   * build history. Useful for forking a working config to try variations.
   */
  ipcMain.handle("projects:clone", async (_e, sourceId: string) => {
    try {
      const source = projectStore.get(sourceId);
      if (!source) throw new Error(`Project ${sourceId} not found`);

      // Strip per-instance fields. We re-pass everything else through create
      // so the project store assigns a fresh id + timestamps.
      const { id: _id, createdAt: _c, updatedAt: _u, lastBuild: _l, builds: _b, iconPath: _i, ...portable } = source;
      void _id; void _c; void _u; void _l; void _b; void _i;

      const cloned = await projectStore.create({
        ...portable,
        name: `${source.name} (Copy)`,
      });

      // Copy the icon to the clone's data dir so future edits to either
      // project's icon don't bleed across.
      let iconPath: string | undefined;
      if (source.iconPath && (await fs.pathExists(source.iconPath))) {
        const ext = path.extname(source.iconPath) || ".png";
        iconPath = path.join(projectStore.projectDir(cloned.id), `icon${ext}`);
        await fs.copy(source.iconPath, iconPath, { overwrite: true });
      }
      const final = iconPath
        ? await projectStore.update(cloned.id, { iconPath })
        : cloned;
      return ok({ project: final });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Export a project as a `.w2d` JSON file. Embeds the icon (base64) inline
   * so the file is fully self-contained — no external icon dependency. The
   * volatile fields (id, timestamps, build history) are stripped so importing
   * gives you a fresh project.
   */
  ipcMain.handle("projects:export", async (_e, projectId: string) => {
    try {
      const project = projectStore.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      const win = getWindow();
      const safeName = project.name.replace(/[^a-z0-9-_ ]/gi, "_").trim() || "project";
      const result = await dialog.showSaveDialog(win!, {
        title: "Export Project",
        defaultPath: `${safeName}.w2d`,
        filters: [{ name: "WebToDesktop Builder project", extensions: ["w2d"] }],
      });
      if (result.canceled || !result.filePath) return ok({ cancelled: true });

      // Read the icon (if any) into base64 so the .w2d file is portable.
      let icon: { filename: string; data: string } | null = null;
      if (project.iconPath && (await fs.pathExists(project.iconPath))) {
        const buf = await fs.readFile(project.iconPath);
        icon = { filename: path.basename(project.iconPath), data: buf.toString("base64") };
      }

      // Strip per-machine fields so importing on another machine creates a
      // fresh project rather than reusing this one's id/timestamps.
      const { id: _id, createdAt: _c, updatedAt: _u, lastBuild: _l, builds: _b, iconPath: _i, ...portable } = project;
      void _id; void _c; void _u; void _l; void _b; void _i;

      const payload = {
        format: "w2d",
        version: 1,
        exportedAt: new Date().toISOString(),
        project: portable,
        icon,
      };
      await fs.writeJson(result.filePath, payload, { spaces: 2 });
      return ok({ cancelled: false, filePath: result.filePath });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Import a `.w2d` project file. Creates a NEW project (fresh id +
   * timestamps), decodes the embedded icon to a stable location under the
   * project's directory, and returns the created project so the renderer
   * can navigate to it.
   */
  ipcMain.handle("projects:import", async (_e, providedPath?: string) => {
    try {
      let srcPath = providedPath;
      if (!srcPath) {
        const win = getWindow();
        const result = await dialog.showOpenDialog(win!, {
          title: "Import Project",
          properties: ["openFile"],
          filters: [{ name: "WebToDesktop Builder project", extensions: ["w2d", "json"] }],
        });
        if (result.canceled || !result.filePaths[0]) return ok({ cancelled: true });
        srcPath = result.filePaths[0];
      }

      const raw = await fs.readJson(srcPath);
      if (!raw || typeof raw !== "object") throw new Error("Invalid .w2d file: not an object");
      if (raw.format !== "w2d") throw new Error("Invalid .w2d file: wrong format tag");
      if (!raw.project || typeof raw.project !== "object") {
        throw new Error("Invalid .w2d file: missing project block");
      }

      // Decode the embedded icon (if any) into the project's data dir AFTER
      // we know the project's id — but ProjectStore.create assigns the id,
      // so we create first, then write the icon, then patch iconPath.
      const created = await projectStore.create(raw.project as Omit<AppProject, "id" | "createdAt" | "updatedAt">);

      let iconPath: string | undefined;
      if (raw.icon?.data && raw.icon?.filename) {
        const safeFilename = String(raw.icon.filename).replace(/[^a-z0-9._-]/gi, "_");
        iconPath = path.join(projectStore.projectDir(created.id), safeFilename);
        await fs.writeFile(iconPath, Buffer.from(String(raw.icon.data), "base64"));
      }
      const final = iconPath
        ? await projectStore.update(created.id, { iconPath })
        : created;

      return ok({ cancelled: false, project: final });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Open a file dialog for picking a `.pfx` certificate. The chosen path is
   * stored in GlobalSettings.signing.pfxPath and read at build time by the
   * orchestrator (via WIN_CSC_LINK).
   */
  ipcMain.handle("dialog:pickPfx", async () => {
    try {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: "Select code-signing certificate",
        properties: ["openFile"],
        filters: [{ name: "Certificates", extensions: ["pfx", "p12"] }],
      });
      if (result.canceled || !result.filePaths[0]) return ok(null);
      return ok({ path: result.filePaths[0] });
    } catch (e) {
      return fail(e);
    }
  });

  /**
   * Publish a project's most recent build artifacts to a GitHub Release.
   *
   * Flow:
   *   1. Read project (must have githubRepo) and settings (must have githubToken).
   *   2. Enumerate uploadable artifacts in <workspace>/dist
   *      (.exe / .msi / .dmg / .AppImage / .deb / .rpm / .zip / .snap / latest*.yml).
   *   3. Create a draft release at the project's tag (v<version> from package.json).
   *   4. Upload each artifact to the release's upload URL.
   *
   * Returns { url, htmlUrl } on success so the renderer can offer "Open release".
   * Errors are surfaced verbatim — token issues / missing repos give a 401/404
   * the user can read.
   */
  ipcMain.handle("publish:github", async (_e, projectId: string) => {
    try {
      const project = projectStore.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      const repoRaw = project.githubRepo?.trim();
      if (!repoRaw) throw new Error("Set a GitHub repo on the project (App Studio → Distribution).");
      // Accept "owner/repo", "https://github.com/owner/repo", "git@github.com:owner/repo.git", etc.
      const repo = normalizeGithubRepoBackend(repoRaw);
      if (!repo) throw new Error(`Couldn't parse "${repoRaw}" as a GitHub repo. Use owner/repo or a github.com URL.`);
      const token = settingsStore.get().githubToken?.trim();
      if (!token) throw new Error("Set a GitHub token in Settings → AI/Distribution.");

      const distDir = path.join(projectStore.workspaceDir(projectId), "dist");
      if (!(await fs.pathExists(distDir))) {
        throw new Error("No build output. Build the app before publishing.");
      }
      const entries = await fs.readdir(distDir, { withFileTypes: true });
      const uploadable = entries
        .filter((e) => e.isFile())
        .filter((e) => /\.(exe|msi|dmg|AppImage|deb|rpm|zip|snap)$/i.test(e.name) || /^latest.*\.ya?ml$/i.test(e.name));
      if (uploadable.length === 0) {
        throw new Error("No uploadable artifacts found in dist/.");
      }

      // Use the workspace package.json's version as the tag — that's what
      // electron-builder embedded in the artifacts, so it stays consistent.
      const wsPkgPath = path.join(projectStore.workspaceDir(projectId), "package.json");
      const wsPkg = (await fs.readJson(wsPkgPath)) as { version?: string };
      const version = wsPkg.version || "1.0.0";
      const tag = `v${version}`;

      const headers = {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "WebToDesktopBuilder",
      };

      // ---- Preflight: confirm the repo exists and the token can write to it.
      // Without this we land on 403/404 from later calls and have to reverse-
      // engineer the cause. GET /repos returns push/admin permission flags
      // that let us give the user a specific, actionable message.
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (repoRes.status === 401) {
        throw new Error(
          "GitHub rejected the token (401). It's invalid, expired, or revoked. " +
          "Generate a new one in Settings → GitHub publishing."
        );
      }
      if (repoRes.status === 404) {
        // Could be: repo really doesn't exist, OR it's private and the token
        // can't see it. From the API's POV those look identical.
        throw new Error(
          `GitHub can't find ${repo} (404). Either:\n` +
          `  • the repo doesn't exist yet — create it at github.com/new, or\n` +
          `  • it's private and your token doesn't have access to it.`
        );
      }
      if (repoRes.status === 403) {
        throw new Error(
          `GitHub blocked access to ${repo} (403). Check your token scopes:\n` +
          `  • Classic PAT: needs the full \`repo\` scope (not just public_repo).\n` +
          `  • Fine-grained PAT: needs \`Contents: write\` for this repo.\n` +
          `  • If your org enforces SSO, authorize the token at the org settings.`
        );
      }
      if (!repoRes.ok) {
        const t = await repoRes.text().catch(() => "");
        throw new Error(`GitHub responded ${repoRes.status} on GET /repos/${repo}: ${t.slice(0, 240)}`);
      }
      const repoMeta = (await repoRes.json()) as { permissions?: { push?: boolean; admin?: boolean } };
      const canWrite = !!(repoMeta.permissions && (repoMeta.permissions.push || repoMeta.permissions.admin));
      if (!canWrite) {
        throw new Error(
          `Your token can read ${repo} but not write to it. ` +
          `You need push (collaborator) access AND a token with the right scope:\n` +
          `  • Classic PAT: \`repo\` scope.\n` +
          `  • Fine-grained PAT: \`Contents: write\`.`
        );
      }

      // Inspect what kind of token we have. Classic PATs return their scopes
      // in this header; fine-grained PATs do NOT — their permissions are
      // per-repo and not exposed via response headers. We use this to give a
      // precise message when the *create-release* call later 403s, which
      // happens when permissions.push:true but the TOKEN lacks Contents:write
      // (a known fine-grained-PAT pitfall).
      const tokenScopes = (repoRes.headers.get("x-oauth-scopes") || "").trim();
      const isClassicPAT = tokenScopes.length > 0;
      const hasRepoScope = tokenScopes.split(",").map((s) => s.trim()).includes("repo");
      if (isClassicPAT && !hasRepoScope) {
        throw new Error(
          `Your classic personal access token has scopes "${tokenScopes}" — it's missing \`repo\`. ` +
          `Generate a new token with \`repo\` checked at github.com/settings/tokens, ` +
          `then update Settings → GitHub publishing.`
        );
      }

      // Try to find an existing release with this tag (re-publishing same
      // version → reuse). Otherwise create a fresh draft.
      let release: { id: number; url: string; html_url: string; upload_url: string; assets?: Array<{ id: number; name: string }> };
      const existingRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { headers });
      if (existingRes.ok) {
        release = await existingRes.json();
      } else if (existingRes.status === 404) {
        const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            tag_name: tag,
            name: `${project.name} ${version}`,
            body: project.description ? `${project.description}\n\nGenerated by WebToDesktop Builder.` : "Generated by WebToDesktop Builder.",
            draft: true,
            prerelease: false,
          }),
        });
        if (!createRes.ok) {
          const body = await createRes.text().catch(() => "");
          // Most common 403 path: token can READ the repo (preflight passed)
          // but its scope/permissions don't include release-write. Translate
          // into a specific tip based on the token type we detected above.
          if (createRes.status === 403) {
            const tip = isClassicPAT
              ? `Your classic PAT scopes are "${tokenScopes}". You need the full \`repo\` scope ` +
                `(public_repo alone isn't enough for releases). Re-issue the token at ` +
                `github.com/settings/tokens with \`repo\` checked.`
              : `Looks like a fine-grained PAT. It needs \`Contents: Read and write\` for ${repo}. ` +
                `Open github.com/settings/personal-access-tokens, edit your token, set Repository ` +
                `access to "${repo.split("/")[0]}/${repo.split("/")[1]}" (or All), and under ` +
                `Repository permissions add Contents → Read and write. ` +
                `If your repo is in an SSO-enforced org, also authorize the token there.`;
            throw new Error(`GitHub refused to create the release (403). ${tip}\n\nRaw: ${body.slice(0, 200)}`);
          }
          throw new Error(`Couldn't create release (${createRes.status}): ${body.slice(0, 240)}`);
        }
        release = await createRes.json();
      } else {
        const t = await existingRes.text().catch(() => "");
        throw new Error(`GitHub responded ${existingRes.status}: ${t.slice(0, 240)}`);
      }

      // Strip the `{?name,label}` suffix from the upload URL — that's a URI
      // template that fetch doesn't expand.
      const baseUploadUrl = release.upload_url.replace(/\{\?[^}]+\}$/, "");
      const existingAssets = new Map((release.assets ?? []).map((a) => [a.name, a.id] as const));
      const uploaded: string[] = [];

      for (const entry of uploadable) {
        const filePath = path.join(distDir, entry.name);
        const buf = await fs.readFile(filePath);

        // Replace prior assets with the same name — GitHub rejects duplicates.
        const existingId = existingAssets.get(entry.name);
        if (existingId !== undefined) {
          await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existingId}`, { method: "DELETE", headers });
        }

        const uploadRes = await fetch(`${baseUploadUrl}?name=${encodeURIComponent(entry.name)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": guessContentType(entry.name), "Content-Length": String(buf.byteLength) },
          body: buf,
        });
        if (!uploadRes.ok) {
          const t = await uploadRes.text().catch(() => "");
          throw new Error(`Upload of ${entry.name} failed (${uploadRes.status}): ${t.slice(0, 240)}`);
        }
        uploaded.push(entry.name);
      }

      return ok({ url: release.url, htmlUrl: release.html_url, tag, uploaded });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("dialog:pickOutputDir", async () => {
    try {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: "Select Output Directory",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return ok(null);
      return ok(result.filePaths[0]);
    } catch (e) {
      return fail(e);
    }
  });

  // Allow the renderer to deep-link the user straight to the Windows
  // "Developer Mode" toggle when a build hits the symlink-permission error.
  // Restricted to a known-safe URI list so this can't be abused as a generic
  // openExternal proxy.
  ipcMain.handle("system:openSettings", async (_e, key: string) => {
    try {
      const URIS: Record<string, string> = {
        developers: "ms-settings:developers",
      };
      const uri = URIS[key];
      if (!uri) throw new Error(`Unknown settings key: ${key}`);
      await shell.openExternal(uri);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  // Renderer-driven probe used by the Developer Mode permission dialog,
  // both for the pre-build check and the "I've enabled it, retry" button.
  // Always returns ok(...) — caller checks .canCreateSymlinks.
  ipcMain.handle("system:checkSymlinkPrivilege", async () => {
    try {
      return ok(probeSymlinkPrivilege());
    } catch (e) {
      return fail(e);
    }
  });

  // Deep-link to OS-level network settings. Windows uses ms-settings:network,
  // macOS uses the Network pane prefpane URL, Linux falls back to opening
  // gnome-control-center via xdg-open (best-effort — distros vary wildly).
  // Used by the OfflineOverlay's "Open network settings" button.
  ipcMain.handle("system:openNetworkSettings", async () => {
    try {
      let uri = "ms-settings:network";
      if (process.platform === "darwin") {
        uri = "x-apple.systempreferences:com.apple.preference.network";
      } else if (process.platform === "linux") {
        uri = "gnome-control-center";
      }
      await shell.openExternal(uri);
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  // ── Auth ─────────────────────────────────────────────────────────────

  /** One-time migration: stamp every pre-existing ownerless project with
   *  the first user who signs in after the per-user-projects feature
   *  shipped. Gated by `legacyProjectsClaimedBy` in settings so a second
   *  account on the same machine never inherits the first user's data. */
  async function maybeClaimLegacyProjects(sub: string): Promise<void> {
    const settings = settingsStore.get();
    if (settings.legacyProjectsClaimedBy) return;
    try {
      await projectStore.claimLegacyProjects(sub);
    } finally {
      // Always set the flag — even on partial success — so we don't
      // retry on every sign-in. If something failed, projects without
      // ownerSub remain visible to all users, which is no worse than
      // the previous (un-scoped) behavior.
      await settingsStore.update({ legacyProjectsClaimedBy: sub });
    }
  }

  ipcMain.handle("auth:status", async () => {
    try {
      const user = authService.currentUser();
      // If a user is already signed in from a prior session and the
      // legacy migration hasn't run yet, run it now (covers app restarts
      // where the user never re-clicks Sign In).
      if (user) await maybeClaimLegacyProjects(user.sub);
      return ok({
        configured: authService.hasOAuthConfig(),
        user,
      });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("auth:signIn", async () => {
    try {
      const user = await authService.signIn();
      await maybeClaimLegacyProjects(user.sub);
      // After Google's browser tab finishes, pull our window back to front.
      const w = getWindow();
      if (w) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
      }
      return ok(user);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("auth:signOut", async () => {
    try {
      await authService.signOut();
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  // ── First-run welcome ────────────────────────────────────────────────
  ipcMain.handle("firstRun:status", async () => {
    try {
      return ok({
        showWelcome: firstRunService.shouldShowWelcome(),
        installedAt: firstRunService.installedAt(),
      });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("firstRun:acknowledge", async () => {
    try {
      await firstRunService.acknowledgeWelcome();
      return ok(undefined);
    } catch (e) {
      return fail(e);
    }
  });

  // ─────────── BILLING (Stripe) ───────────────────────────────────────
  // All Stripe API access lives in stripeService — the renderer never
  // imports Stripe or sees the secret key. These handlers expose the
  // narrow surface the BillingPage needs.

  // Soft cooldown on the customer-existence check. status() and
  // recordBuild() both trigger it before returning their normal payload,
  // but we don't want to hit Stripe on every IPC roundtrip — once every
  // 30s is plenty to catch a deletion within a reasonable window without
  // burning API quota.
  const VERIFY_COOLDOWN_MS = 30_000;
  let lastCustomerVerifyAt = 0;

  /**
   * Self-healing reconciler. Called from billing:status and
   * billing:recordBuild. If the local entitlement references a Stripe
   * customer that no longer exists, every paid-plan field is wiped and
   * a fresh free-tier summary is broadcast so all open BillingPage /
   * gate listeners flip immediately.
   *
   * `trialStartedAt` is preserved so a deleted-customer reset can't be
   * used to replay the once-per-account 14-day trial.
   */
  async function reconcileWithPaddle(): Promise<void> {
    if (!paddleService.configured) return;
    const sub = settingsStore.get().subscription;
    if (!sub) return;
    if (sub.tier === "free" || sub.tier === "trial") return;
    if (!sub.paddleCustomerId) return;
    const now = Date.now();
    if (now - lastCustomerVerifyAt < VERIFY_COOLDOWN_MS) return;
    lastCustomerVerifyAt = now;

    let exists = true;
    try {
      // Always verify against the mode the customer was created in.
      // Without this guard, a flag flip from sandbox → production would
      // make the customer look "missing" (sandbox customers aren't in
      // the production database) and wipe a real entitlement.
      const mode = sub.paddleMode ?? paddleService.currentMode;
      exists = await paddleService.verifyCustomerExists(sub.paddleCustomerId, mode);
    } catch {
      // verifyCustomerExists already swallows network errors → returns
      // true. Anything that lands here is unexpected — bail without
      // touching local state.
      return;
    }
    if (exists) return;

    // Customer is gone. Wipe every paid-plan field by setting it to
    // undefined; the settings store's spread will drop them, and
    // JSON.stringify omits undefined on disk.
    const cleared = await settingsStore.update({
      subscription: {
        tier: "free" as const,
        trialStartedAt: sub.trialStartedAt,
        paddleCustomerId: undefined,
        paddleTransactionId: undefined,
        paddleSubscriptionId: undefined,
        paddleMode: undefined,
        expiresAt: undefined,
        purchasedAt: undefined,
        buildsToday: undefined,
        buildsLifetime: undefined,
      },
    });
    getWindow()?.webContents.send("billing:state", summarize(cleared.subscription));
  }

  // Renderer-side flag pusher. The renderer evaluates the PostHog flag
  // `feature-billing-production` (sandbox by default) and calls this on
  // mount + every flag-refresh tick. Cached on the service so all
  // subsequent operations route to the right Paddle environment without
  // each call having to thread `mode` through the IPC arglist.
  ipcMain.handle("billing:setMode", async (_e, mode: "sandbox" | "production") => {
    try {
      if (mode !== "sandbox" && mode !== "production") {
        throw new Error(`Invalid Paddle mode: ${mode}`);
      }
      paddleService.setMode(mode);
      return ok({ mode });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("billing:listPlans", async () => {
    try {
      return ok(paddleService.listPlans());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("billing:status", async () => {
    try {
      // Auto-verify before responding so a customer deleted from the
      // dashboard is reflected on the very next status read (instead of
      // requiring a manual Refresh click).
      await reconcileWithPaddle();
      const settings = settingsStore.get();
      const summary = summarize(settings.subscription);
      return ok({
        ...summary,
        configured: paddleService.configured,
      });
    } catch (e) {
      return fail(e);
    }
  });

  // Build a Paddle Transaction and pop its hosted checkout URL open in
  // the user's default browser. We return the URL too in case the
  // renderer wants to show a "Reopen checkout" fallback link.
  ipcMain.handle("billing:openCheckout", async (_e, planKey: string) => {
    try {
      // Snapshot the active mode at the start of the request so a flag
      // flip mid-checkout doesn't split work between two Paddle SDKs.
      const mode = paddleService.currentMode;
      if (!paddleService.configuredFor(mode)) {
        throw new Error(
          `Paddle ${mode} mode is not configured. Add PADDLE_API_KEY_${mode.toUpperCase()} and the matching PADDLE_PRICE_*_${mode.toUpperCase()} ids to .env, then restart.`,
        );
      }
      const user = authService.currentUser();
      if (!user) throw new Error("Sign in with Google before purchasing a plan.");

      const plan = planByKey(planKey);
      if (!plan) throw new Error(`Unknown plan: ${planKey}`);

      const settings = settingsStore.get();
      const current = settings.subscription;
      if (current && isDowngrade(current.tier, plan.tier)) {
        throw new Error(
          `Your current plan (${current.tier}) is higher than ${plan.tier}. Downgrades aren't supported.`
        );
      }

      // Reuse the stored customer id only when it was created in the
      // SAME mode we're transacting in now — Paddle customer ids aren't
      // portable across sandbox / production. A different-mode id falls
      // through to the email lookup / create path inside ensureCustomer.
      const reusableCustomerId =
        current?.paddleCustomerId && current?.paddleMode === mode
          ? current.paddleCustomerId
          : undefined;

      const customerId = await paddleService.ensureCustomer({
        googleSub: user.sub,
        email: user.email,
        name: user.name,
        existingCustomerId: reusableCustomerId,
        mode,
      });

      // Persist customer id + mode eagerly so a later refresh / deep
      // link can find it even if the user closes the Checkout tab
      // without paying.
      await settingsStore.update({
        subscription: {
          ...(current ?? { tier: "free" as const }),
          paddleCustomerId: customerId,
          paddleMode: mode,
        } satisfies SubscriptionState,
      });

      const session = await paddleService.createCheckoutSession({
        planKey: plan.key,
        customerId,
        googleSub: user.sub,
        successDeepLink: "web2desktop://billing-success",
        cancelDeepLink: "web2desktop://billing-cancel",
        mode,
      });

      await shell.openExternal(session.url);
      return ok({ url: session.url, sessionId: session.sessionId, mode: session.mode });
    } catch (e) {
      return fail(e);
    }
  });

  // Invoked by the deep-link handler in main.ts when Paddle redirects
  // the user back with `?_ptxn=...`. Verifies + persists.
  ipcMain.handle("billing:applySession", async (_e, sessionId: string) => {
    try {
      if (!paddleService.configured) throw new Error("Paddle is not configured.");
      const user = authService.currentUser();
      if (!user) throw new Error("Sign in before completing payment.");

      const settings = settingsStore.get();
      // The mode the checkout was created in is persisted on the
      // subscription record by the openCheckout handler. Use it so
      // verify hits the right Paddle environment even if the PostHog
      // flag flipped while the user was paying in their browser.
      const mode = settings.subscription?.paddleMode ?? paddleService.currentMode;
      const next = await paddleService.verifyAndApplySession({
        sessionId,
        googleSub: user.sub,
        previous: settings.subscription,
        mode,
      });
      const updated = await settingsStore.update({ subscription: next });

      // Broadcast so any open BillingPage instances refresh without
      // requiring the user to click "Refresh".
      getWindow()?.webContents.send("billing:state", summarize(updated.subscription));

      return ok(summarize(updated.subscription) as SubscriptionSummary);
    } catch (e) {
      return fail(e);
    }
  });

  // (Free trial and Starter plan handlers removed — the trial now flows
  // through Paddle Checkout against a price with a 14-day trial period
  // so the customer record shows up in the Paddle dashboard and
  // auto-renews when the trial ends. See billing:openCheckout for the
  // entry point.)

  // Atomic "may I build?" gate. Called by `api.builds.start` immediately
  // before invoking `builds:start`. Returns a verdict and the updated
  // usage numbers. Reserves the slot eagerly so two parallel build
  // attempts can't both pass when only one slot is left.
  ipcMain.handle("billing:recordBuild", async () => {
    try {
      // Reconcile first — if the customer was deleted in Paddle out of
      // band, this wipes the entitlement so the gate below treats them
      // as free (and the build is blocked).
      await reconcileWithPaddle();
      const settings = settingsStore.get();
      const sub = settings.subscription;
      const summary = summarize(sub);

      // No active paid plan → only the free-tier demo allowance can keep
      // a build going. Free users get FREE_TIER_BUILD_ALLOWANCE lifetime
      // builds (currently 1) so they can produce one real .exe and see
      // the product work end-to-end before subscribing. Once that's used
      // up, fall through to "no-subscription" so the renderer routes them
      // to /billing the same way it does for any other unsubscribed user.
      if (!summary.active) {
        const freeAllowance = summary.tier === "free" ? (summary.totalBuildLimit ?? 0) : 0;
        const freeRemaining = summary.tier === "free" ? (summary.buildsRemainingTotal ?? 0) : 0;
        if (summary.tier !== "free" || freeAllowance <= 0 || freeRemaining <= 0) {
          return ok({
            allowed: false,
            reason: "no-subscription" as const,
            used: summary.buildsUsedToday,
            limit: summary.dailyBuildLimit,
            remaining: summary.buildsRemainingToday,
          });
        }
      }

      // Trial enforces both a daily cap (typically the same as the total)
      // AND a hard lifetime cap. Check lifetime first so a "trial used up"
      // toast is more informative than "0/3 today" on the second build.
      const lifetimeLimit = summary.totalBuildLimit;
      const lifetimeUsed = summary.buildsUsedTotal;
      if (lifetimeLimit !== null && lifetimeUsed >= lifetimeLimit) {
        return ok({
          allowed: false,
          reason: "trial-exhausted" as const,
          used: lifetimeUsed,
          limit: lifetimeLimit,
          remaining: 0,
        });
      }

      // Unlimited daily tier (lifetime plan) — no daily-counter math.
      if (summary.dailyBuildLimit === null) {
        const nextLifetime = lifetimeUsed + 1;
        const updatedLife = await settingsStore.update({
          subscription: {
            ...(sub ?? { tier: "free" as const }),
            buildsLifetime: nextLifetime,
          },
        });
        getWindow()?.webContents.send("billing:state", summarize(updatedLife.subscription));
        return ok({
          allowed: true,
          reason: "ok" as const,
          used: summary.buildsUsedToday,
          limit: null as number | null,
          remaining: null as number | null,
        });
      }

      const today = todayKey();
      const currentCount =
        sub?.buildsToday && sub.buildsToday.date === today ? sub.buildsToday.count : 0;

      if (currentCount >= summary.dailyBuildLimit) {
        return ok({
          allowed: false,
          reason: "daily-limit-exceeded" as const,
          used: currentCount,
          limit: summary.dailyBuildLimit,
          remaining: 0,
        });
      }

      const nextCount = currentCount + 1;
      const nextLifetime = lifetimeUsed + 1;
      const updated = await settingsStore.update({
        subscription: {
          ...(sub ?? { tier: "free" as const }),
          buildsToday: { date: today, count: nextCount },
          buildsLifetime: nextLifetime,
        },
      });

      // Broadcast so the BillingPage usage banner ticks up without a poll.
      getWindow()?.webContents.send("billing:state", summarize(updated.subscription));

      return ok({
        allowed: true,
        reason: "ok" as const,
        used: nextCount,
        limit: summary.dailyBuildLimit,
        remaining: Math.max(0, summary.dailyBuildLimit - nextCount),
      });
    } catch (e) {
      return fail(e);
    }
  });

  // "Refresh" button on the BillingPage — re-pulls from Paddle and
  // reconciles. Useful when the user paid on a different device. Also
  // detects when the linked Paddle customer no longer exists (someone
  // archived it from the dashboard) and clears the stale local plan so
  // the UI matches reality.
  ipcMain.handle("billing:refresh", async () => {
    try {
      if (!paddleService.configured) throw new Error("Paddle is not configured.");
      const settings = settingsStore.get();
      const customerId = settings.subscription?.paddleCustomerId;
      if (!customerId) {
        // Nothing to reconcile — just return current state.
        return ok(summarize(settings.subscription));
      }
      try {
        const next = await paddleService.refreshFromPaddle({
          customerId,
          previous: settings.subscription,
          // refreshFromPaddle defaults this to previous.paddleMode →
          // currentMode, which is exactly what we want — keep refresh
          // pinned to the mode the entitlement was created in.
        });
        if (!next) return ok(summarize(settings.subscription));
        const updated = await settingsStore.update({ subscription: next });
        getWindow()?.webContents.send("billing:state", summarize(updated.subscription));
        return ok(summarize(updated.subscription));
      } catch (e) {
        // Paddle returns code "entity_not_found" / 404 when the
        // customer record was archived out from under us. Wipe the
        // local entitlement, keep `trialStartedAt` so the trial can't
        // be replayed, and tell the renderer to reflect the change.
        const err = e as { code?: string; message?: string; status?: number };
        const missing =
          err?.code === "entity_not_found" ||
          err?.status === 404 ||
          /not found|no such/i.test(err?.message ?? "");
        if (!missing) throw e;

        const cleared = await settingsStore.update({
          subscription: {
            tier: "free" as const,
            // Preserve trial history so a deleted-customer reset doesn't
            // let the same user replay their 14-day trial.
            trialStartedAt: settings.subscription?.trialStartedAt,
          },
        });
        const summary = summarize(cleared.subscription);
        getWindow()?.webContents.send("billing:state", summary);
        return ok(summary);
      }
    } catch (e) {
      return fail(e);
    }
  });
}

/**
 * Reconcile the persisted subscription against Paddle on every cold
 * launch. Catches three drift cases the renderer would otherwise show
 * stale state for:
 *
 *   1. User paid / canceled / let a sub lapse on another device — ask
 *      Paddle for the current state and overwrite locally.
 *   2. Paddle customer record got archived from the dashboard — Paddle
 *      returns 404, and we drop back to "free" (preserving
 *      `trialStartedAt` so the trial can't be replayed).
 *   3. Legacy entitlement from before the Stripe→Paddle migration — the
 *      persisted record has a paid `tier` but no `paddleCustomerId`
 *      (Stripe-test sessions left this state behind on dev machines).
 *      Wipe it so the BillingPage cards unlock correctly.
 *
 * Best-effort: any thrown error is swallowed so a flaky network on
 * startup never blocks the app from booting.
 */
export async function reconcileSubscriptionOnStartup(deps: {
  settingsStore: SettingsStore;
  paddleService: PaddleService;
  getWindow: () => BrowserWindow | null;
}): Promise<void> {
  const { settingsStore, paddleService, getWindow } = deps;
  try {
    const sub = settingsStore.get().subscription;
    if (!sub) return;

    const hasPaddleLinkage = !!(
      sub.paddleCustomerId || sub.paddleTransactionId || sub.paddleSubscriptionId
    );

    // Case 3: legacy / corrupted state — anything WITHOUT Paddle linkage
    // is leftover from the pre-Paddle Stripe codebase (or hand-edited).
    // Wipe wholesale to a fresh free state, including `trialStartedAt`
    // and any unknown extra fields (`stripeCustomerId`, `purchasedAt`,
    // build counters from the old tier, etc.). Use replaceSubscription
    // because update() shallow-merges and would preserve those fields.
    // Skip if the subscription is already clean to avoid disk churn.
    if (!hasPaddleLinkage) {
      const isAlreadyClean =
        sub.tier === "free" &&
        !sub.trialStartedAt &&
        !sub.purchasedAt &&
        !sub.expiresAt &&
        !sub.buildsToday &&
        sub.buildsLifetime === undefined &&
        Object.keys(sub).length <= 1; // only `tier`
      if (isAlreadyClean) return;
      const cleared = await settingsStore.replaceSubscription({ tier: "free" as const });
      getWindow()?.webContents.send("billing:state", summarize(cleared.subscription));
      return;
    }

    // Has Paddle linkage. If the local tier is already free, the cached
    // state is consistent — nothing to refresh.
    if (sub.tier === "free") return;

    // Cases 1 & 2: real Paddle entitlement — reconcile with the server.
    if (!paddleService.configured || !sub.paddleCustomerId) return;
    try {
      const next = await paddleService.refreshFromPaddle({
        customerId: sub.paddleCustomerId,
        previous: sub,
      });
      if (!next) return;
      const updated = await settingsStore.update({ subscription: next });
      getWindow()?.webContents.send("billing:state", summarize(updated.subscription));
    } catch (e) {
      const err = e as { code?: string; message?: string; status?: number };
      const missing =
        err?.code === "entity_not_found" ||
        err?.status === 404 ||
        /not found|no such/i.test(err?.message ?? "");
      if (!missing) return;
      const cleared = await settingsStore.update({
        subscription: { tier: "free" as const, trialStartedAt: sub.trialStartedAt },
      });
      getWindow()?.webContents.send("billing:state", summarize(cleared.subscription));
    }
  } catch {
    /* swallow — startup must never fail because of billing reconcile */
  }
}

/**
 * Coerce any common GitHub repo input into "owner/repo". Mirror of
 * src/lib/utils.ts#normalizeGithubRepo — kept here too because the IPC
 * handlers can't import from src/.
 */
function normalizeGithubRepoBackend(raw: string): string | null {
  const s = raw.trim().replace(/\.git$/i, "").replace(/\/+$/g, "");
  if (!s) return null;
  const ssh = s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+)$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/|$)/i);
  if (url) return `${url[1]}/${url[2]}`;
  const bare = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (bare) return `${bare[1]}/${bare[2]}`;
  return null;
}

/**
 * Best-effort MIME type for GitHub release asset uploads. GitHub accepts
 * application/octet-stream as a fallback, so the worst case is correct
 * but slightly less informative.
 */
function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "exe":     return "application/x-msdownload";
    case "msi":     return "application/x-msi";
    case "dmg":     return "application/x-apple-diskimage";
    case "appimage":return "application/x-executable";
    case "deb":     return "application/vnd.debian.binary-package";
    case "rpm":     return "application/x-rpm";
    case "zip":     return "application/zip";
    case "snap":    return "application/vnd.snap";
    case "yml":
    case "yaml":    return "text/yaml";
    default:        return "application/octet-stream";
  }
}

function validateProjectInput(input: Omit<AppProject, "id" | "createdAt" | "updatedAt">): void {
  if (!input.name || input.name.trim().length === 0) throw new Error("App name is required");
  // URL only matters for "wrapper" projects (the URL gets loaded in the
  // wrapped page). Starter / scene-compiled projects load their own
  // local index.html and ignore the URL field — accept any placeholder.
  if (input.kind !== "starter") {
    validateUrl(input.url);
  }
  if (!input.window || input.window.width <= 0 || input.window.height <= 0) {
    throw new Error("Window width and height must be positive");
  }
}

function validateUrl(url: string): void {
  if (!url || !url.trim()) throw new Error("URL is required");
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("URL must use http or https");
  } catch {
    throw new Error("Invalid URL");
  }
}
