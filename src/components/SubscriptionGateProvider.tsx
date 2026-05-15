import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/store/appStore";
import { useToast } from "@/components/ui/Toast";
import { api, setSubscriptionGate, clearSubscriptionGate, setFeatureGate, clearFeatureGate, setOnBuildBlocked, clearOnBuildBlocked } from "@/lib/api";
import { isEnabled } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import BillingSuccessModal from "@/components/BillingSuccessModal";
import type { GatedFeatureKey, SubscriptionSummary } from "@/types";

/** Display labels surfaced in upgrade toasts. */
const FEATURE_LABEL: Record<GatedFeatureKey, string> = {
  "app-studio":       "App Studio",
  "templates":        "Templates",
  "theme-builder":    "Theme Builder",
  "action-builder":   "Action Builder",
  "ai-assistant":     "AI Assistant",
  "custom-css-js":    "Custom CSS / JS",
  "github-publish":   "GitHub Publish",
  "code-signing":     "Code signing",
  "priority-support": "Priority support",
  "theme-switch":     "Theme switching",
  "notifications":    "Notifications",
  "reveal-output":    "Reveal output",
};

/** Minimum tier that unlocks each feature — surfaced in the upgrade toast
 *  so the user knows exactly which plan to pick. Keep in sync with the
 *  plan catalog in electron/services/paddleService.ts. */
const MIN_TIER_FOR_FEATURE: Record<GatedFeatureKey, string> = {
  "app-studio":       "Free Trial",
  "templates":        "Free Trial",
  "action-builder":   "Free Trial",
  "theme-builder":    "Monthly",
  "ai-assistant":     "Monthly",
  "custom-css-js":    "Monthly",
  "github-publish":   "Monthly",
  "code-signing":     "Monthly",
  "theme-switch":     "Monthly",
  "notifications":    "Monthly",
  "reveal-output":    "Lifetime",
  "priority-support": "Lifetime",
};

/**
 * Wires `api.builds.start`'s subscription preflight into the renderer.
 *
 * Mount this once inside `<AuthGate>` (so the user is already signed in
 * by the time it runs). It:
 *   1. Loads the current subscription state on mount.
 *   2. Listens for `billing:state` broadcasts from main so paid users
 *      get unlocked instantly after returning from Paddle Checkout.
 *   3. Registers a gate function with `setSubscriptionGate` that
 *      `api.builds.start` consults on every build attempt — when the
 *      user has no active plan, the gate navigates to the Billing page,
 *      surfaces a toast, and returns `false` so the build short-circuits.
 */
