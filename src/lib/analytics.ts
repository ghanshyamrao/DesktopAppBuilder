import { useEffect, useState, useSyncExternalStore } from "react";
import posthog from "posthog-js";
import type { AuthUser } from "@/types";

/**
 * ───────────────────────────────────────────────────────────────────────
 *  ANALYTICS — thin wrapper over posthog-js for the renderer process.
 *
 *  Everything PostHog-related goes through this module so that:
 *    • Event names are typed and discoverable.
 *    • Calls are no-ops when the key isn't configured (CI, dev without .env).
 *    • Feature flags have a safe local fallback if the flag service is down.
 *    • Logout cleanly resets the distinct id.
 *
 *  Initialization happens in `src/main.tsx` before React mounts.
 * ───────────────────────────────────────────────────────────────────────
 */

/** True when PostHog was given a key — guards every capture/identify call. */
function enabled(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);
}

/* ---- Typed event surface --------------------------------------------- */

export type AnalyticsEvent =
  // Auth
  | { name: "auth_signed_in"; props?: { method?: string } }
  | { name: "auth_signed_out" }
  | { name: "first_run_acknowledged" }
  // Navigation
  | { name: "route_viewed"; props: { route: string; project_id?: string } }
  // Projects
  | { name: "project_created"; props: { project_id: string; from: "wizard" | "ai" | "starter"; theme_id?: string } }
  | { name: "project_deleted"; props: { project_id: string } }
  | { name: "project_updated"; props: { project_id: string; fields: string[] } }
  // Wizard
  | { name: "wizard_started"; props?: { starter_id?: string } }
  | { name: "wizard_step_completed"; props: { step: string } }
  | { name: "wizard_completed"; props: { project_id: string } }
  | { name: "wizard_abandoned"; props: { step: string } }
  // Builds
  | { name: "build_started"; props: { project_id: string; platforms?: string[] } }
  | { name: "build_succeeded"; props: { project_id: string; duration_seconds?: number } }
  | { name: "build_failed"; props: { project_id: string; reason?: string } }
  | { name: "build_cancelled"; props: { project_id: string } }
  | { name: "build_exported"; props: { project_id: string } }
  | { name: "build_revealed"; props: { project_id: string } }
  | { name: "build_blocked_trial_exhausted"; props: { project_id: string; used: number; limit: number } }
  | { name: "build_blocked_daily_limit"; props: { project_id: string; used: number; limit: number } }
  // Billing
  | { name: "billing_checkout_opened"; props: { plan: string } }
  | { name: "billing_session_applied"; props: { tier: import("@/types").BillingTier } }
  // Themes
  | { name: "theme_applied"; props: { theme_id: string; project_id?: string } }
  | { name: "theme_customized"; props: { project_id?: string } }
  // Actions / Recipes / Plugins
  | { name: "recipe_applied"; props: { recipe_id: string; project_id: string } }
  | { name: "plugin_installed"; props: { plugin_id: string; project_id?: string } }
  | { name: "action_configured"; props: { project_id: string; action: string } }
  // AI Assistant
  | { name: "ai_chat_sent"; props: { length: number } }
  | { name: "ai_draft_applied"; props: { project_id?: string } }
  | { name: "ai_action_clicked"; props: { kind: string } }
  // Settings
  | { name: "settings_updated"; props: { section: string; keys: string[] } }
  // Notifications / shell
  | { name: "command_palette_opened" }
  | { name: "notification_clicked"; props: { kind: string } }
  // Generic feature surface
  | { name: "feature_used"; props: { feature: string; [k: string]: unknown } };

/**
 * Capture a typed event. Falls back to a noop when PostHog isn't initialized.
 *
 * The props are spread directly so PostHog's payload stays flat — that's
 * what the dashboards expect.
 */
export function track<E extends AnalyticsEvent>(event: E): void {
  if (!enabled()) return;
  const props = "props" in event ? (event.props as Record<string, unknown> | undefined) : undefined;
  try {
    posthog.capture(event.name, props);
  } catch {
    // Capture must never break a user flow.
  }
}

/** Identify the signed-in user so events tie to a person, not just a device. */
export function identify(user: AuthUser): void {
  if (!enabled()) return;
  try {
    posthog.identify(user.sub, {
      email: user.email,
      name: user.name,
      email_verified: user.emailVerified,
      $set_once: { first_seen_at: new Date().toISOString() },
    });
    // identify() schedules a flag reload internally, but force it again
    // so the renderer's first render after sign-in sees flags evaluated
    // against the now-known person rather than the anonymous distinct id.
    posthog.reloadFeatureFlags();
  } catch {
    // ignore
  }
}

/** Manually force a flag refresh. Used by App.tsx on mount. */
export function reloadFeatureFlags(): void {
  if (!enabled()) return;
  try {
    posthog.reloadFeatureFlags();
  } catch {
    // ignore
  }
}

