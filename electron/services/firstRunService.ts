import { app } from "electron";
import path from "node:path";
import fs from "fs-extra";

interface FirstRunState {
  installedAt: string;
  welcomeAcknowledgedAt: string | null;
}

/**
 * Tracks whether the user has seen the post-install welcome splash.
 * Backed by a tiny JSON file in userData; survives app updates because
 * userData persists across reinstalls of the same app id.
 */
export class FirstRunService {
  private statePath: string;
  private cached: FirstRunState | null = null;

  constructor() {
    this.statePath = path.join(app.getPath("userData"), "first-run.json");
  }

  async init(): Promise<void> {
    if (await fs.pathExists(this.statePath)) {
      try {
        this.cached = (await fs.readJson(this.statePath)) as FirstRunState;
        return;
      } catch {
        // fall through to fresh state
      }
    }
    this.cached = { installedAt: new Date().toISOString(), welcomeAcknowledgedAt: null };
    await fs.writeJson(this.statePath, this.cached, { spaces: 2 });
  }

  /** True when the welcome splash has not yet been dismissed. */
  shouldShowWelcome(): boolean {
    return !this.cached?.welcomeAcknowledgedAt;
  }

  installedAt(): string {
    return this.cached?.installedAt ?? new Date().toISOString();
  }

  async acknowledgeWelcome(): Promise<void> {
    if (!this.cached) return;
    this.cached.welcomeAcknowledgedAt = new Date().toISOString();
    await fs.writeJson(this.statePath, this.cached, { spaces: 2 });
  }
}
