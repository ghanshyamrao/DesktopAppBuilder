import type { IpcResult, AIChatMessage, AIChatContext } from "@/types";
import { track } from "@/lib/analytics";
import { isEnabled } from "@/lib/features";

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error ?? "Unknown error");
  return result.data as T;
}

/**
 * Pre-flight gate registered by `<DeveloperModePromptProvider>` on mount.
 * `api.builds.start` consults it before spawning a build so we can prompt
 * the user for the symlink-creation permission first. Returns `true` when
 * the build can proceed.
 *
 * Defaults to a no-op pass so non-UI consumers (tests, scripts) aren't
 * blocked when no provider is mounted.
 */
let buildPreflight: () => Promise<boolean> = async () => true;
export function setBuildPreflight(fn: () => Promise<boolean>): void {
  buildPreflight = fn;
}
export function clearBuildPreflight(): void {
  buildPreflight = async () => true;
}

export class BuildCancelledByUser extends Error {
  constructor() {
    super("Build cancelled — required Windows permission was not granted.");
    this.name = "BuildCancelledByUser";
  }
}

/**
 * Subscription gate registered by `<BillingGateProvider>`. Consulted by
 * `api.builds.start` so a single check covers every call site (Dashboard
 * bulk build, AppStudio, BuildProgress retry, Deploy, AIAssistant, …).
 * Returns `true` when the user holds an active paid plan. When false,
 * the provider is expected to navigate the user to the Billing page
 * AND throw `SubscriptionRequiredError` so the call site can short-circuit.
 *
 * Default is a no-op pass so non-UI consumers (tests, scripts) aren't
 * blocked when no provider is mounted.
 */
let subscriptionGate: () => Promise<boolean> = async () => true;
export function setSubscriptionGate(fn: () => Promise<boolean>): void {
  subscriptionGate = fn;
}
export function clearSubscriptionGate(): void {
  subscriptionGate = async () => true;
}

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("An active subscription is required to build apps.");
    this.name = "SubscriptionRequiredError";
  }
}

/**
 * Daily-build-limit failure. Thrown by `api.builds.start` when the user
 * already used their per-day quota. The renderer's gate provider catches
 * this and routes the user to /billing with an "upgrade for more builds"
 * toast.
 */
export class DailyBuildLimitExceeded extends Error {
  used: number;
  limit: number;
  constructor(used: number, limit: number) {
    super(`Daily build limit reached (${used} / ${limit}). Upgrade your plan for more builds per day.`);
    this.name = "DailyBuildLimitExceeded";
    this.used = used;
    this.limit = limit;
  }
}

/**
 * Trial-cap failure. Thrown when a trial user runs out of their lifetime
 * build allowance (e.g. all 3 builds consumed). The gate provider's
 * `onBuildBlocked` handler routes them to /billing.
 */
export class TrialExhaustedError extends Error {
  used: number;
  limit: number;
  constructor(used: number, limit: number) {
    super(`You've used all ${limit} trial builds. Upgrade to a paid plan to keep building.`);
    this.name = "TrialExhaustedError";
    this.used = used;
    this.limit = limit;
  }
}

/**
 * Callback the SubscriptionGateProvider registers so api.builds.start
 * can notify the renderer when a build is blocked at the limit/trial
 * gate (the provider handles navigation + toast).
 */
type BuildBlockedReason = "no-subscription" | "daily-limit-exceeded" | "trial-exhausted";
let onBuildBlocked: (reason: BuildBlockedReason, info: { used: number; limit: number | null }) => void = () => {};
export function setOnBuildBlocked(fn: typeof onBuildBlocked): void {
  onBuildBlocked = fn;
}
export function clearOnBuildBlocked(): void {
  onBuildBlocked = () => {};
}

/**
 * Feature gate registered by `<SubscriptionGateProvider>`. Returns
 * `true` when the current user's plan includes the given feature key,
 * `false` when it doesn't (provider also navigates to /billing).
 */
let featureGate: (key: import("@/types").GatedFeatureKey) => boolean = () => true;
export function setFeatureGate(fn: (key: import("@/types").GatedFeatureKey) => boolean): void {
  featureGate = fn;
}
export function clearFeatureGate(): void {
  featureGate = () => true;
}
export function requireFeature(key: import("@/types").GatedFeatureKey): boolean {
  return featureGate(key);
}

