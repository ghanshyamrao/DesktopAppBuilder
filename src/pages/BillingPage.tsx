import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, CreditCard, Loader2, RefreshCw, ShieldCheck, Sparkles,
  AlertTriangle, Crown, Lock, Hammer, Infinity as InfinityIcon,
  ChevronRight, X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/appStore";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { isEnabled } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { BillingPlan, BillingTier, GatedFeatureKey, PricingPeriod, SubscriptionSummary } from "@/types";

/** Compact, marketing-style label per feature key — used inside plan cards. */
const FEATURE_LABEL_SHORT: Record<GatedFeatureKey, string> = {
  "app-studio":       "App Studio",
  // The templates feature is hidden behind a flag at the moment, so this
  // slot doubles as the universal "you get installers on every OS" pitch.
  "templates":        "Cross-platform installers",
  "theme-builder":    "Theme Builder",
  "action-builder":   "Action Builder (tray, shortcuts)",
  "ai-assistant":     "AI Assistant",
  "custom-css-js":    "Custom CSS / JS injection",
  "github-publish":   "GitHub Releases publish",
  "code-signing":     "Code signing",
  "priority-support": "Priority support",
  "theme-switch":     "Light / Dark / Custom theme",
  "notifications":    "In-app notifications",
  "reveal-output":    "Reveal output folder",
};

/** "10 / day", "Unlimited builds", "—". */
function formatLimit(limit: number | null): string {
  if (limit === null) return "Unlimited builds";
  if (limit === 0) return "No builds";
  return `${limit} builds / day`;
}

/** Cap of feature rows visible inline in each card. Everything above this
 *  count collapses behind a "Show all features" link that opens the
 *  per-plan details modal. Kept small so all five cards stay the same
 *  visual height. */
const MAX_VISIBLE_ROWS = 4;

/**
 * Stable rank for upgrade-only gating. Mirror of the rank table in
 * electron/services/paddleService.ts — keep in sync.
 */
const TIER_RANK: Record<BillingTier, number> = {
  free: 0,
  // Trial sits at rank 0 with free — any paid plan counts as an upgrade
  // so the lock state never blocks a real purchase.
  trial: 0,
  "1mo": 1,
  "3mo": 2,
  "6mo": 3,
  "12mo": 4,
  lifetime: 5,
};

const TIER_LABEL: Record<BillingTier, string> = {
  free: "Free",
  trial: "Free Trial",
  "1mo": "1 Month",
  "3mo": "3 Months",
  "6mo": "6 Months",
  "12mo": "1 Year",
  lifetime: "Lifetime",
};

