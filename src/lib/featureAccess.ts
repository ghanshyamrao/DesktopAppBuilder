/**
 * Synchronous, read-only checks against the current subscription. Unlike
 * `requireFeature(key)` in `lib/api.ts`, these helpers DO NOT redirect or
 * toast — they just return a boolean. Use them in render paths to hide /
 * disable UI affordances the user can't access (so they never see a
 * menu item that bounces them straight to /billing on click).
 *
 * Backed by the same zustand store as the active gate, so they update
 * automatically on Paddle-checkout completion / sign-out / refresh.
 */
import { useAppStore } from "@/store/appStore";
import { isEnabled } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { GatedFeatureKey } from "@/types";

/**
 * True when the signed-in user matches the `feature-admin-override` flag's
 * release condition (email allow-list configured in PostHog). Admins
 * bypass every subscription + feature gate — useful for dogfooding
 * production-billing flows or paid-only features without an active plan.
 *
 * Static default is `false`, so a missing flag / SDK failure / offline
 * boot can never grant admin access by accident.
 */
export function isAdmin(): boolean {
  return isEnabled("adminOverride");
}

/**
 * Hook variant — subscribes to PostHog flag reloads so components
 * re-render the moment the admin entitlement flips on/off (e.g. when
 * flags resolve a beat after sign-in).
 */
export function useIsAdmin(): boolean {
  useFeatureFlagsLoadedTick();
  return isEnabled("adminOverride");
}

/**
 * Imperative check — true when the active plan includes `key`.
 *
 * Reads the store synchronously at call time, so callers in event
 * handlers see the latest subscription without subscribing the parent
 * component to re-renders.
 *
 * Admins short-circuit to `true` regardless of subscription state.
 */
export function hasFeature(key: GatedFeatureKey): boolean {
  if (isAdmin()) return true;
  const sub = useAppStore.getState().subscription;
  if (!sub) return false;        // loading
  if (!sub.active) return false; // no plan or expired
  return sub.features.includes(key);
}

/**
 * React hook variant — subscribes the component so the UI re-renders
 * when the user's plan changes (e.g. they return from Paddle and the
 * feature becomes available without a refresh).
 *
 * Also re-renders when the admin flag flips, so a freshly-resolved
 * admin entitlement reveals gated UI without a manual refresh.
 */
export function useHasFeature(key: GatedFeatureKey): boolean {
  useFeatureFlagsLoadedTick();
  const fromSubscription = useAppStore((s) => {
    const sub = s.subscription;
    if (!sub || !sub.active) return false;
    return sub.features.includes(key);
  });
  return isAdmin() || fromSubscription;
}