export const api = {
  projects: {
    list: () => unwrap(window.w2a.projects.list()),
    get: (id: string) => unwrap(window.w2a.projects.get(id)),
    create: (input: Parameters<typeof window.w2a.projects.create>[0]) =>
      unwrap(window.w2a.projects.create(input)),
    update: async (id: string, patch: Parameters<typeof window.w2a.projects.update>[1]) => {
      const result = await unwrap(window.w2a.projects.update(id, patch));
      track({
        name: "project_updated",
        props: { project_id: id, fields: Object.keys(patch as Record<string, unknown>) },
      });
      return result;
    },
    delete: async (id: string) => {
      const result = await unwrap(window.w2a.projects.delete(id));
      track({ name: "project_deleted", props: { project_id: id } });
      return result;
    },
    clone: (id: string) => unwrap(window.w2a.projects.clone(id)),
    getIconDataUrl: (id: string) => unwrap(window.w2a.projects.getIconDataUrl(id)),
    export: (id: string) => unwrap(window.w2a.projects.export(id)),
    exportSource: (id: string) => unwrap(window.w2a.projects.exportSource(id)),
    import: (filePath?: string) => unwrap(window.w2a.projects.import(filePath)),
  },
  builds: {
    start: async (projectId: string) => {
      // 1. Subscription gate — must hold an active paid plan. The provider
      //    navigates the user to the Billing page when this returns false.
      const subOk = await subscriptionGate();
      if (!subOk) throw new SubscriptionRequiredError();

      // 2. Daily build-limit / trial cap gate. The main-process handler
      //    atomically reserves a slot before we even call `builds:start`,
      //    so two parallel clicks can't both pass when only one slot is
      //    left. Skipped entirely when the PostHog `feature-billing` flag
      //    is off — that mode is for super-admin / dev testing where
      //    enforcement must be inert end-to-end (gate + usage counter).
      const billingEnabled = isEnabled("billing");
      let usage: { used: number; limit: number | null } = { used: 0, limit: null };
      if (billingEnabled) {
        const verdict = await unwrap(window.w2a.billing.recordBuild());
        if (!verdict.allowed) {
          // Notify the provider so it can navigate + toast. The thrown
          // error below is purely for the call site to abort its flow.
          // `verdict.reason` is "ok" | <failure>; `!verdict.allowed` narrows
          // out "ok", but TS can't see the relationship — cast explicitly.
          onBuildBlocked(verdict.reason as BuildBlockedReason, { used: verdict.used, limit: verdict.limit });
          if (verdict.reason === "trial-exhausted") {
            track({ name: "build_blocked_trial_exhausted", props: { project_id: projectId, used: verdict.used, limit: verdict.limit ?? 0 } });
            throw new TrialExhaustedError(verdict.used, verdict.limit ?? 0);
          }
          if (verdict.reason === "daily-limit-exceeded") {
            track({ name: "build_blocked_daily_limit", props: { project_id: projectId, used: verdict.used, limit: verdict.limit ?? 0 } });
            throw new DailyBuildLimitExceeded(verdict.used, verdict.limit ?? 0);
          }
          // "no-subscription" — fall back to the same error the sub gate throws.
          throw new SubscriptionRequiredError();
        }
        usage = { used: verdict.used, limit: verdict.limit };
      }

      // 3. Windows symlink-privilege preflight (unchanged behavior).
      const ok = await buildPreflight();
      if (!ok) throw new BuildCancelledByUser();
      const result = await unwrap(window.w2a.builds.start(projectId));
      track({ name: "build_started", props: { project_id: projectId, used: usage.used, limit: usage.limit ?? -1 } });
      return result;
    },
    cancel: async (buildId: string) => {
      const result = await unwrap(window.w2a.builds.cancel(buildId));
      track({ name: "build_cancelled", props: { project_id: buildId } });
      return result;
    },
    revealOutput: async (projectId: string) => {
      // Reveal output is a Lifetime-tier-only perk. requireFeature throws
      // (which short-circuits the IPC) and routes the user to /billing
      // when the active plan doesn't include it. Free trial + Monthly
      // users see the upgrade prompt instead of opening Explorer.
      if (!requireFeature("reveal-output")) {
        throw new Error("Reveal output requires the Lifetime plan.");
      }
      const result = await unwrap(window.w2a.builds.revealOutput(projectId));
      track({ name: "build_revealed", props: { project_id: projectId } });
      return result;
    },
    getLogs: (projectId: string) => unwrap(window.w2a.builds.getLogs(projectId)),
    export: async (projectId: string, destDir?: string) => {
      // Export is available on every plan — anyone who produced a build
      // gets to copy the artifacts to a folder of their choice. The button
      // is rendered unconditionally on the success state in BuildProgress,
      // so this matches the UI affordance.
      const result = await unwrap(window.w2a.builds.export(projectId, destDir));
      track({ name: "build_exported", props: { project_id: projectId } });
      return result;
    },
  },
  settings: {
    get: () => unwrap(window.w2a.settings.get()),
    update: async (patch: Parameters<typeof window.w2a.settings.update>[0]) => {
      const result = await unwrap(window.w2a.settings.update(patch));
      const keys = Object.keys(patch as Record<string, unknown>);
      track({ name: "settings_updated", props: { section: keys[0] ?? "unknown", keys } });
      return result;
    },
  },
  dialog: {
    pickIcon: () => unwrap(window.w2a.dialog.pickIcon()),
    fetchFavicon: (url: string) => unwrap(window.w2a.dialog.fetchFavicon(url)),
    saveIconDataUrl: (dataUrl: string, hint: string) =>
      unwrap(window.w2a.dialog.saveIconDataUrl(dataUrl, hint)),
    pickOutputDir: () => unwrap(window.w2a.dialog.pickOutputDir()),
    pickPfx: () => unwrap(window.w2a.dialog.pickPfx()),
  },
  publish: {
    github: (projectId: string) => unwrap(window.w2a.publish.github(projectId)),
  },
  system: {
    openSettings: (key: "developers") => unwrap(window.w2a.system.openSettings(key)),
    checkSymlinkPrivilege: () => unwrap(window.w2a.system.checkSymlinkPrivilege()),
    openNetworkSettings: () => unwrap(window.w2a.system.openNetworkSettings()),
  },
  auth: {
    status: () => unwrap(window.w2a.auth.status()),
    signIn: () => unwrap(window.w2a.auth.signIn()),
    signOut: () => unwrap(window.w2a.auth.signOut()),
  },
  billing: {
    listPlans: () => unwrap(window.w2a.billing.listPlans()),
    status: () => unwrap(window.w2a.billing.status()),
    setMode: (mode: "sandbox" | "production") =>
      unwrap(window.w2a.billing.setMode(mode)),
    openCheckout: async (planKey: string) => {
      const result = await unwrap(window.w2a.billing.openCheckout(planKey));
      track({ name: "billing_checkout_opened", props: { plan: planKey, mode: result.mode } });
      return result;
    },
    applySession: async (sessionId: string) => {
      const result = await unwrap(window.w2a.billing.applySession(sessionId));
      track({ name: "billing_session_applied", props: { tier: result.tier } });
      return result;
    },
    refresh: () => unwrap(window.w2a.billing.refresh()),
    recordBuild: () => unwrap(window.w2a.billing.recordBuild()),
  },
  firstRun: {
    status: () => unwrap(window.w2a.firstRun.status()),
    acknowledge: () => unwrap(window.w2a.firstRun.acknowledge()),
  },
  ai: {
    hasApiKey: () => unwrap(window.w2a.ai.hasApiKey()),
    generateProject: (prompt: string) => unwrap(window.w2a.ai.generateProject(prompt)),
    chat: (messages: AIChatMessage[], context: AIChatContext) =>
      unwrap(window.w2a.ai.chat(messages, context)),
  },
  window: {
    minimize: () => unwrap(window.w2a.window.minimize()),
    toggleMaximize: () => unwrap(window.w2a.window.toggleMaximize()),
    close: () => unwrap(window.w2a.window.close()),
    isMaximized: () => unwrap(window.w2a.window.isMaximized()),
    reload: () => unwrap(window.w2a.window.reload()),
    toggleDevTools: () => unwrap(window.w2a.window.toggleDevTools()),
    setTitleBarOverlay: (color: string, symbolColor: string) =>
      unwrap(window.w2a.window.setTitleBarOverlay(color, symbolColor)),
  },
};
