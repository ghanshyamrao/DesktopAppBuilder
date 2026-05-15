import { app } from "electron";
import path from "node:path";
import fs from "fs-extra";
import type { GlobalSettings } from "../types";

const DEFAULTS: GlobalSettings = {
  defaultWindow: {
    width: 1280,
    height: 800,
    resizable: true,
    fullscreen: false,
    centerOnLaunch: true,
    rememberState: true,
  },
  defaultSecurity: {
    contextIsolation: true,
    nodeIntegration: false,
    disableContextMenu: false,
    enableDevToolsInProduction: false,
    customUserAgent: "",
  },
  defaultTheme: null,
  installedPlugins: [],
  aiApiKey: "",
  githubToken: "",
  signing: undefined,
  profile: undefined,
  appearance: { mode: "dark", customAccent: "#A78BFA" },
};

export class SettingsStore {
  private filePath: string;
  private settings: GlobalSettings = DEFAULTS;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "settings.json");
  }

  async init(): Promise<void> {
    if (await fs.pathExists(this.filePath)) {
      try {
        const data = (await fs.readJson(this.filePath)) as Partial<GlobalSettings>;
        this.settings = {
          defaultWindow: { ...DEFAULTS.defaultWindow, ...(data.defaultWindow ?? {}) },
          defaultSecurity: { ...DEFAULTS.defaultSecurity, ...(data.defaultSecurity ?? {}) },
          defaultTheme: data.defaultTheme ?? null,
          installedPlugins: data.installedPlugins ?? [],
          aiApiKey: data.aiApiKey ?? "",
          githubToken: data.githubToken ?? "",
          signing: data.signing,
          profile: data.profile,
          appearance: { ...DEFAULTS.appearance!, ...(data.appearance ?? {}) },
          subscription: data.subscription,
          legacyProjectsClaimedBy: data.legacyProjectsClaimedBy,
        };
      } catch {
        await fs.writeJson(this.filePath, DEFAULTS, { spaces: 2 });
      }
    } else {
      await fs.writeJson(this.filePath, DEFAULTS, { spaces: 2 });
    }
  }

  get(): GlobalSettings {
    return this.settings;
  }

  async update(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
    this.settings = {
      defaultWindow: { ...this.settings.defaultWindow, ...(patch.defaultWindow ?? {}) },
      defaultSecurity: { ...this.settings.defaultSecurity, ...(patch.defaultSecurity ?? {}) },
      defaultTheme: patch.defaultTheme === undefined ? this.settings.defaultTheme : patch.defaultTheme,
      installedPlugins: patch.installedPlugins ?? this.settings.installedPlugins,
      aiApiKey: patch.aiApiKey === undefined ? this.settings.aiApiKey : patch.aiApiKey,
      githubToken: patch.githubToken === undefined ? this.settings.githubToken : patch.githubToken,
      signing: patch.signing === undefined ? this.settings.signing : patch.signing,
      profile: patch.profile === undefined ? this.settings.profile : patch.profile,
      appearance:
        patch.appearance === undefined
          ? this.settings.appearance
          : { ...(this.settings.appearance ?? DEFAULTS.appearance!), ...patch.appearance },
      subscription:
        patch.subscription === undefined
          ? this.settings.subscription
          : { ...(this.settings.subscription ?? {} as NonNullable<GlobalSettings["subscription"]>), ...patch.subscription },
      legacyProjectsClaimedBy:
        patch.legacyProjectsClaimedBy === undefined
          ? this.settings.legacyProjectsClaimedBy
          : patch.legacyProjectsClaimedBy,
    };
    await fs.writeJson(this.filePath, this.settings, { spaces: 2 });
    return this.settings;
  }

  /**
   * Wholesale-replace the `subscription` block (or wipe it). The default
   * `update()` shallow-merges subscription, which preserves leftover
   * fields from previous codebases (e.g. legacy Stripe IDs that the
   * Paddle migration no longer writes). Use this when you need the
   * stored subscription to match exactly what you pass — especially for
   * reset-to-clean paths in the startup reconciler.
   */
  async replaceSubscription(
    sub: GlobalSettings["subscription"] | undefined,
  ): Promise<GlobalSettings> {
    this.settings = { ...this.settings, subscription: sub };
    await fs.writeJson(this.filePath, this.settings, { spaces: 2 });
    return this.settings;
  }
}
