import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

export interface ResolvedRuntime {
  /** Absolute path to node executable (or just "node" if from PATH). */
  node: string;
  /** Absolute path to npm executable. On Windows this is npm.cmd. */
  npm: string;
  /** Absolute path to npx executable. On Windows this is npx.cmd. */
  npx: string;
  /** Where the runtime was found — useful for logs. */
  source: "bundled" | "path";
  /** Extra dirs to prepend to PATH when spawning so child processes find node. */
  extraPath: string[];
}

export class NodeRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeRuntimeError";
  }
}

const IS_WIN = process.platform === "win32";
const NPM_BIN = IS_WIN ? "npm.cmd" : "npm";
const NPX_BIN = IS_WIN ? "npx.cmd" : "npx";
const NODE_BIN = IS_WIN ? "node.exe" : "node";

export class NodeRuntime {
  private cached: ResolvedRuntime | null = null;

  /**
   * Resolve a usable Node runtime. Prefers the portable copy bundled with
   * the app (so end-users without Node.js installed can still build), then
   * falls back to whatever's on the system PATH.
   */
  resolve(): ResolvedRuntime {
    if (this.cached) return this.cached;

    const bundled = this.tryBundled();
    if (bundled) {
      this.cached = bundled;
      return bundled;
    }

    const onPath = this.tryPath();
    if (onPath) {
      this.cached = onPath;
      return onPath;
    }

    throw new NodeRuntimeError(
      "Node.js is required to build apps but was not found on this system.\n\n" +
      "Either:\n" +
      "  • Install Node.js 18 or later from https://nodejs.org/, then restart this app.\n" +
      "  • Or, ship Node.js with the installer by running `npm run setup:runtime` " +
      "before `npm run electron:build`.",
    );
  }

  private candidateBundleRoots(): string[] {
    const roots = [
      // Packaged: extraResources lands here.
      path.join(process.resourcesPath, "node-win"),
      // Development: vendor/ checked into the repo (gitignored).
      path.join(app.getAppPath(), "vendor", "node-win"),
    ];
    return roots.filter((r) => !!r);
  }

  private tryBundled(): ResolvedRuntime | null {
    if (!IS_WIN) return null;
    for (const root of this.candidateBundleRoots()) {
      const resolved = this.probeBundleRoot(root);
      if (resolved) return resolved;
    }
    return null;
  }

  /**
   * The Node.js Windows portable archive extracts to a single nested folder
   * named like "node-v20.18.1-win-x64". Either the user already flattened it
   * to the root, or we walk one level down to find the real bin dir.
   */
  private probeBundleRoot(root: string): ResolvedRuntime | null {
    if (!fs.existsSync(root)) return null;
    const candidates = [root, ...this.firstLevelChildren(root)];
    for (const dir of candidates) {
      const node = path.join(dir, NODE_BIN);
      const npm = path.join(dir, NPM_BIN);
      const npx = path.join(dir, NPX_BIN);
      if (fs.existsSync(node) && fs.existsSync(npm)) {
        return {
          node,
          npm,
          npx: fs.existsSync(npx) ? npx : npm.replace(/npm\.cmd$/i, "npx.cmd"),
          source: "bundled",
          extraPath: [dir],
        };
      }
    }
    return null;
  }

  private firstLevelChildren(dir: string): string[] {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  }

  private tryPath(): ResolvedRuntime | null {
    const npm = this.whichOnPath(NPM_BIN);
    const node = this.whichOnPath(NODE_BIN);
    const npx = this.whichOnPath(NPX_BIN);
    if (!node || !npm) return null;
    return {
      node,
      npm,
      npx: npx ?? npm,
      source: "path",
      extraPath: [],
    };
  }

  /** Locate an executable on PATH without depending on `which`/`where`. */
  private whichOnPath(bin: string): string | null {
    const PATH = process.env.PATH || process.env.Path || "";
    const PATHEXT = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";");
    const dirs = PATH.split(path.delimiter).filter(Boolean);
    const exts = bin.includes(".") ? [""] : ["", ...PATHEXT];
    for (const dir of dirs) {
      for (const ext of exts) {
        const full = path.join(dir, bin + ext);
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  /**
   * Quick smoke test that the resolved runtime actually runs. Used at app
   * startup so we can warn early instead of failing mid-build.
   */
  verify(): { ok: true; version: string } | { ok: false; error: string } {
    try {
      const r = this.resolve();
      const result = spawnSync(r.node, ["--version"], {
        encoding: "utf8",
        env: this.envWithRuntime(r, process.env),
      });
      if (result.status !== 0) {
        return { ok: false, error: `node --version exited with code ${result.status}` };
      }
      return { ok: true, version: result.stdout.trim() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  envWithRuntime(r: ResolvedRuntime, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    if (r.extraPath.length === 0) return base;
    const sep = path.delimiter;
    const merged = r.extraPath.join(sep) + sep + (base.PATH || base.Path || "");
    return { ...base, PATH: merged, Path: merged };
  }
}
