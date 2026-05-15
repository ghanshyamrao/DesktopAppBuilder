import posthog from "posthog-js";

/**
 * ───────────────────────────────────────────────────────────────────────
 *  FEATURE FLAGS — single source of truth for which features ship in
 *  the current release. Flip a flag to true to expose a feature to users.
 *
 *  This file is intentionally the ONLY place you edit when graduating a
 *  feature out of "hidden" status. Three consumers read from it:
 *    1. `LeftRail`  — filters which sidebar entries are visible.
 *    2. `App.tsx`   — routes for disabled features fall back to Dashboard
 *                     so users can't reach them by direct navigation.
 *    3. `Settings`  — filters which sub-sections (Appearance, AI, etc.)
 *                     appear in the settings rail.
 *
 *  Hiding a feature does NOT delete its code — it stays in the codebase
 *  ready to be re-enabled when its release is cut. To actually remove a
 *  feature, delete its files AND its flag here.
 *
 *  ── v1.0.0 release cut ──
 *  Visible:  Dashboard · App Studio · Theme Builder · Action Builder ·
 *            AI Assistant · Settings
 *  Hidden:   Builder · Recipes · Plugins · Deploy
 *
 *  ── v2.0.0 release cut (login) ──
 *  Settings → Appearance is hidden so the theme preference doesn't ship
 *  alongside the new auth flow. Re-enable when theme work resumes.
 * ───────────────────────────────────────────────────────────────────────
 */

