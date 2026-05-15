import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { BrowserWindow, shell } from "electron";
import { nanoid } from "nanoid";
import type {
  AppProject,
  BuildLogEvent,
  BuildProgressEvent,
  BuildRecord,
  BuildStatus,
  Platform,
} from "../types";
import { ProjectStore } from "./projectStore";
import { SettingsStore } from "./settingsStore";
import { TemplateGenerator } from "./templateGenerator";
import { NodeRuntime, NodeRuntimeError, ResolvedRuntime } from "./nodeRuntime";
import { trackMain } from "./analytics";
import type { EmailService } from "./emailService";
import type { AuthService } from "./authService";
import { summarize } from "./paddleService";

interface ActiveBuild {
  buildId: string;
  projectId: string;
  child?: ChildProcess;
  cancelled: boolean;
  logs: BuildLogEvent[];
  /** True once we've already surfaced the symlink-permission help text. */
  symlinkHelpEmitted?: boolean;
  /** True if any spawned process hit "Cannot create symbolic link". */
  hadSymlinkError?: boolean;
  /** epoch ms — wall-clock start, used to report build duration to analytics. */
  startedAtMs: number;
}

/**
 * electron-builder unpacks `winCodeSign` (its signing/verification cache)
 * with `7za x -snl`, which tries to recreate macOS .dylib symlinks. On
 * Windows the user needs SeCreateSymbolicLinkPrivilege — granted only by
 * admin or Developer Mode. We rewrite that error into a one-time, clear
 * remediation instead of leaking the raw 7zip retry spam.
 */
const SYMLINK_ERROR_MARKER = /Cannot create symbolic link.*A required privilege is not held by the client/i;

const STEPS = [
  { label: "Initializing build environment", weight: 5 },
  { label: "Materializing project template", weight: 10 },
  { label: "Resolving packages", weight: 35 },
  { label: "Generating executables", weight: 40 },
  { label: "Packaging output", weight: 10 },
];

export class BuildOrchestrator {
  private active: Map<string, ActiveBuild> = new Map();
  private template = new TemplateGenerator();
  private runtime = new NodeRuntime();

  constructor(
    private store: ProjectStore,
    private settings: SettingsStore,
    private email?: EmailService,
    private auth?: AuthService,
  ) {}

  isBuilding(projectId: string): boolean {
    for (const b of this.active.values()) if (b.projectId === projectId) return true;
    return false;
  }

  async getLogs(projectId: string): Promise<BuildLogEvent[]> {
    const live = Array.from(this.active.values()).find((b) => b.projectId === projectId);
    if (live) return live.logs;
    const logsPath = this.store.logsPath(projectId);
    if (await fs.pathExists(logsPath)) {
      try {
        return (await fs.readJson(logsPath)) as BuildLogEvent[];
      } catch {
        return [];
      }
    }
    return [];
  }

  async start(project: AppProject): Promise<string> {
    if (this.isBuilding(project.id)) {
      throw new Error("A build is already running for this project");
    }
    const buildId = nanoid(8);
    const ctx: ActiveBuild = {
      buildId,
      projectId: project.id,
      cancelled: false,
      logs: [],
      startedAtMs: Date.now(),
    };
    this.active.set(buildId, ctx);
    trackMain("desktop", "build_started", {
      project_id: project.id,
      build_id: buildId,
      platforms: project.platforms ?? [],
    });

    // Wipe the on-disk log from the previous run so the UI doesn't replay
    // stale errors when it hydrates.
    const logsPath = this.store.logsPath(project.id);
    if (await fs.pathExists(logsPath)) {
      await fs.remove(logsPath);
    }

    const record: BuildRecord = {
      id: buildId,
      projectId: project.id,
      status: "building",
      startedAt: new Date().toISOString(),
    };
    await this.store.setLastBuild(project.id, record);

    void this.run(project, ctx, record).catch(async (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      // If the failure was actually the Windows symlink-permission issue,
      // replace the cryptic "npx.cmd exited with code 1" with the targeted
      // remediation we already streamed into the log.
      const userMessage = ctx.hadSymlinkError
        ? "Windows blocked symbolic link creation while electron-builder set up its tooling cache. See instructions above to enable Developer Mode or run as Administrator, then click Rebuild."
        : raw;
      this.emitLog(ctx, "error", userMessage);
      await this.finish(ctx, record, "error", userMessage);
    });

    return buildId;
  }