export default function SubscriptionGateProvider({ children }: { children: ReactNode }) {
  const subscription = useAppStore((s) => s.subscription);
  const loadSubscription = useAppStore((s) => s.loadSubscription);
  const setSubscription = useAppStore((s) => s.setSubscription);
  const navigate = useAppStore((s) => s.navigate);
  const toast = useToast();

  // Re-render when PostHog reloads its flag set. `isEnabled("billing")`
  // reads synchronously below, so a flag flip needs an explicit nudge
  // to take effect without a page reload.
  useFeatureFlagsLoadedTick();
  const billingEnabled = isEnabled("billing");
  // Default to sandbox mode while the flag is unresolved — safer than
  // accidentally taking real money from a flag-loading race condition.
  const billingMode: "sandbox" | "production" =
    isEnabled("billingProduction") ? "production" : "sandbox";

  // Push the resolved Paddle mode into the main process whenever it
  // changes (initial load, flag refresh, manual override). Main caches
  // this on PaddleService.currentMode so all subsequent operations
  // route to the right Paddle environment without per-call mode args.
  // Best-effort: a transient IPC failure leaves main on its previous
  // mode (defaults to sandbox at boot) and the next tick will retry.
  useEffect(() => {
    if (!billingEnabled) return;
    api.billing.setMode(billingMode).catch(() => {
      // Main not ready yet, or IPC handler not registered. Will retry
      // automatically on the next flag-loaded tick.
    });
  }, [billingEnabled, billingMode]);

  // Initial load + live state stream. Skipped entirely when the feature
  // flag is off — no IPC traffic, no Paddle lookups for free users.
  useEffect(() => {
    if (!billingEnabled) return;
    (async () => {
      await loadSubscription();
      // After the cached local state has loaded, kick off a one-shot
      // background refresh against Paddle. The refresh handler self-heals
      // when the customer was archived out-of-band (e.g. someone removed
      // them from the Paddle dashboard), clearing the stale entitlement
      // and broadcasting the new free-tier summary. Silenced when no
      // customer is on file.
      const sub = useAppStore.getState().subscription;
      if (sub?.paddleCustomerId && sub.configured !== false) {
        try { await api.billing.refresh(); }
        catch {
          // Paddle is unreachable — keep cached state; user can hit
          // Refresh manually later.
        }
      }
    })();
    const off = window.w2a.billing.onState((next) => {
      setSubscription(next);
    });
    return off;
  }, [billingEnabled, loadSubscription, setSubscription]);

  // Register/unregister the gate. Reads the latest subscription value
  // out of the store at call time so the closure never goes stale.
  // When the feature flag is off, we register a pass-through gate so
  // `api.builds.start` always proceeds (and we explicitly clear any
  // stale gate from a previous flag-on session).
  useEffect(() => {
    if (!billingEnabled) {
      setSubscriptionGate(async () => true);
      return () => clearSubscriptionGate();
    }
    setSubscriptionGate(async () => {
      const sub = useAppStore.getState().subscription;
      // Still loading — let the user through rather than blocking on a
      // network hop. Real payment enforcement re-checks on the next click.
      if (!sub) return true;
      if (sub.active) return true;

      navigate({ name: "billing" });
      toast.error(
        "Pick a plan to keep building",
        sub.tier === "free"
          ? "Building apps needs an active subscription. Choose any plan to start."
          : "Your plan has expired. Renew to keep building.",
      );
      return false;
    });

    // Feature gate — UI components call `requireFeature("ai-assistant")`
    // before opening their entry point. If the current plan doesn't
    // include the key, the gate redirects to /billing and toasts the
    // minimum tier that unlocks the feature.
    setFeatureGate((key) => {
      const sub = useAppStore.getState().subscription;
      // Loading or no subscription → block & redirect.
      if (!sub || !sub.active) {
        navigate({ name: "billing" });
        toast.error(
          "Pick a plan to use this feature",
          "An active subscription unlocks the rest of the builder.",
        );
        return false;
      }
      if (sub.features.includes(key)) return true;

      const label = FEATURE_LABEL[key] ?? key;
      const minTier = MIN_TIER_FOR_FEATURE[key];
      navigate({ name: "billing" });
      toast.error(
        `${label} isn't in your current plan`,
        minTier
          ? `Upgrade to the ${minTier} plan or higher to unlock ${label}.`
          : `Upgrade your plan to unlock ${label}.`,
      );
      return false;
    });
    // Build-blocked handler — fires when api.builds.start gets a "no"
    // verdict from the main-process recordBuild gate. Surfaces a useful
    // toast and parks the user on /billing so the upgrade path is one
    // click away.
    setOnBuildBlocked((reason, info) => {
      if (reason === "trial-exhausted") {
        navigate({ name: "billing" });
        toast.error(
          `You've used all ${info.limit ?? 3} trial builds`,
          "Pick a paid plan to keep building.",
        );
      } else if (reason === "daily-limit-exceeded") {
        navigate({ name: "billing" });
        toast.error(
          `Today's build limit (${info.limit ?? 0}) is full`,
          "Upgrade to a higher plan for more daily builds.",
        );
      }
      // "no-subscription" is already covered by subscriptionGate above
      // — no second nav/toast needed.
    });

    return () => {
      clearSubscriptionGate();
      clearFeatureGate();
      clearOnBuildBlocked();
    };
  }, [billingEnabled, navigate, toast]);

  // Post-checkout success modal — pops when we see the subscription
  // flip from "no plan" or "inactive" to "active". The deep-link handler
  // in main fires `billing:state` with the new summary; we just watch
  // for the transition rather than wiring a separate "checkout-completed"
  // event so manually refreshing also triggers the popup if Paddle says
  // the user is now paid.
  const [successFor, setSuccessFor] = useState<SubscriptionSummary | null>(null);
  const prevActiveRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!subscription) return;
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = subscription.active;
    // null = first observation, nothing to compare against.
    if (wasActive === null) return;
    if (!wasActive && subscription.active) {
      setSuccessFor(subscription);
    }
  }, [subscription]);

  return (
    <>
      {children}
      <BillingSuccessModal
        subscription={successFor}
        onDismiss={() => setSuccessFor(null)}
        onOpenBilling={() => {
          setSuccessFor(null);
          navigate({ name: "billing" });
        }}
      />
    </>
  );
}
