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
import type { GatedFeatureKey } from "@/types";

/**
 * Imperative check — true when the active plan includes `key`.
 *
 * Reads the store synchronously at call time, so callers in event
 * handlers see the latest subscription without subscribing the parent
 * component to re-renders.
 */
export function hasFeature(key: GatedFeatureKey): boolean {
  const sub = useAppStore.getState().subscription;
  if (!sub) return false;        // loading
  if (!sub.active) return false; // no plan or expired
  return sub.features.includes(key);
}

/**
 * React hook variant — subscribes the component so the UI re-renders
 * when the user's plan changes (e.g. they return from Paddle and the
 * feature becomes available without a refresh).
 */
export function useHasFeature(key: GatedFeatureKey): boolean {
  return useAppStore((s) => {
    const sub = s.subscription;
    if (!sub || !sub.active) return false;
    return sub.features.includes(key);
  });
}