  cancel(buildId: string): void {
    const ctx = this.active.get(buildId);
    if (!ctx) return;
    ctx.cancelled = true;
    if (ctx.child && !ctx.child.killed) {
      try {
        if (process.platform === "win32" && ctx.child.pid) {
          spawn("taskkill", ["/pid", String(ctx.child.pid), "/f", "/t"]);
        } else {
          ctx.child.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
    }
  }

  async revealOutput(projectId: string): Promise<void> {
    const candidates = [
      path.join(this.store.workspaceDir(projectId), "dist"),
      this.store.outputDir(projectId),
    ];
    for (const dir of candidates) {
      if (await fs.pathExists(dir)) {
        await shell.openPath(dir);
        return;
      }
    }
  }

  async exportTo(projectId: string, destDir: string): Promise<string[]> {
    const distDir = path.join(this.store.workspaceDir(projectId), "dist");
    if (!(await fs.pathExists(distDir))) {
      throw new Error("No build output found. Build the app first.");
    }
    await fs.ensureDir(destDir);
    const entries = await fs.readdir(distDir, { withFileTypes: true });
    const exportable = entries.filter(
      (e) => e.isFile() && /\.(exe|msi|dmg|AppImage|deb|rpm|zip|snap)$/i.test(e.name),
    );
    if (exportable.length === 0) {
      throw new Error("No installer or executable files were produced by the build.");
    }
    const copied: string[] = [];
    for (const e of exportable) {
      const dest = path.join(destDir, e.name);
      await fs.copy(path.join(distDir, e.name), dest, { overwrite: true });
      copied.push(e.name);
    }
    return copied;
  }

  private async run(project: AppProject, ctx: ActiveBuild, record: BuildRecord): Promise<void> {
    const workspace = this.store.workspaceDir(project.id);
    const distDir = path.join(workspace, "dist");

    this.emitProgress(ctx, "building", 0, STEPS[0].label, 0);
    this.emitLog(ctx, "info", "Initializing build environment...");
    this.emitLog(ctx, "info", `Workspace: ${workspace}`);

    // Resolve a Node.js runtime up-front. If the user has nothing installed
    // and we don't ship a portable copy, fail with a clear, actionable
    // message instead of leaking a `'npm.cmd' is not recognized` error
    // halfway through the build.
    let runtime: ResolvedRuntime;
    try {
      runtime = this.runtime.resolve();
    } catch (err) {
      if (err instanceof NodeRuntimeError) {
        this.emitLog(ctx, "error", err.message);
        return this.finish(ctx, record, "error", err.message);
      }
      throw err;
    }
    this.emitLog(
      ctx,
      "info",
      `Using Node.js runtime (${runtime.source}): ${runtime.node}`,
    );

    if (ctx.cancelled) return this.finish(ctx, record, "cancelled");

    this.emitProgress(ctx, "building", 1, STEPS[1].label, 5);
    this.emitLog(ctx, "info", "Materializing project template...");
    // Per-project theme wins; otherwise fall back to the global default.
    const theme = project.theme ?? this.settings.get().defaultTheme ?? null;
    if (theme) {
      const source = project.theme ? "project override" : "global default";
      this.emitLog(ctx, "info", `Applying theme: ${theme.name} (${theme.id}) — ${source}`);
    }
    const matResult = await this.template.materialize(project, workspace, theme);
    matResult.warnings.forEach((w) => this.emitLog(ctx, "warn", w));
    this.emitLog(ctx, "success", "Template materialized.");

    if (ctx.cancelled) return this.finish(ctx, record, "cancelled");

    this.emitProgress(ctx, "building", 2, STEPS[2].label, 15);
    this.emitLog(ctx, "info", "Installing dependencies (npm install)...");
    await this.runProcess(
      ctx,
      runtime.npm,
      ["install", "--no-audit", "--no-fund"],
      workspace,
      15,
      50,
      {},
      runtime,
    );
    if (ctx.cancelled) return this.finish(ctx, record, "cancelled");
    this.emitLog(ctx, "success", "Dependencies installed successfully.");

    this.emitProgress(ctx, "building", 3, STEPS[3].label, 50);
    this.emitLog(ctx, "info", "Generating executables with electron-builder...");
    const { targets, skipped } = this.platformTargets(project.platforms);
    if (skipped.length) {
      const reasons: string[] = [];
      if (skipped.includes("mac")) {
        reasons.push("macOS builds require running this builder on a Mac (Apple toolchain).");
      }
      if (skipped.includes("linux")) {
        reasons.push("Linux AppImage builds require a Linux host (mksquashfs is Linux-native).");
      }
      this.emitLog(
        ctx,
        "warn",
        `Skipping ${skipped.join(", ")} target${skipped.length === 1 ? "" : "s"} — cannot be built from ${process.platform}. ${reasons.join(" ")}`,
      );
    }
    if (targets.length === 0) {
      throw new Error(
        `No buildable platforms selected for this host. The project requested [${(project.platforms ?? []).join(", ")}], ` +
        `but none of those can be packaged on ${process.platform}. ` +
        `Edit the project's platform list in App Studio → Distribution.`,
      );
    }

    // Inject signing env vars if configured. electron-builder picks these up
    // automatically — no need to touch the per-app package.json. Empty pfx
    // path → skip entirely, build proceeds unsigned (same as before).
    const signing = this.settings.get().signing;
    const signingEnv: Record<string, string> = {};
    if (signing?.pfxPath && signing.pfxPath.trim()) {
      signingEnv.WIN_CSC_LINK = signing.pfxPath;
      if (signing.password) signingEnv.WIN_CSC_KEY_PASSWORD = signing.password;
      this.emitLog(ctx, "info", `Code signing enabled (${signing.pfxPath}).`);
    }

    await this.runProcess(
      ctx,
      runtime.npx,
      ["electron-builder", ...targets, "--publish=never"],
      workspace,
      50,
      90,
      signingEnv,
      runtime,
    );
    if (ctx.cancelled) return this.finish(ctx, record, "cancelled");

    this.emitProgress(ctx, "building", 4, STEPS[4].label, 92);
    this.emitLog(ctx, "info", "Packaging output...");
    if (!(await fs.pathExists(distDir))) {
      throw new Error(`electron-builder did not produce a dist directory at ${distDir}`);
    }
    this.emitLog(ctx, "success", `Output ready: ${distDir}`);

    record.outputPath = distDir;
    await this.finish(ctx, record, "success");
  }

  /**
   * Compose + send the "your build finished" email. Caller has already
   * checked that `this.email` is ready and `this.auth` is wired, so this
   * method can read straight from them. Skips silently when the user
   * isn't signed in (race: signed out mid-build) or holds no active paid
   * subscription. Emits a warn-level build log on send failure so the
   * developer can spot SMTP misconfiguration from inside the app.
   */
  private async sendBuildSuccessEmail(ctx: ActiveBuild, record: BuildRecord): Promise<void> {
    const user = this.auth!.currentUser();
    if (!user?.email) return;

    const summary = summarize(this.settings.get().subscription);
    if (!summary.active) return;

    // `getInternal` bypasses the per-user filter — necessary here because
    // the orchestrator runs out-of-band from user state and we still
    // want the email to fire even if the user signed out mid-build.
    const project = this.store.getInternal(ctx.projectId);
    const appName = project?.name ?? "Your app";

    const result = await this.email!.sendBuildSuccess({
      to: user.email,
      toName: user.name,
      appName,
      outputPath: record.outputPath,
      finishedAt: record.finishedAt ?? new Date().toISOString(),
    });

    if (!result.ok) {
      this.emitLog(ctx, "warn", `Build-complete email failed: ${result.error ?? "unknown"}`);
    } else {
      this.emitLog(ctx, "info", `Build-complete email sent to ${user.email}`);
    }
  }

  private async finish(
    ctx: ActiveBuild,
    record: BuildRecord,
    status: BuildStatus,
    error?: string,
  ): Promise<void> {
    record.status = status;
    record.finishedAt = new Date().toISOString();
    if (error) record.error = error;

    await this.store.setLastBuild(ctx.projectId, record);
    await fs.writeJson(this.store.logsPath(ctx.projectId), ctx.logs, { spaces: 2 });

    // Fire-and-forget build-complete email. Gated on (1) successful build,
    // (2) an active paid subscription — free-tier demo builds skip the
    // mailer to avoid spam from churned users, (3) email service actually
    // configured. All checks short-circuit silently so a missing SMTP
    // config never breaks build cleanup.
    if (status === "success" && this.email?.isReady() && this.auth) {
      void this.sendBuildSuccessEmail(ctx, record).catch((err: unknown) => {
        this.emitLog(
          ctx,
          "warn",
          `Email notification skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    this.emitProgress(ctx, status, STEPS.length, status === "success" ? "Build complete" : "Build ended", 100);

    const eventName =
      status === "success" ? "build_succeeded"
      : status === "cancelled" ? "build_cancelled"
      : "build_failed";
    trackMain("desktop", eventName, {
      project_id: ctx.projectId,
      build_id: ctx.buildId,
      duration_seconds: (Date.now() - ctx.startedAtMs) / 1000,
      reason: error,
      had_symlink_error: ctx.hadSymlinkError ?? false,
    });

    this.active.delete(ctx.buildId);
  }

  private runProcess(
    ctx: ActiveBuild,
    command: string,
    args: string[],
    cwd: string,
    progressFrom: number,
    progressTo: number,
    extraEnv: Record<string, string> = {},
    runtime?: ResolvedRuntime,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseEnv = runtime
        ? this.runtime.envWithRuntime(runtime, process.env)
        : process.env;

      // On Windows, shell:true routes the call through cmd.exe, which splits
      // the command on spaces. If `command` is an absolute path containing a
      // space (e.g. "C:\Users\GHANSHYAM RAO\...\npm.cmd"), cmd.exe sees
      // 'C:\Users\GHANSHYAM' and fails. Use the bare basename so cmd.exe
      // resolves it via PATH — `envWithRuntime` has already prepended the
      // runtime dir so the bundled binary still wins.
      const isWin = process.platform === "win32";
      const finalCommand =
        isWin && runtime && path.isAbsolute(command)
          ? path.basename(command)
          : command;

      const child = spawn(finalCommand, args, {
        cwd,
        shell: isWin,
        env: { ...baseEnv, FORCE_COLOR: "0", ...extraEnv },
      });
      ctx.child = child;

      const ticker = this.startProgressTicker(ctx, progressFrom, progressTo);

      const consume = (chunk: Buffer, level: "info" | "warn") => {
        const text = chunk.toString("utf8");
        if (SYMLINK_ERROR_MARKER.test(text)) this.flagSymlinkError(ctx);
        text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .forEach((line) => this.emitLog(ctx, level, line));
      };
      child.stdout?.on("data", (chunk: Buffer) => consume(chunk, "info"));
      child.stderr?.on("data", (chunk: Buffer) => consume(chunk, "warn"));

      child.on("error", (err) => {
        clearInterval(ticker);
        reject(err);
      });

      child.on("close", (code) => {
        clearInterval(ticker);
        ctx.child = undefined;
        if (ctx.cancelled) return resolve();
        if (code === 0) return resolve();
        reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }

  private startProgressTicker(ctx: ActiveBuild, from: number, to: number): NodeJS.Timeout {
    let pct = from;
    return setInterval(() => {
      pct = Math.min(to - 1, pct + 0.5);
      this.emitProgress(ctx, "building", -1, "", pct);
    }, 1000);
  }

  /**
   * Translate the project's requested platforms into electron-builder CLI
   * flags, filtering out anything the current host OS can't build. macOS
   * targets require running on macOS (signing toolchain, hdiutil); Windows
   * and Linux targets can be cross-compiled from each other.
   *
   * Returns the flags to pass plus the list of platforms we dropped, so
   * the caller can warn the user in the build log.
   */
  private platformTargets(platforms: Platform[]): { targets: string[]; skipped: Platform[] } {
    const requested = platforms.length ? platforms : [this.defaultPlatformFlag()];
    const targets: string[] = [];
    const skipped: Platform[] = [];
    for (const p of requested) {
      if (this.canBuildOnHost(p)) targets.push(`--${p}`);
      else skipped.push(p);
    }
    return { targets, skipped };
  }

  /**
   * Can the current host OS package the given platform via electron-builder?
   *
   *   - `mac`   → darwin only. macOS signing/notarization toolchain is
   *               Apple-proprietary; can't be cross-compiled.
   *   - `linux` → not from Windows. AppImage requires `mksquashfs`, a
   *               Linux-native binary; electron-builder's Windows cache
   *               can't execute it (results in the "file does not exist"
   *               error users see deep in the build log).
   *   - `win`   → any host. Windows installers (NSIS) cross-compile fine.
   */
  private canBuildOnHost(platform: Platform): boolean {
    if (platform === "mac") return process.platform === "darwin";
    if (platform === "linux") return process.platform !== "win32";
    return true;
  }

  private defaultPlatformFlag(): Platform {
    if (process.platform === "darwin") return "mac";
    if (process.platform === "linux") return "linux";
    return "win";
  }

  private flagSymlinkError(ctx: ActiveBuild): void {
    ctx.hadSymlinkError = true;
    if (ctx.symlinkHelpEmitted) return;
    ctx.symlinkHelpEmitted = true;
    this.emitLog(ctx, "error", "─────────────────────────────────────────────");
    this.emitLog(
      ctx,
      "error",
      "Windows is blocking symbolic-link creation, which electron-builder needs to extract its winCodeSign tooling cache.",
    );
    this.emitLog(ctx, "error", "Fix this once — choose either:");
    this.emitLog(
      ctx,
      "error",
      "  1. Enable Developer Mode:  Settings → Privacy & security → For developers → Developer Mode → On  (no admin needed)",
    );
    this.emitLog(
      ctx,
      "error",
      "  2. OR right-click WebToDesktop Builder and choose “Run as administrator”.",
    );
    this.emitLog(ctx, "error", "Then click Rebuild.");
    this.emitLog(ctx, "error", "─────────────────────────────────────────────");
  }

  private emitLog(ctx: ActiveBuild, level: BuildLogEvent["level"], message: string): void {
    const event: BuildLogEvent = {
      buildId: ctx.buildId,
      projectId: ctx.projectId,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    ctx.logs.push(event);
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("build:log", event));
  }

  private emitProgress(
    ctx: ActiveBuild,
    status: BuildStatus,
    step: number,
    stepLabel: string,
    percent: number,
  ): void {
    const event: BuildProgressEvent = {
      buildId: ctx.buildId,
      projectId: ctx.projectId,
      status,
      step,
      totalSteps: STEPS.length,
      stepLabel: stepLabel || (step >= 0 && step < STEPS.length ? STEPS[step].label : ""),
      percent: Math.round(percent),
    };
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("build:progress", event));
  }
}

// Avoid unused import warnings on some platforms
void os;