/** "1 month, 2 days" style remainder string for the active plan. */
function formatRemaining(expiresAt?: string): string {
  if (!expiresAt) return "";
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return "Expired";
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const rest = days % 30;
    return rest > 0
      ? `${months} month${months === 1 ? "" : "s"}, ${rest} day${rest === 1 ? "" : "s"} left`
      : `${months} month${months === 1 ? "" : "s"} left`;
  }
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export default function BillingPage() {
  const subscription = useAppStore((s) => s.subscription);
  const setSubscription = useAppStore((s) => s.setSubscription);
  const loadSubscription = useAppStore((s) => s.loadSubscription);
  const toast = useToast();

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [purchaseInFlight, setPurchaseInFlight] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Plan key whose full-feature modal is open, or null.
  const [detailsForKey, setDetailsForKey] = useState<string | null>(null);
  // Period tabs removed — the new catalog (Trial / Monthly / Lifetime)
  // is small enough to render all at once.

  // Hydrate plans + subscription on mount, then subscribe to the live
  // state events the main process broadcasts after a successful deep-link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ps] = await Promise.all([
          api.billing.listPlans(),
          loadSubscription(),
        ]);
        if (!cancelled) {
          setPlans(ps);
        }
      } catch (e) {
        if (!cancelled) toast.error("Couldn't load billing plans", e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadSubscription, toast]);

  useEffect(() => {
    const offState = window.w2a.billing.onState((next) => {
      const prevTier = useAppStore.getState().subscription?.tier;
      setSubscription(next);
      // Skip the toast on counter updates (same tier, just a build tick).
      if (prevTier === next.tier) return;
      if (next.tier === "lifetime") {
        toast.success("You're now on Lifetime — thanks for the support!");
      } else if (next.tier === "trial") {
        // Trial activation toast is fired from onPurchase already; skip the
        // duplicate here.
        return;
      } else {
        toast.success(`Activated ${TIER_LABEL[next.tier]} plan`);
      }
    });
    const offFail = window.w2a.billing.onApplyFailed(({ reason }) => {
      toast.error("Couldn't apply your purchase", reason);
    });
    const offCancel = window.w2a.billing.onCancelled(() => {
      toast.info?.("Checkout cancelled");
    });
    return () => { offState(); offFail(); offCancel(); };
  }, [setSubscription, toast]);

  const currentTier: BillingTier = subscription?.tier ?? "free";
  const currentRank = TIER_RANK[currentTier];
  const paddleConfigured = subscription?.configured !== false; // default true while loading

  async function onPurchase(plan: BillingPlan) {
    if (purchaseInFlight) return;
    setPurchaseInFlight(plan.key);
    try {
      // Every plan (including the free trial) goes through Paddle
      // Checkout. For the trial, the Paddle price has a 14-day
      // `trialPeriod` baked in — Paddle creates the customer +
      // subscription and auto-charges the monthly rate when the trial
      // ends.
      await api.billing.openCheckout(plan.key);
      toast.success(
        plan.isTrial ? "Opened Paddle to start your trial" : "Opened Paddle in your browser",
        plan.isTrial
          ? "Add a card to start the 14-day trial. You won't be charged until day 15 — cancel anytime."
          : "Complete the payment there. The app will update automatically when you return.",
      );
    } catch (e) {
      toast.error(
        plan.isTrial ? "Couldn't start your trial" : "Couldn't open checkout",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setPurchaseInFlight(null);
    }
  }

  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await api.billing.refresh();
      setSubscription(next);
      toast.success("Subscription refreshed");
    } catch (e) {
      toast.error("Refresh failed", e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  // The "Most popular" highlight goes on 12mo, "Best value" on lifetime —
  // memoized so the lookup happens once per plan-list update.
  const highlight = useMemo(() => {
    const map: Record<string, { label: string; tone: "blue" | "violet" }> = {};
    for (const p of plans) {
      if (p.tier === "12mo")     map[p.key] = { label: "Most popular", tone: "blue" };
      if (p.tier === "lifetime") map[p.key] = { label: "Best value",   tone: "violet" };
    }
    return map;
  }, [plans]);

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Billing"
        title={<>Your <span className="text-gradient">subscription</span></>}
        description="Pick a plan that fits how long you want access. Longer terms cost less per month."
        actions={
          <Button
            leftIcon={refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            onClick={onRefresh}
            disabled={refreshing || !paddleConfigured}
          >
            Refresh
          </Button>
        }
      />

      <div className="px-6 lg:px-8 space-y-6">
        {!paddleConfigured && <SetupBanner />}
        <BillingModeBanner />
        <CurrentPlanCard sub={subscription} />

        {/* Plan grid — the period-tabs split is gone; we ship exactly
            three plans (trial / monthly / lifetime) and render them all
            at once in a 3-up grid. */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-sm font-semibold tracking-tight text-text-primary">Available plans</div>
          </div>
          {loadingPlans ? (
            <div className="flex items-center justify-center py-16 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin mr-2" />
              Loading plans…
            </div>
          ) : (
            <div
              className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${
                plans.length >= 3 ? "lg:grid-cols-3 max-w-none" : "lg:grid-cols-2 max-w-3xl"
              }`}
            >
              {plans
                .map((plan) => {
                  const isCurrent = plan.tier === currentTier && (subscription?.active ?? false);
                  // Lock anything ranked below the user's current plan,
                  // INCLUDING the trial — once you're on Monthly/Lifetime
                  // there's no value in starting a 14-day trial.
                  const isLower = TIER_RANK[plan.tier] < currentRank;
                  // Local hint: this account already activated a trial
                  // before. Paddle is the source of truth (it'll reject a
                  // second trial at checkout), but blocking the CTA here
                  // avoids sending the user to a dead-end Paddle error.
                  const trialBlocked = !!plan.isTrial && (subscription?.trialUsed ?? false);
                  const disabled = isCurrent || isLower || trialBlocked || !paddleConfigured;
                  return (
                    <PlanCard
                      key={plan.key}
                      plan={plan}
                      isCurrent={isCurrent}
                      isLower={isLower}
                      trialBlocked={trialBlocked}
                      disabled={disabled}
                      busy={purchaseInFlight === plan.key}
                      highlight={highlight[plan.key]}
                      onPurchase={() => onPurchase(plan)}
                      onShowDetails={() => setDetailsForKey(plan.key)}
                    />
                  );
                })}
            </div>
          )}
        </div>

        <TrustFooter />
      </div>

      {/* Full-feature modal for the plan whose "Show all features" link
          the user clicked. Rendered once at the page level rather than
          per-card so AnimatePresence has a single child to manage. */}
      <PlanDetailsModal
        plan={plans.find((p) => p.key === detailsForKey) ?? null}
        currentTier={currentTier}
        currentRank={currentRank}
        trialUsed={subscription?.trialUsed ?? false}
        paddleConfigured={paddleConfigured}
        busy={purchaseInFlight}
        onClose={() => setDetailsForKey(null)}
        onPurchase={(plan) => {
          setDetailsForKey(null);
          void onPurchase(plan);
        }}
      />
    </div>
  );
}

/* ───────────────────── current plan banner ───────────────────── */

function CurrentPlanCard({ sub }: { sub: SubscriptionSummary | null }) {
  if (!sub || sub.tier === "free") {
    return (
      <GlassCard className="p-5 flex items-start gap-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-mesh-violet opacity-30 pointer-events-none" />
        <div className="relative w-11 h-11 rounded-xl bg-white/[0.04] border border-border flex items-center justify-center text-text-muted shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="text-2xs uppercase tracking-[0.16em] text-accent-violet font-semibold mb-1">No active plan</div>
          <div className="text-base font-semibold text-text-primary">
            Pick a plan to start building
          </div>
          <div className="text-xs text-text-secondary mt-1">
            All plans include the visual builder, all templates, theme system, and one-click installers.
          </div>
        </div>
      </GlassCard>
    );
  }

  const expired = !sub.active;
  const remaining = formatRemaining(sub.expiresAt);
  const isLifetime = sub.tier === "lifetime";
  const isTrial = sub.isTrial;

  // Trial-specific eyebrow + body copy. Expired trial reads differently
  // from an expired paid plan ("trial ended" vs "renew to keep building").
  const eyebrow = expired
    ? isTrial ? "Trial ended" : "Plan expired"
    : isTrial ? "Free trial" : isLifetime ? "Lifetime" : "Current plan";
  const body =
    isLifetime ? "You own every future update — never pay again." :
    expired && isTrial ? "Pick a paid plan to keep using the builder." :
    expired ? "Renew to keep building apps." :
    isTrial
      ? `${remaining}${sub.expiresAt ? ` · ${(sub.buildsRemainingTotal ?? 0)} of ${sub.totalBuildLimit ?? 3} builds left` : ""}`
      : `${remaining}${sub.expiresAt ? ` · expires ${new Date(sub.expiresAt).toLocaleDateString()}` : ""}`;

  return (
    <GlassCard className={`p-5 flex items-start gap-4 relative overflow-hidden ${expired ? "border-accent-red/40" : ""}`}>
      <div className="absolute inset-0 bg-mesh-violet opacity-30 pointer-events-none" />
      <div
        className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          expired
            ? "bg-accent-red/15 text-accent-red border border-accent-red/30"
            : isTrial
            ? "bg-accent-violet/20 text-accent-violet border border-accent-violet/40"
            : "bg-gradient-to-br from-accent-blue to-accent-violet text-white shadow-glow"
        }`}
      >
        {isLifetime ? <Crown size={18} /> : expired ? <AlertTriangle size={18} /> : isTrial ? <Sparkles size={18} /> : <ShieldCheck size={18} />}
      </div>
      <div className="relative flex-1 min-w-0">
        <div className="text-2xs uppercase tracking-[0.16em] text-accent-violet font-semibold mb-1">
          {eyebrow}
        </div>
        <div className="text-base font-semibold text-text-primary">
          {sub.planLabel ?? TIER_LABEL[sub.tier]}
        </div>
        <div className="text-xs text-text-secondary mt-1">{body}</div>
      </div>
      {!expired && <BuildUsageMeter sub={sub} />}
    </GlassCard>
  );
}

/**
 * Compact stacked counter on the right edge of the current-plan banner.
 * Trial users see their lifetime cap ("2 / 3 trial builds"), paid users
 * see the daily counter, and lifetime users see Unlimited. Hidden on
 * expired plans where the parent already shows a renewal CTA.
 */
function BuildUsageMeter({ sub }: { sub: SubscriptionSummary }) {
  if (sub.dailyBuildLimit === null) {
    return (
      <div className="relative shrink-0 hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
        <div className="text-2xs uppercase tracking-[0.14em] text-text-muted font-semibold">Builds today</div>
        <div className="flex items-center gap-1.5 text-accent-violet">
          <InfinityIcon size={18} />
          <span className="text-sm font-semibold">Unlimited</span>
        </div>
      </div>
    );
  }
  // Trial uses the lifetime cap as the binding number (3 total over
  // the 14-day window), so the meter shows total — not daily — usage.
  const isTrial = sub.isTrial && sub.totalBuildLimit !== null;
  const used = isTrial ? sub.buildsUsedTotal : sub.buildsUsedToday;
  const limit = isTrial ? (sub.totalBuildLimit ?? 0) : sub.dailyBuildLimit;
  const label = isTrial ? "Trial builds" : "Builds today";
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const danger = ratio >= 0.9;
  const warn = ratio >= 0.66 && !danger;
  return (
    <div className="relative shrink-0 hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
      <div className="text-2xs uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="text-sm font-bold font-display tabular-nums text-text-primary">
        {used} <span className="text-text-muted font-normal">/ {limit}</span>
      </div>
      <div className="w-[120px] h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            danger ? "bg-accent-red" : warn ? "bg-accent-amber" : "bg-accent-blue"
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {danger && <div className="text-2xs text-accent-red font-medium">{isTrial ? "Trial almost used up" : "Limit nearly hit"}</div>}
    </div>
  );
}

/* ───────────────────── plan card ───────────────────── */

interface PlanCardProps {
  plan: BillingPlan;
  isCurrent: boolean;
  isLower: boolean;
  /** True when the user has already used their once-per-account trial. */
  trialBlocked: boolean;
  disabled: boolean;
  busy: boolean;
  highlight?: { label: string; tone: "blue" | "violet" };
  onPurchase: () => void;
  onShowDetails: () => void;
}

/** Monthly / Yearly tab toggle for the plan grid. */
function PlanCard({ plan, isCurrent, isLower, trialBlocked, disabled, busy, highlight, onPurchase, onShowDetails }: PlanCardProps) {
  // Trial renders "FREE" instead of "$0" for clarity. The subtitle below
  // tells the user what the trial graduates into so there are no surprises.
  const price = plan.isTrial
    ? "FREE"
    : `$${(plan.amountCents / 100).toFixed(plan.amountCents % 100 === 0 ? 0 : 2)}`;
  const sub = plan.isTrial
    ? "14 days, 3 builds — then $25/mo"
    : plan.tier === "lifetime"
      ? "one-time, future updates included"
      : plan.tier === "1mo"
        ? "per month"
        : "one-time";

  // Tier-specific feature highlights — pulled from the plan catalog so
  // higher tiers always show "Everything in lower tier" + the diff.
  const allFeatures = featureHighlightsFor(plan);
  // Show only the first MAX_VISIBLE_ROWS rows inline; the rest live behind
  // the "Show all features" link so cards keep a consistent height.
  const features = allFeatures.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = Math.max(0, allFeatures.length - features.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      {highlight && (
        <div
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap z-10
            ${highlight.tone === "violet"
              ? "bg-accent-violet text-white shadow-glow-violet"
              : "bg-accent-blue text-white shadow-glow"}`}
        >
          {highlight.label}
        </div>
      )}
      <GlassCard
        className={`p-4 h-full flex flex-col gap-3 transition relative ${
          isCurrent
            ? "border-accent-green/50 shadow-[0_0_0_1px_rgb(16,185,129/0.4)]"
            : highlight?.tone === "violet"
            ? "border-accent-violet/50"
            : highlight?.tone === "blue"
            ? "border-accent-blue/50"
            : ""
        }`}
      >
        <div className="text-2xs uppercase tracking-[0.12em] text-text-muted font-bold">
          {plan.label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight font-display text-text-primary">{price}</span>
          <span className="text-xs text-text-muted">/ {sub}</span>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs text-text-secondary leading-snug">
          {features.map((row, i) => (
            <li key={i} className={`flex gap-1.5 items-start ${row.highlight ? "font-semibold text-text-primary" : ""}`}>
              {row.highlight ? (
                plan.dailyBuildLimit === null && plan.totalBuildLimit === null
                  ? <InfinityIcon size={12} className="text-accent-violet mt-0.5 shrink-0" />
                  : <Hammer size={12} className="text-accent-blue mt-0.5 shrink-0" />
              ) : (
                <Check size={12} className="text-accent-green mt-0.5 shrink-0" />
              )}
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onShowDetails}
            className="text-2xs font-semibold text-accent-blue hover:text-accent-violet inline-flex items-center gap-0.5 transition self-start"
          >
            Show all features <ChevronRight size={11} />
          </button>
        )}
        <div className="mt-auto pt-1">
          {isCurrent ? (
            <Button variant="secondary" className="w-full" disabled>
              <Check size={14} /> Current plan
            </Button>
          ) : isLower ? (
            <Button
              variant="secondary"
              className="w-full whitespace-nowrap"
              disabled
              title="Downgrades aren't supported — your current plan is higher than this one."
            >
              <Lock size={13} /> Locked
            </Button>
          ) : trialBlocked ? (
            <Button
              variant="secondary"
              className="w-full whitespace-nowrap"
              disabled
              title="You've already used your one-time 14-day free trial."
            >
              <Lock size={13} /> Trial used
            </Button>
          ) : plan.isTrial ? (
            <Button
              variant="primary"
              className="w-full whitespace-nowrap"
              onClick={onPurchase}
              disabled={disabled || busy}
              leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            >
              {busy ? "Activating…" : "Start free trial"}
            </Button>
          ) : (
            <Button
              variant={highlight?.tone === "violet" ? "neon" : "primary"}
              className="w-full whitespace-nowrap"
              onClick={onPurchase}
              disabled={disabled || busy}
              leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            >
              {busy ? "Opening…" : "Subscribe"}
            </Button>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

/**
 * Compose the feature highlight rows shown inside a plan card. The first
 * row is always the daily build cap (the headline number), followed by
 * EVERY feature included in the plan (not just the diff from the lower
 * tier). Higher-tier cards therefore stack longer — the grid lets each
 * column grow independently.
 */
function featureHighlightsFor(plan: BillingPlan): Array<{ label: string; highlight?: boolean }> {
  const rows: Array<{ label: string; highlight?: boolean }> = [];

  // Headline: build cap. The trial is gated by a lifetime cap (3 total
  // builds over 14 days), not a daily one — its dailyBuildLimit is null,
  // so formatLimit(null) would misleadingly print "Unlimited builds".
  // Surface the total cap instead.
  if (plan.isTrial && plan.totalBuildLimit !== null) {
    rows.push({
      label: `${plan.totalBuildLimit} builds total (14 days)`,
      highlight: true,
    });
  } else {
    rows.push({ label: formatLimit(plan.dailyBuildLimit), highlight: true });
  }

  // Every feature this tier unlocks, in catalog order so the same items
  // line up visually across cards.
  for (const f of plan.features) {
    rows.push({ label: FEATURE_LABEL_SHORT[f] });
  }

  return rows;
}

/* ───────────────────── setup + trust footer ───────────────────── */

function SetupBanner() {
  return (
    <div className="p-4 rounded-xl border border-accent-yellow/30 bg-accent-yellow/[0.05] flex items-start gap-3">
      <AlertTriangle size={16} className="text-accent-yellow mt-0.5 shrink-0" />
      <div className="text-xs text-text-secondary leading-relaxed">
        <span className="font-semibold text-text-primary">Paddle is not configured.</span>{" "}
        Add <code className="text-accent-yellow font-mono">PADDLE_API_KEY_*</code> and the three{" "}
        <code className="font-mono">PADDLE_PRICE_*_*</code> values to the project's <code className="font-mono">.env</code> file, then restart the app. Purchases stay disabled until then.
      </div>
    </div>
  );
}

/**
 * Show which Paddle environment the next checkout will go to. Driven by
 * the PostHog flag `feature-billing-production` (false → sandbox, true →
 * production). Sandbox mode renders amber so the dev can't miss it; the
 * production banner is hidden once you've stopped flipping the flag, to
 * keep the page clean for end users on a shipped build.
 */
function BillingModeBanner() {
  // Re-render when PostHog flags reload so a flip from sandbox →
  // production is reflected without a page refresh.
  useFeatureFlagsLoadedTick();
  const productionMode = isEnabled("billingProduction");

  if (productionMode) return null; // sandbox is the noteworthy case

  return (
    <div className="p-3 rounded-xl border border-accent-amber/30 bg-accent-amber/[0.06] flex items-start gap-3">
      <AlertTriangle size={14} className="text-accent-amber mt-0.5 shrink-0" />
      <div className="text-xs text-text-secondary leading-relaxed">
        <span className="font-semibold text-text-primary">Sandbox mode.</span>{" "}
        Checkouts use Paddle's test environment — no real money moves. Flip the PostHog flag{" "}
        <code className="font-mono">feature-billing-production</code> to <code className="font-mono">true</code> when you're ready to take live payments.
      </div>
    </div>
  );
}

function TrustFooter() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted pt-2">
      <span className="inline-flex items-center gap-1.5"><Lock size={12} /> Payments processed by Paddle</span>
      <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Card details never touch the app</span>
      <span className="inline-flex items-center gap-1.5"><RefreshCw size={12} /> Cancel anytime during your trial</span>
    </div>
  );
}

/* ───────────────────── plan details modal ───────────────────── */

interface PlanDetailsModalProps {
  plan: BillingPlan | null;
  currentTier: BillingTier;
  currentRank: number;
  /** Mirrors the card-level trialBlocked flag so the modal's CTA stays
   *  consistent — "Trial used" disabled once the user has activated. */
  trialUsed: boolean;
  paddleConfigured: boolean;
  busy: string | null;
  onClose: () => void;
  onPurchase: (plan: BillingPlan) => void;
}

/**
 * Full-feature spotlight modal. Mounted once at the page level; the
 * `plan` prop being non-null is the open signal. Closing animates out via
 * AnimatePresence before unmount.
 *
 * The Subscribe CTA is reused from the card logic — current plan stays
 * disabled with a check, lower-than-current stays locked, and the upgrade
 * path closes the modal before kicking off `onPurchase` so the user sees
 * the Paddle browser tab take focus immediately.
 */
function PlanDetailsModal({
  plan, currentTier, currentRank, trialUsed, paddleConfigured, busy, onClose, onPurchase,
}: PlanDetailsModalProps) {
  // Escape key closes — only registered while a plan is open.
  useEffect(() => {
    if (!plan) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, onClose]);

  return (
    <AnimatePresence>
      {plan && (
        <motion.div
          key="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[280] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 8, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md glass-strong rounded-3xl shadow-elev p-7"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.08] transition"
            >
              <X size={14} />
            </button>

            {/* Header: tier label + price */}
            <div className="text-2xs uppercase tracking-[0.14em] text-text-muted font-bold">
              {plan.label}
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-4xl font-bold tracking-tight font-display text-text-primary">
                {plan.isTrial ? "FREE" : `$${(plan.amountCents / 100).toFixed(plan.amountCents % 100 === 0 ? 0 : 2)}`}
              </span>
              <span className="text-sm text-text-muted">
                {plan.isTrial ? "/ 14 days" : "/ one-time"}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              {plan.isTrial
                ? "14 days of access with a 3-build cap. Upgrade anytime to unlock more features and daily builds."
                : plan.durationDays === null
                ? "Pay once, own it forever. Every future update included."
                : `${plan.durationDays} days of access. Every update during the term included.`}
            </p>

            {/* Full feature list, no truncation */}
            <div className="mt-6 border-t border-border pt-5">
              <div className="text-2xs uppercase tracking-[0.16em] text-accent-violet font-bold mb-3">
                Everything included
              </div>
              <ul className="flex flex-col gap-2 text-sm text-text-secondary leading-relaxed">
                {featureHighlightsFor(plan).map((row, i) => (
                  <li
                    key={i}
                    className={`flex gap-2 items-start ${row.highlight ? "font-semibold text-text-primary" : ""}`}
                  >
                    {row.highlight ? (
                      plan.dailyBuildLimit === null && plan.totalBuildLimit === null
                        ? <InfinityIcon size={14} className="text-accent-violet mt-0.5 shrink-0" />
                        : <Hammer size={14} className="text-accent-blue mt-0.5 shrink-0" />
                    ) : (
                      <Check size={14} className="text-accent-green mt-0.5 shrink-0" />
                    )}
                    <span>{row.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA mirrors the card's state-machine. */}
            <div className="mt-6">
              {plan.tier === currentTier ? (
                <Button variant="secondary" className="w-full" disabled>
                  <Check size={14} /> Current plan
                </Button>
              ) : !plan.isTrial && TIER_RANK[plan.tier] < currentRank ? (
                <Button variant="secondary" className="w-full" disabled title="Downgrades aren't supported">
                  <Lock size={13} /> Lower than your current plan
                </Button>
              ) : plan.isTrial ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => onPurchase(plan)}
                  disabled={busy === plan.key}
                  leftIcon={busy === plan.key ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                >
                  {busy === plan.key ? "Activating trial…" : "Start your 14-day free trial"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => onPurchase(plan)}
                  disabled={!paddleConfigured || busy === plan.key}
                  leftIcon={busy === plan.key ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                >
                  {busy === plan.key ? "Opening Paddle…" : `Subscribe for $${(plan.amountCents / 100).toFixed(plan.amountCents % 100 === 0 ? 0 : 2)}`}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