export const FEATURES = {
  /* Always-on core surface */
  dashboard:     true,
  appStudio:     true,
  themeBuilder:  true,
  actionBuilder: true,
  aiAssistant:   true,
  settings:      true,
  /* Billing / subscription management. Required for the build gate to
     work, so leave on whenever Paddle is configured. */
  billing:       true,
  /* Switch the Paddle SDK to PRODUCTION mode. Default false → sandbox
     (test charges only). Flip to true via PostHog flag
     `feature-billing-production` once you've finished sandbox testing
     and are ready to take real money from real customers. */
  billingProduction: false,
  /* Demo build for unsubscribed (free-tier) users. Flag ON → every signed-in
     account gets ONE lifetime build so they can produce a real .exe and see
     the product work before paying. Flag OFF → no free build; the upgrade
     prompt fires immediately like it did pre-launch. The lifetime cap itself
     lives in paddleService.FREE_TIER_BUILD_ALLOWANCE. */
  freeBuildDemo: true,

  /* Hidden in v1.0.0 — code is fully built and shippable, just gated.
     Flip to true when the feature is ready for general release. */
  builder:       false, // Visual scene + drag-drop designer
  recipes:       false, // Reusable recipe library
  plugins:       false, // Plugin marketplace
  deploy:        false, // GitHub Releases publisher

  /* Connectivity UX — covers the offline modal + Wi-Fi toggle. Hide if
     the surrounding chrome already handles network-state messaging. */
  offlineOverlay: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;

/**
 * PostHog feature flag keys that correspond to each `FeatureKey`. When a
 * matching flag exists in the PostHog project and resolves to `true`, the
 * feature is enabled regardless of the static `FEATURES` table. This lets
 * us flip a hidden feature on for a beta cohort without cutting a release.
 *
 * Flags are read lazily from `posthog.isFeatureEnabled` so the static
 * defaults still apply when the SDK isn't initialized (CI, offline boot).
 */
const FEATURE_FLAG_KEYS: Record<FeatureKey, string> = {
  dashboard:      "feature-dashboard",
  appStudio:      "feature-app-studio",
  themeBuilder:   "feature-theme-builder",
  actionBuilder:  "feature-action-builder",
  aiAssistant:    "feature-ai-assistant",
  settings:       "feature-settings",
  billing:        "feature-billing",
  billingProduction: "feature-billing-production",
  freeBuildDemo:  "feature-free-build-demo",
  builder:        "feature-builder",
  recipes:        "feature-recipes",
  plugins:        "feature-plugins",
  deploy:         "feature-deploy",
  offlineOverlay: "feature-offline-overlay",
};

/**
 * Read PostHog's flag value. Returns `undefined` when the flag is missing,
 * unknown, or the SDK hasn't loaded yet — callers fall back to the static
 * `FEATURES` table in that case.
 */
function readRemoteFlag(key: FeatureKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(FEATURE_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the named feature should be visible/reachable. Reads the
 * PostHog flag first; falls back to the hardcoded `FEATURES` table when
 * the flag is undefined (no override configured in PostHog, or the SDK
 * hasn't loaded yet).
 */
export function isEnabled(key: FeatureKey): boolean {
  const remote = readRemoteFlag(key);
  const result = typeof remote === "boolean" ? remote : FEATURES[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] ${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${FEATURES[key]})`,
    );
  }
  return result;
}

/**
 * Snapshot of every feature's current state. Returned shape is friendly
 * for the dev-mode debug overlay and lets us avoid re-evaluating each
 * flag inline in JSX.
 */
export interface FlagSnapshot {
  /** Human-readable identifier — either a `FeatureKey` or a `SettingsSectionKey`. */
  key: string;
  flagKey: string;
  staticValue: boolean;
  remoteValue: boolean | undefined;
  effective: boolean;
}
export function snapshotAllFlags(): FlagSnapshot[] {
  return (Object.keys(FEATURES) as FeatureKey[]).map((key) => {
    const remote = readRemoteFlag(key);
    const staticValue = FEATURES[key];
    return {
      key,
      flagKey: FEATURE_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * Map from app routes to the feature flag that gates them. Routes not
 * listed here are always enabled (e.g. transient routes like "wizard"
 * and "build" — those aren't features, they're sub-flows of enabled
 * features).
 */
export const ROUTE_FEATURE: Partial<Record<
  "dashboard" | "studio" | "themes" | "actions" | "ai" | "settings"
  | "builder" | "recipes" | "plugins" | "deploy" | "billing",
  FeatureKey
>> = {
  dashboard: "dashboard",
  studio:    "appStudio",
  themes:    "themeBuilder",
  actions:   "actionBuilder",
  ai:        "aiAssistant",
  settings:  "settings",
  billing:   "billing",
  builder:   "builder",
  recipes:   "recipes",
  plugins:   "plugins",
  deploy:    "deploy",
};

/** True when navigating to this route name is allowed in the current build. */
export function isRouteEnabled(routeName: string): boolean {
  const flag = ROUTE_FEATURE[routeName as keyof typeof ROUTE_FEATURE];
  if (!flag) return true; // routes without a flag are always allowed
  return isEnabled(flag);
}

/**
 * Sub-feature flags — fine-grained gating for sections inside a feature
 * that itself stays visible. The `Settings` page reads this to decide
 * which entries appear in its left rail.
 *
 * Same rules as `FEATURES`: hiding does not delete code, just gates it.
 */
export const SETTINGS_SECTIONS = {
  profile:      true,
  subscription: true, // Plan / billing details — replaces the legacy "Plan" route.
  appearance:   true, // Hidden in v2.0.0 — theme preference deferred behind login work.
  window:       true,
  security:     true,
  ai:           true,
  github:       true,
  signing:      true,
} as const;

export type SettingsSectionKey = keyof typeof SETTINGS_SECTIONS;

/**
 * PostHog flag keys for each Settings sub-section. Mirrors the top-level
 * `FEATURE_FLAG_KEYS` pattern so operators can hide/show individual
 * Settings tabs (Profile, Appearance, AI, GitHub, etc.) without a release.
 */
const SETTINGS_SECTION_FLAG_KEYS: Record<SettingsSectionKey, string> = {
  profile:      "feature-settings-profile",
  subscription: "feature-settings-subscription",
  appearance:   "feature-settings-appearance",
  window:       "feature-settings-window",
  security:     "feature-settings-security",
  ai:           "feature-settings-ai",
  github:       "feature-settings-github",
  signing:      "feature-settings-signing",
};

function readRemoteSettingsFlag(key: SettingsSectionKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(SETTINGS_SECTION_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the named settings section should be visible/reachable. Reads
 * PostHog first; falls back to the static `SETTINGS_SECTIONS` table.
 */
export function isSettingsSectionEnabled(key: SettingsSectionKey): boolean {
  const remote = readRemoteSettingsFlag(key);
  const result = typeof remote === "boolean" ? remote : SETTINGS_SECTIONS[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] settings.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${SETTINGS_SECTIONS[key]})`,
    );
  }
  return result;
}

/** Snapshot every settings-section flag — used by the dev-mode overlay. */
export function snapshotAllSettingsSectionFlags(): FlagSnapshot[] {
  return (Object.keys(SETTINGS_SECTIONS) as SettingsSectionKey[]).map((key) => {
    const remote = readRemoteSettingsFlag(key);
    const staticValue = SETTINGS_SECTIONS[key];
    return {
      key,
      flagKey: SETTINGS_SECTION_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 *  APP STUDIO SECTIONS — flags for each tab in the AppStudio sub-rail.
 *  Same shape as `SETTINGS_SECTIONS`. Hide a tab to keep its code in the
 *  repo but stop it from rendering. Read by `AppStudio.tsx` to filter
 *  the sub-nav and to gate the matching section body.
 * ───────────────────────────────────────────────────────────────────────
 */
export const APP_STUDIO_SECTIONS = {
  identity:     true,
  icon:         true,
  window:       true,
  security:     true,
  code:         true,
  distribution: true,
  history:      true,
} as const;

export type AppStudioSectionKey = keyof typeof APP_STUDIO_SECTIONS;

const APP_STUDIO_SECTION_FLAG_KEYS: Record<AppStudioSectionKey, string> = {
  identity:     "feature-studio-identity",
  icon:         "feature-studio-icon",
  window:       "feature-studio-window",
  security:     "feature-studio-security",
  code:         "feature-studio-code",
  distribution: "feature-studio-distribution",
  history:      "feature-studio-history",
};

function readRemoteAppStudioFlag(key: AppStudioSectionKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(APP_STUDIO_SECTION_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isAppStudioSectionEnabled(key: AppStudioSectionKey): boolean {
  const remote = readRemoteAppStudioFlag(key);
  const result = typeof remote === "boolean" ? remote : APP_STUDIO_SECTIONS[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] studio.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${APP_STUDIO_SECTIONS[key]})`,
    );
  }
  return result;
}

export function snapshotAllAppStudioSectionFlags(): FlagSnapshot[] {
  return (Object.keys(APP_STUDIO_SECTIONS) as AppStudioSectionKey[]).map((key) => {
    const remote = readRemoteAppStudioFlag(key);
    const staticValue = APP_STUDIO_SECTIONS[key];
    return {
      key,
      flagKey: APP_STUDIO_SECTION_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 *  DASHBOARD SECTIONS — flags for each block on the Dashboard. Lets
 *  operators trim the dashboard down (e.g. hide the templates gallery
 *  for a stripped-down onboarding experience) without a code change.
 * ───────────────────────────────────────────────────────────────────────
 */
export const DASHBOARD_SECTIONS = {
  stats:          true, // Top stat-tile strip
  templates:      true, // "Start from a template" gallery
  recentProjects: true, // "Recent applications" list / empty-state
  bulkBuild:      true, // "Build all stale" header button
  importButton:   true, // "Import" header button
  newAppButton:   true, // "New App" header CTA
} as const;

export type DashboardSectionKey = keyof typeof DASHBOARD_SECTIONS;

const DASHBOARD_SECTION_FLAG_KEYS: Record<DashboardSectionKey, string> = {
  stats:          "feature-dashboard-stats",
  templates:      "feature-dashboard-templates",
  recentProjects: "feature-dashboard-recent",
  bulkBuild:      "feature-dashboard-bulk-build",
  importButton:   "feature-dashboard-import",
  newAppButton:   "feature-dashboard-new-app",
};

function readRemoteDashboardFlag(key: DashboardSectionKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(DASHBOARD_SECTION_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isDashboardSectionEnabled(key: DashboardSectionKey): boolean {
  const remote = readRemoteDashboardFlag(key);
  const result = typeof remote === "boolean" ? remote : DASHBOARD_SECTIONS[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] dashboard.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${DASHBOARD_SECTIONS[key]})`,
    );
  }
  return result;
}

export function snapshotAllDashboardSectionFlags(): FlagSnapshot[] {
  return (Object.keys(DASHBOARD_SECTIONS) as DashboardSectionKey[]).map((key) => {
    const remote = readRemoteDashboardFlag(key);
    const staticValue = DASHBOARD_SECTIONS[key];
    return {
      key,
      flagKey: DASHBOARD_SECTION_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 *  TOP-BAR FEATURES — individual controls inside `GlobalTopBar`. Hiding
 *  one of these only removes the affected widget; the bar itself remains
 *  mounted because it also hosts the window-drag region.
 * ───────────────────────────────────────────────────────────────────────
 */
export const TOP_BAR_FEATURES = {
  breadcrumbs:   true, // Left-side crumb trail
  search:        true, // Center "Search apps, themes…" pill (⌘K)
  aiQuickButton: true, // ✨ AI Assistant shortcut (⌘J)
  consoleToggle: true, // Terminal/console toggle (⌘`)
  notifications: true, // Bell icon + dropdown
  paletteButton: true, // Right-side Command Palette icon
  buildingBadge: true, // "N building" live badge
} as const;

export type TopBarFeatureKey = keyof typeof TOP_BAR_FEATURES;

const TOP_BAR_FEATURE_FLAG_KEYS: Record<TopBarFeatureKey, string> = {
  breadcrumbs:   "feature-topbar-breadcrumbs",
  search:        "feature-topbar-search",
  aiQuickButton: "feature-topbar-ai",
  consoleToggle: "feature-topbar-console",
  notifications: "feature-topbar-notifications",
  paletteButton: "feature-topbar-palette",
  buildingBadge: "feature-topbar-building-badge",
};

function readRemoteTopBarFlag(key: TopBarFeatureKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(TOP_BAR_FEATURE_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isTopBarFeatureEnabled(key: TopBarFeatureKey): boolean {
  const remote = readRemoteTopBarFlag(key);
  const result = typeof remote === "boolean" ? remote : TOP_BAR_FEATURES[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] topbar.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${TOP_BAR_FEATURES[key]})`,
    );
  }
  return result;
}

export function snapshotAllTopBarFeatureFlags(): FlagSnapshot[] {
  return (Object.keys(TOP_BAR_FEATURES) as TopBarFeatureKey[]).map((key) => {
    const remote = readRemoteTopBarFlag(key);
    const staticValue = TOP_BAR_FEATURES[key];
    return {
      key,
      flagKey: TOP_BAR_FEATURE_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 *  BUILD CONSOLE FEATURES — granular flags for both build log surfaces:
 *  the slide-up `BottomConsole` dock and the inline "Recent output" card
 *  on the BuildProgress page. Hide individual sub-controls (filter, clear,
 *  multi-build tabs) without taking down the whole console.
 * ───────────────────────────────────────────────────────────────────────
 */
export const BUILD_CONSOLE_FEATURES = {
  bottomConsole:  true, // The entire docked Build Console panel
  recentOutput:   true, // "Recent output" card on the BuildProgress page
  consoleFilter:  true, // Filter funnel button in the console header
  consoleClear:   true, // Trash button (clears logs for current project)
  consoleTabs:    true, // Multi-build tab strip (when ≥ 2 builds tracked)
} as const;

export type BuildConsoleFeatureKey = keyof typeof BUILD_CONSOLE_FEATURES;

const BUILD_CONSOLE_FEATURE_FLAG_KEYS: Record<BuildConsoleFeatureKey, string> = {
  bottomConsole:  "feature-console-bottom",
  recentOutput:   "feature-console-recent-output",
  consoleFilter:  "feature-console-filter",
  consoleClear:   "feature-console-clear",
  consoleTabs:    "feature-console-tabs",
};

function readRemoteBuildConsoleFlag(key: BuildConsoleFeatureKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(BUILD_CONSOLE_FEATURE_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isBuildConsoleFeatureEnabled(key: BuildConsoleFeatureKey): boolean {
  const remote = readRemoteBuildConsoleFlag(key);
  const result = typeof remote === "boolean" ? remote : BUILD_CONSOLE_FEATURES[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] console.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${BUILD_CONSOLE_FEATURES[key]})`,
    );
  }
  return result;
}

export function snapshotAllBuildConsoleFeatureFlags(): FlagSnapshot[] {
  return (Object.keys(BUILD_CONSOLE_FEATURES) as BuildConsoleFeatureKey[]).map((key) => {
    const remote = readRemoteBuildConsoleFlag(key);
    const staticValue = BUILD_CONSOLE_FEATURES[key];
    return {
      key,
      flagKey: BUILD_CONSOLE_FEATURE_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 *  BUILD PLATFORMS — flags for each target-platform tile on the
 *  "Build" wizard step (and the equivalent picker in StudioBuilder).
 *  Hiding a platform here removes the tile AND drops the platform from
 *  the auto-detected default selection — so a user can't accidentally
 *  ship an artifact for a target you've disabled.
 *
 *  NOTE: This is independent of the orchestrator's `canBuildOnHost`
 *  filter — that one blocks impossible-on-this-OS builds (mac on Windows,
 *  Linux AppImage on Windows) regardless of these flags. These flags are
 *  about *product* targeting (e.g. "we don't support Linux yet"), not
 *  technical capability.
 * ───────────────────────────────────────────────────────────────────────
 */
export const BUILD_PLATFORMS = {
  win:   true, // Windows (.exe via NSIS)
  mac:   true, // macOS (.dmg)
  linux: true, // Linux (AppImage)
} as const;

export type BuildPlatformKey = keyof typeof BUILD_PLATFORMS;

const BUILD_PLATFORM_FLAG_KEYS: Record<BuildPlatformKey, string> = {
  win:   "feature-platform-win",
  mac:   "feature-platform-mac",
  linux: "feature-platform-linux",
};

function readRemoteBuildPlatformFlag(key: BuildPlatformKey): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = posthog.isFeatureEnabled(BUILD_PLATFORM_FLAG_KEYS[key]);
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isBuildPlatformEnabled(key: BuildPlatformKey): boolean {
  const remote = readRemoteBuildPlatformFlag(key);
  const result = typeof remote === "boolean" ? remote : BUILD_PLATFORMS[key];
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[features] platform.${key} → ${result} (posthog=${remote === undefined ? "undefined" : remote}, static=${BUILD_PLATFORMS[key]})`,
    );
  }
  return result;
}

export function snapshotAllBuildPlatformFlags(): FlagSnapshot[] {
  return (Object.keys(BUILD_PLATFORMS) as BuildPlatformKey[]).map((key) => {
    const remote = readRemoteBuildPlatformFlag(key);
    const staticValue = BUILD_PLATFORMS[key];
    return {
      key,
      flagKey: BUILD_PLATFORM_FLAG_KEYS[key],
      staticValue,
      remoteValue: remote,
      effective: typeof remote === "boolean" ? remote : staticValue,
    };
  });
}