/** Reset the device-level distinct id — call on sign-out. */
export function resetIdentity(): void {
  if (!enabled()) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}

/**
 * Manually report an exception. Errors bubbled through React's ErrorBoundary
 * land here so they show up under PostHog → Error Tracking.
 */
export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!enabled()) return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    // posthog-js 1.180+ exposes captureException; fall back to a regular
    // event for older bundles so we never throw inside an error path.
    const ph = posthog as unknown as { captureException?: (e: Error, p?: Record<string, unknown>) => void };
    if (typeof ph.captureException === "function") {
      ph.captureException(error, extra);
    } else {
      posthog.capture("$exception", {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        ...extra,
      });
    }
  } catch {
    // ignore
  }
}

/* ---- Feature flags --------------------------------------------------- */

/**
 * Read a boolean feature flag with a hardcoded fallback. The fallback is
 * what ships when PostHog is unreachable, the user is offline, or no flag
 * with that key has been created in the project yet.
 *
 * Multivariate flags are surfaced as strings via `getFeatureFlagVariant`.
 */
export function getFeatureFlag(key: string, fallback = false): boolean {
  if (!enabled()) return fallback;
  try {
    const value = posthog.isFeatureEnabled(key);
    return typeof value === "boolean" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function getFeatureFlagVariant(key: string, fallback = ""): string {
  if (!enabled()) return fallback;
  try {
    const value = posthog.getFeatureFlag(key);
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * React hook that re-renders when PostHog has loaded flags or the flag
 * value flips. Reading the flag directly inside a component leaves the
 * component frozen on its first-render value (which is `fallback` while
 * the SDK is still bootstrapping).
 */
export function useFeatureFlag(key: string, fallback = false): boolean {
  const value = useSyncExternalStore(
    subscribeToFlags,
    () => getFeatureFlag(key, fallback),
    () => fallback,
  );
  return value;
}

export function useFeatureFlagVariant(key: string, fallback = ""): string {
  return useSyncExternalStore(
    subscribeToFlags,
    () => getFeatureFlagVariant(key, fallback),
    () => fallback,
  );
}

function subscribeToFlags(listener: () => void): () => void {
  if (!enabled()) return () => {};
  try {
    const unsub = posthog.onFeatureFlags(() => listener());
    return typeof unsub === "function" ? unsub : () => {};
  } catch {
    return () => {};
  }
}

/**
 * Force a re-render of the calling component each time PostHog reloads its
 * flag set. Mount this once near the root of the tree so children that call
 * `isEnabled` / `isRouteEnabled` directly (without a hook) pick up remote
 * flag values when they arrive after first paint.
 */
export function useFeatureFlagsLoadedTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled()) return;
    try {
      const unsub = posthog.onFeatureFlags(() => setTick((t) => t + 1));
      return typeof unsub === "function" ? unsub : undefined;
    } catch {
      return undefined;
    }
  }, []);
  return tick;
}

/* ---- Group analytics ------------------------------------------------- */

/**
 * Tag the user as part of a "project" group. PostHog can then aggregate
 * events by project (e.g. how many builds did project X have this week)
 * alongside the usual person-level breakdown.
 */
export function setProjectGroup(projectId: string, name?: string): void {
  if (!enabled() || !projectId) return;
  try {
    posthog.group("project", projectId, name ? { name } : undefined);
  } catch {
    // ignore
  }
}

/* ---- Surveys --------------------------------------------------------- */

/**
 * Fetch active surveys for the current user. Surveys are configured in
 * the PostHog UI and rendered by the SDK automatically when the bundle
 * was loaded with the surveys add-on, but callers that want to gate UI
 * (e.g. "show survey banner") can read the list directly.
 */
export function loadActiveSurveys(cb: (surveys: unknown[]) => void): void {
  if (!enabled()) {
    cb([]);
    return;
  }
  try {
    posthog.getActiveMatchingSurveys((surveys) => cb(surveys ?? []));
  } catch {
    cb([]);
  }
}

/** Mark a survey as shown so it doesn't reappear on the next pageview. */
export function dismissSurvey(surveyId: string): void {
  if (!enabled()) return;
  try {
    posthog.capture("survey dismissed", { $survey_id: surveyId });
  } catch {
    // ignore
  }
}

/* ---- Convenience hook for page tracking ------------------------------ */

/**
 * Fire a `route_viewed` event whenever the route changes. Use once near
 * the root of the tree — the dependency array gates the capture so we
 * don't fire on every render.
 */
export function useRouteAnalytics(route: { name: string; projectId?: string }): void {
  useEffect(() => {
    track({ name: "route_viewed", props: { route: route.name, project_id: route.projectId } });
  }, [route.name, route.projectId]);
}
