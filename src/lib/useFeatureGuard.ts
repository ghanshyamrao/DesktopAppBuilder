import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { requireFeature } from "@/lib/api";
import type { GatedFeatureKey } from "@/types";

/**
 * Defense-in-depth page guard. Drop this at the top of any page that
 * gates on a `GatedFeatureKey` — if the user's plan doesn't unlock the
 * feature, the call to `requireFeature` redirects them to /billing and
 * fires the upgrade toast.
 *
 * Used in addition to the sidebar click gate so the page stays protected
 * against bypass paths the sidebar doesn't cover: keyboard shortcuts
 * (Cmd+1..9), the command palette, AppStudio's "Open Action Builder"
 * button, AIAssistant's `open_route` action, and any future deep-link.
 *
 * The check re-runs whenever the user's subscription changes (e.g. they
 * just paid for an upgrade) so paid users aren't bounced off the page
 * they were already viewing.
 */
export function useFeatureGuard(key: GatedFeatureKey): void {
  const subscription = useAppStore((s) => s.subscription);
  useEffect(() => {
    // Wait until subscription state has loaded — `requireFeature` is a
    // no-op when the gate provider isn't initialized, so we'd let the
    // user through on the first paint otherwise.
    if (subscription === null) return;
    requireFeature(key);
  }, [key, subscription]);
}
