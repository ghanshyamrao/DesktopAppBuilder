import { app } from "electron";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { AppProject, BuildRecord } from "../types";

/** Cap the rolling build history so index.json doesn't grow forever. */
const MAX_BUILD_HISTORY = 20;

/**
 * Hydrate older project.json entries that pre-date the `builds[]` field.
 * If `builds` is missing but `lastBuild` is present, seed the history with
 * the single last build so the timeline UI has something to show.
 */
function migrateProject(p: AppProject): AppProject {
  if (p.builds && Array.isArray(p.builds)) return p;
  return { ...p, builds: p.lastBuild ? [p.lastBuild] : [] };
}

/** Returns the Google `sub` of the currently signed-in user, or `null`
 *  when the renderer isn't authenticated. ProjectStore consults this on
 *  every read/write to scope projects per user. */
export type CurrentSubResolver = () => string | null;

export class ProjectStore {
  private root: string;
  private indexPath: string;
  // Build workspaces live at a SHORT path to avoid Windows MAX_PATH=260
  // breaking deep electron node_modules paths during `npm install`.
  private workspaceRoot: string;
  private projects: Map<string, AppProject> = new Map();
  /** Injected by main at construction time. Null result = signed out;
   *  list() returns [] so the renderer can't see anyone's projects. */
  private getCurrentSub: CurrentSubResolver;

  constructor(getCurrentSub: CurrentSubResolver = () => null) {
    this.root = path.join(app.getPath("userData"), "projects");
    this.indexPath = path.join(this.root, "index.json");
    this.workspaceRoot = path.join(os.homedir(), ".w2a");
    this.getCurrentSub = getCurrentSub;
  }

  /** Late-bind the sub resolver. Called once from main after AuthService
   *  finishes init so the store always sees the latest signed-in user. */
  setCurrentSubResolver(resolver: CurrentSubResolver): void {
    this.getCurrentSub = resolver;
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.root);
    await fs.ensureDir(this.workspaceRoot);
    if (await fs.pathExists(this.indexPath)) {
      try {
        const list = (await fs.readJson(this.indexPath)) as AppProject[];
        list.forEach((p) => this.projects.set(p.id, migrateProject(p)));
      } catch {
        await fs.writeJson(this.indexPath, []);
      }
    } else {
      await fs.writeJson(this.indexPath, []);
    }
  }

  private async persist(): Promise<void> {
    await fs.writeJson(this.indexPath, Array.from(this.projects.values()), { spaces: 2 });
  }

  /** True when the given project should be visible to the current user.
   *  Owned projects match by sub; ownerless (legacy) projects are visible
   *  to anyone — they get claimed on the next sign-in via
   *  `claimLegacyProjects(sub)` so they don't stay shared forever. */
  private isVisibleToCurrentUser(p: AppProject): boolean {
    const sub = this.getCurrentSub();
    if (!sub) return false;
    return !p.ownerSub || p.ownerSub === sub;
  }

  list(): AppProject[] {
    return Array.from(this.projects.values())
      .filter((p) => this.isVisibleToCurrentUser(p))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  get(id: string): AppProject | undefined {
    const p = this.projects.get(id);
    if (!p) return undefined;
    // Hide projects owned by other users — returning undefined gives the
    // same "not found" surface as a deleted id, no info leak about who
    // owns what.
    if (!this.isVisibleToCurrentUser(p)) return undefined;
    return p;
  }

  /** Raw lookup that bypasses ownership checks. Reserved for internal
   *  flows (e.g. the build orchestrator writing back build status) where
   *  the operation was already authorized upstream. Renderer-facing IPC
   *  handlers must use `get()` instead. */
  getInternal(id: string): AppProject | undefined {
    return this.projects.get(id);
  }

  /** Stamp every ownerless project with `sub`. Called once after the
   *  first sign-in following this upgrade, gated by the
   *  `legacyProjectsClaimedBy` flag in GlobalSettings so a second user
   *  signing in later doesn't inherit the first user's data. */
  async claimLegacyProjects(sub: string): Promise<number> {
    let claimed = 0;
    for (const p of this.projects.values()) {
      if (!p.ownerSub) {
        p.ownerSub = sub;
        claimed += 1;
      }
    }
    if (claimed > 0) await this.persist();
    return claimed;
  }

  async create(input: Omit<AppProject, "id" | "createdAt" | "updatedAt">): Promise<AppProject> {
    const sub = this.getCurrentSub();
    if (!sub) throw new Error("Sign in to create a project.");
    const now = new Date().toISOString();
    const project: AppProject = {
      ...input,
      // Force the owner sub regardless of what the caller passed — the
      // renderer must not be able to fabricate someone else's identity.
      ownerSub: sub,
      id: nanoid(10),
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    await this.persist();
    await fs.ensureDir(this.projectDir(project.id));
    return project;
  }

  async update(id: string, patch: Partial<AppProject>): Promise<AppProject> {
    const existing = this.projects.get(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    if (!this.isVisibleToCurrentUser(existing)) {
      // Same "not found" surface as a missing id so we don't reveal that
      // another user owns this id.
      throw new Error(`Project ${id} not found`);
    }
    const updated: AppProject = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      // Owner is immutable — patches must not reassign projects.
      ownerSub: existing.ownerSub ?? this.getCurrentSub() ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, updated);
    await this.persist();
    return updated;
  }

  /**
   * Insert or update a build record in the project's rolling history. The
   * orchestrator calls this twice per build (once when it starts with
   * status="building", once with the final status) — we match by id and
   * replace in place rather than creating two entries.
   *
   * `lastBuild` is mirrored from `builds[0]` so older UI code that reads
   * just the last build keeps working.
   */
  async setLastBuild(id: string, build: BuildRecord): Promise<void> {
    const existing = this.projects.get(id);
    if (!existing) return;
    const history = existing.builds ?? (existing.lastBuild ? [existing.lastBuild] : []);
    const sameIdx = history.findIndex((b) => b.id === build.id);
    if (sameIdx >= 0) {
      history[sameIdx] = build;
      // Move the updated build to the front so newest-first ordering holds.
      const [updated] = history.splice(sameIdx, 1);
      history.unshift(updated);
    } else {
      history.unshift(build);
    }
    if (history.length > MAX_BUILD_HISTORY) history.length = MAX_BUILD_HISTORY;
    existing.builds = history;
    existing.lastBuild = history[0];
    existing.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    const existing = this.projects.get(id);
    if (existing && !this.isVisibleToCurrentUser(existing)) {
      throw new Error(`Project ${id} not found`);
    }
    this.projects.delete(id);
    await this.persist();
    const dir = this.projectDir(id);
    if (await fs.pathExists(dir)) await fs.remove(dir);
    const ws = this.workspaceDir(id);
    if (await fs.pathExists(ws)) await fs.remove(ws);
  }

  projectDir(id: string): string {
    return path.join(this.root, id);
  }

  workspaceDir(id: string): string {
    return path.join(this.workspaceRoot, id);
  }

  outputDir(id: string): string {
    return path.join(this.projectDir(id), "output");
  }

  logsPath(id: string): string {
    return path.join(this.projectDir(id), "build.log.json");
  }
}
