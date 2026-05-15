import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { Subscription } from "@paddle/paddle-node-sdk";
import type { BillingTier, SubscriptionState } from "../types";

/**
 * ───────────────────────────────────────────────────────────────────────
 *  PADDLE BILLING SERVICE
 *
 *  Owns the Paddle Node SDK in the main process. The renderer never
 *  imports Paddle — all interactions go through IPC, so the API key
 *  stays in this process.
 *
 *  Flow:
 *    1. Renderer calls billing:createCheckout with a plan key.
 *    2. We look up the user's paddleCustomerId (or create one), build a
 *       Paddle Transaction, and return its `checkout.url`.
 *    3. Main process opens the URL in the user's default browser via
 *       shell.openExternal. The renderer is not involved in payment.
 *    4. After payment, Paddle redirects to web2desktop://billing-success
 *       ?_ptxn=<transaction_id>. main.ts intercepts the deep link and
 *       calls verifyAndApplySession({ sessionId: transaction_id, ... }).
 *    5. We retrieve the transaction from Paddle, walk into its
 *       subscription (when one exists), derive the BillingTier, compute
 *       the new expiresAt, and return the updated SubscriptionState for
 *       the caller to persist.
 *
 *  Plan catalog:
 *    - trial:    14 days, 3 builds total — Paddle "monthly with 14-day
 *                trial" price, recurring. Customer is charged $25/mo
 *                automatically once the trial window ends.
 *    - 1mo:      $25/mo subscription (no trial), recurring.
 *    - lifetime: $100 one-time charge (no recurring).
 *
 *  The trial price MUST be configured in the Paddle dashboard with a
 *  `billingCycle` of 1 month and a `trialPeriod` of 14 days. The plain
 *  monthly price has the same billing cycle but no trial.
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Stable feature keys gated by tier. Used by `requireFeature(key)` in the
 * renderer to redirect to the Billing page when the user's current plan
 * doesn't include the requested feature. Strings must match exactly
 * between main and renderer — keep in sync with `src/lib/featuresByTier.ts`.
 */
export type GatedFeatureKey =
  | "app-studio"
  | "templates"
  | "theme-builder"
  | "action-builder"
  | "ai-assistant"
  | "custom-css-js"
  | "github-publish"
  | "code-signing"
  | "priority-support"
  | "theme-switch"
  | "notifications"
  | "reveal-output";

/** Which pricing tab the plan lives under in the renderer UI. */
export type PricingPeriod = "monthly" | "yearly";

/** Paddle environment the running app is currently transacting against.
 *  Selected at runtime by the PostHog flag `feature-billing-production`
 *  (false → "sandbox", true → "production") and pushed into main via
 *  the `billing:setMode` IPC. Sandbox is the safer default while the
 *  flag is unset / loading. */
export type PaddleMode = "sandbox" | "production";

export const DEFAULT_PADDLE_MODE: PaddleMode = "sandbox";

export interface PlanDefinition {
  tier: BillingTier;
  /** Stable key used by the renderer to request a Checkout session. */
  key: string;
  /** Display label shown in the BillingPage card header. */
  label: string;
  /** Cents — only used for display in the renderer when Paddle is unset. */
  amountCents: number;
  /** Localized currency code (USD by default). */
  currency: string;
  /** Days the term lasts. `null` = lifetime (no expiry). */
  durationDays: number | null;
  /** Rank used for upgrade-only enforcement. Higher = more access. */
  rank: number;
  /** Base env-var name for this plan's Paddle price id. The ACTUAL env
   *  var read at runtime is `${priceEnv}_${MODE}` — e.g.
   *  `PADDLE_PRICE_TRIAL_SANDBOX` or `PADDLE_PRICE_TRIAL_PRODUCTION` —
   *  picked by the active billing mode. Swap prices in `.env` without
   *  rebuilding. */
  priceEnv: string;
  /** Fallback env var names checked when `priceEnv` is unset. Same
   *  `_${MODE}` suffix rule applies. */
  priceEnvAliases?: string[];
  /** Max builds the user can start per 24h-day window. `null` = unlimited. */
  dailyBuildLimit: number | null;
  /** Cumulative build cap for the entire entitlement window. `null` = no
   *  total cap. Used by the trial plan to hard-stop at 3 lifetime builds
   *  regardless of date. */
  totalBuildLimit: number | null;
  /** Feature keys unlocked by this tier. Higher tiers inherit all features
   *  of lower tiers — the source of truth is this array, not inheritance,
   *  so the renderer can just check membership. */
  features: GatedFeatureKey[];
  /** Which pricing tab to surface this plan under. */
  period: PricingPeriod;
  /** Marketing flag — true for the free 14-day trial card so the renderer
   *  knows to swap the Subscribe CTA for "Start free trial". The trial
   *  itself is a Paddle subscription against a price with a built-in
   *  trial period; Paddle auto-charges when the trial ends. */
  isTrial?: boolean;
  /** Whether the underlying Paddle price is recurring. Lifetime is a
   *  one-time charge; trial + monthly are recurring. */
  recurringInterval?: "month" | "year";
}

const TRIAL_FEATURES: GatedFeatureKey[] = [
  "app-studio",
  "templates",
  "action-builder",
];

const MONTHLY_FEATURES: GatedFeatureKey[] = [
  "app-studio",
  "templates",
  "theme-builder",
  "action-builder",
  "ai-assistant",
  "custom-css-js",
  "github-publish",
  "code-signing",
  "theme-switch",
  "notifications",
];

const LIFETIME_FEATURES: GatedFeatureKey[] = [
  ...MONTHLY_FEATURES,
  "priority-support",
  "reveal-output",
];

/**
 * Three tiers, no period tabs. Catalog finalised:
 *   - trial:    14 days, 3 BUILDS TOTAL, action-builder only
 *   - 1mo:      $25/mo, 5 builds/day, all features
 *   - lifetime: $100 one-time, unlimited builds, all features + future updates
 *
 * The deprecated `3mo` / `6mo` / `12mo` tiers stay in the `BillingTier`
 * union for compatibility with persisted entitlement records, but won't
 * appear in Checkout.
 */
export const PLANS: PlanDefinition[] = [
  {
    tier: "trial", key: "trial", label: "Free Trial",
    amountCents: 0, currency: "usd",
    durationDays: 14, rank: 0,
    priceEnv: "PADDLE_PRICE_TRIAL",
    dailyBuildLimit: null,
    totalBuildLimit: 3,
    features: TRIAL_FEATURES,
    period: "monthly",
    isTrial: true,
    recurringInterval: "month",
  },
  {
    tier: "1mo", key: "monthly", label: "Monthly",
    amountCents: 2500, currency: "usd",
    durationDays: 30, rank: 1,
    priceEnv: "PADDLE_PRICE_MONTHLY",
    dailyBuildLimit: 5,
    totalBuildLimit: null,
    features: MONTHLY_FEATURES,
    period: "monthly",
    recurringInterval: "month",
  },
  {
    tier: "lifetime", key: "lifetime", label: "Lifetime",
    amountCents: 10000, currency: "usd",
    durationDays: null, rank: 2,
    priceEnv: "PADDLE_PRICE_LIFETIME",
    dailyBuildLimit: null,
    totalBuildLimit: null,
    features: LIFETIME_FEATURES,
    period: "monthly",
  },
];

/** Tiers that paid but no longer appear in the catalog. We keep their
 *  entitlements alive by mapping them onto the lifetime feature set so
 *  we never strip access from someone who already paid. */
const LEGACY_PAID_TIERS: BillingTier[] = ["3mo", "6mo", "12mo"];

export function dailyBuildLimitFor(tier: BillingTier): number | null {
  if (tier === "free") return 0;
  const plan = planByTier(tier);
  if (plan) return plan.dailyBuildLimit;
  if (LEGACY_PAID_TIERS.includes(tier)) return null;
  return 0;
}

export function totalBuildLimitFor(tier: BillingTier): number | null {
  if (tier === "free") return 0;
  const plan = planByTier(tier);
  if (plan) return plan.totalBuildLimit;
  if (LEGACY_PAID_TIERS.includes(tier)) return null;
  return null;
}

export function featuresFor(tier: BillingTier): GatedFeatureKey[] {
  if (tier === "free") return [];
  const plan = planByTier(tier);
  if (plan) return plan.features;
  if (LEGACY_PAID_TIERS.includes(tier)) return LIFETIME_FEATURES;
  return [];
}

export function planByKey(key: string): PlanDefinition | undefined {
  return PLANS.find((p) => p.key === key);
}

export function planByTier(tier: BillingTier): PlanDefinition | undefined {
  return PLANS.find((p) => p.tier === tier);
}

/**
 * Resolve a plan's Paddle price id for a specific billing mode by
 * walking its primary env name AND each alias, each suffixed with the
 * mode (e.g. `PADDLE_PRICE_TRIAL_SANDBOX`). Returns the first non-empty
 * / non-placeholder value, or `undefined` when nothing's configured.
 */
export function priceIdForPlan(
  plan: PlanDefinition,
  mode: PaddleMode,
): string | undefined {
  const suffix = `_${mode.toUpperCase()}`;
  const candidates = [plan.priceEnv, ...(plan.priceEnvAliases ?? [])];
  for (const name of candidates) {
    const v = process.env[`${name}${suffix}`];
    if (v && !v.includes("replace_me")) return v;
  }
  return undefined;
}

export function planByPriceId(
  priceId: string,
  mode: PaddleMode,
): PlanDefinition | undefined {
  return PLANS.find((p) => priceIdForPlan(p, mode) === priceId);
}

const FREE_RANK = 0;

export function rankFor(tier: BillingTier): number {
  if (tier === "free") return FREE_RANK;
  return planByTier(tier)?.rank ?? FREE_RANK;
}

export function isDowngrade(current: BillingTier, target: BillingTier): boolean {
  return rankFor(target) < rankFor(current);
}

export interface SubscriptionSummary extends SubscriptionState {
  active: boolean;
  planLabel?: string;
  dailyBuildLimit: number | null;
  buildsUsedToday: number;
  buildsRemainingToday: number | null;
  totalBuildLimit: number | null;
  buildsUsedTotal: number;
  buildsRemainingTotal: number | null;
  features: GatedFeatureKey[];
  isTrial: boolean;
  trialUsed: boolean;
}

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function summarize(sub: SubscriptionState | undefined): SubscriptionSummary {
  const tier = sub?.tier ?? "free";
  const dailyBuildLimit = dailyBuildLimitFor(tier);
  const totalBuildLimit = totalBuildLimitFor(tier);
  const features = featuresFor(tier);

  const today = todayKey();
  const buildsUsedToday =
    sub?.buildsToday && sub.buildsToday.date === today ? sub.buildsToday.count : 0;
  const buildsRemainingToday =
    dailyBuildLimit === null ? null : Math.max(0, dailyBuildLimit - buildsUsedToday);

  const buildsUsedTotal = sub?.buildsLifetime ?? 0;
  const buildsRemainingTotal =
    totalBuildLimit === null ? null : Math.max(0, totalBuildLimit - buildsUsedTotal);

  const plan = planByTier(tier);
  const isTrial = !!plan?.isTrial;
  const trialUsed = !!sub?.trialStartedAt;

  const base: SubscriptionSummary = {
    tier,
    paddleCustomerId: sub?.paddleCustomerId,
    paddleTransactionId: sub?.paddleTransactionId,
    paddleSubscriptionId: sub?.paddleSubscriptionId,
    paddleMode: sub?.paddleMode,
    expiresAt: sub?.expiresAt,
    purchasedAt: sub?.purchasedAt,
    trialStartedAt: sub?.trialStartedAt,
    buildsToday: sub?.buildsToday,
    buildsLifetime: sub?.buildsLifetime,
    active: false,
    dailyBuildLimit,
    buildsUsedToday,
    buildsRemainingToday,
    totalBuildLimit,
    buildsUsedTotal,
    buildsRemainingTotal,
    features,
    isTrial,
    trialUsed,
  };
  if (tier === "free") return base;
  if (tier === "lifetime") {
    return { ...base, active: true, planLabel: "Lifetime" };
  }
  const exp = base.expiresAt ? new Date(base.expiresAt).getTime() : 0;
  if (tier === "trial") {
    const withinWindow = exp > Date.now();
    const hasBuildsLeft = totalBuildLimit === null || buildsUsedTotal < totalBuildLimit;
    base.active = withinWindow && hasBuildsLeft;
    base.planLabel = plan?.label ?? "Free Trial";
    return base;
  }
  if (LEGACY_PAID_TIERS.includes(tier)) {
    base.active = exp > Date.now();
    base.planLabel = tier === "3mo" ? "3 Months (legacy)"
                    : tier === "6mo" ? "6 Months (legacy)"
                    : "1 Year (legacy)";
    return base;
  }
  base.active = exp > Date.now();
  base.planLabel = plan?.label;
  return base;
}

export class PaddleService {
  /** Lazy-instantiated Paddle SDK per mode. We cache because every call
   *  goes through the SDK and we don't want to redo HTTP-client setup
   *  on each transaction. */
  private sdkByMode = new Map<PaddleMode, Paddle>();

  /**
   * The mode the renderer most recently told us to use (via
   * `billing:setMode`). Pushed in by the renderer after PostHog
   * resolves the `feature-billing-production` flag. Defaults to
   * sandbox so a slow flag eval can't accidentally route an early
   * checkout through production.
   */
  currentMode: PaddleMode = DEFAULT_PADDLE_MODE;

  /**
   * True when at least one mode has working credentials. Used by the
   * renderer to decide whether to render the "Paddle is not
   * configured" setup banner. Modes are checked individually inside
   * each operation — `configuredFor("production")` reflects whether
   * production specifically has a key.
   */
  get configured(): boolean {
    return this.configuredFor("sandbox") || this.configuredFor("production");
  }

  /** Per-mode configuration check. Used by IPC handlers that need to
   *  know whether a SPECIFIC mode is ready before opening checkout. */
  configuredFor(mode: PaddleMode): boolean {
    const key = process.env[`PADDLE_API_KEY_${mode.toUpperCase()}`];
    return !!key && !key.includes("replace_me");
  }

  /**
   * Resolve the Paddle SDK for a mode, creating + caching it on first
   * use. Throws when the mode's API key isn't configured so the caller
   * gets a useful error message instead of a generic Paddle 401.
   */
  private sdkFor(mode: PaddleMode): Paddle {
    const cached = this.sdkByMode.get(mode);
    if (cached) return cached;
    const key = process.env[`PADDLE_API_KEY_${mode.toUpperCase()}`];
    if (!key || key.includes("replace_me")) {
      throw new Error(
        `Paddle ${mode} mode is not configured. Set PADDLE_API_KEY_${mode.toUpperCase()} in .env and restart the app.`,
      );
    }
    const environment =
      mode === "production" ? Environment.production : Environment.sandbox;
    const sdk = new Paddle(key, { environment });
    this.sdkByMode.set(mode, sdk);
    return sdk;
  }

  /**
   * Update the mode the renderer wants subsequent operations to use.
   * Called from the `billing:setMode` IPC after PostHog resolves the
   * `feature-billing-production` flag. The change takes effect
   * immediately for any operation that doesn't pass an explicit `mode`
   * — checkout-creation persists its mode into the entitlement record
   * so the deep-link verify path is unaffected by a mid-flight flag flip.
   */
  setMode(mode: PaddleMode): void {
    this.currentMode = mode;
  }

  /** Returns the public plan catalog with prices filled in from env for
   *  the requested mode. Defaults to the currently-active mode so
   *  callers that don't care just see what'd happen on their next
   *  Subscribe click. */
  listPlans(
    mode: PaddleMode = this.currentMode,
  ): Array<PlanDefinition & { priceId?: string }> {
    return PLANS.map((p) => ({ ...p, priceId: priceIdForPlan(p, mode) }));
  }

  /**
   * Find or create a Paddle Customer for a given Google `sub` + email.
   * Lookup order:
   *   1. Stored customer id (verified to still exist).
   *   2. Existing customer with the same email address.
   *   3. New customer, tagged with `customData.googleSub` so future
   *      lookups can be cross-referenced from a webhook payload.
   */
  async ensureCustomer(opts: {
    googleSub: string;
    email: string;
    name?: string;
    existingCustomerId?: string;
    mode?: PaddleMode;
  }): Promise<string> {
    const mode = opts.mode ?? this.currentMode;
    const paddle = this.sdkFor(mode);

    if (opts.existingCustomerId) {
      if (await this.verifyCustomerExists(opts.existingCustomerId, mode)) {
        return opts.existingCustomerId;
      }
    }

    // Paddle indexes customers by email (one customer per email per
    // account), so we can look up returning users without storing extra
    // metadata. Iterate the first page only — a result-set wider than
    // one page would mean the same email exists multiple times, which
    // shouldn't happen unless something is very wrong.
    try {
      const collection = paddle.customers.list({ email: [opts.email], perPage: 5 });
      const page = await collection.next();
      const candidate = page.find((c) => c.status === "active");
      if (candidate) return candidate.id;
    } catch {
      // Listing is best-effort; if it fails we just create a new
      // customer below. Worst case: a duplicate, which Paddle will
      // surface as a soft-fail and we'll catch on the next launch.
    }

    const created = await paddle.customers.create({
      email: opts.email,
      name: opts.name,
      customData: { googleSub: opts.googleSub },
    });
    return created.id;
  }

  /**
   * Hit Paddle to check whether the customer record still exists.
   * Returns `false` for genuinely missing or archived customers.
   * Network failures bubble up as `true` so a transient outage doesn't
   * accidentally wipe a legitimate paid plan.
   */
  async verifyCustomerExists(
    customerId: string,
    mode: PaddleMode = this.currentMode,
  ): Promise<boolean> {
    const paddle = this.sdkFor(mode);
    try {
      const c = await paddle.customers.get(customerId);
      if (!c) return false;
      // Archived customers can't transact — treat them as absent.
      if (c.status === "archived") return false;
      return true;
    } catch (e) {
      const err = e as { code?: string; message?: string; status?: number };
      const missing =
        err?.code === "entity_not_found" ||
        err?.status === 404 ||
        /not found|no such/i.test(err?.message ?? "");
      if (missing) return false;
      return true;
    }
  }

  /**
   * Build a Paddle Transaction whose hosted checkout URL the caller
   * (main process) opens via shell.openExternal. Paddle takes care of
   * 3DS, Apple Pay, Google Pay, regional payment methods, etc.
   *
   * Trial + monthly plans use the same recurring-billing pathway — the
   * difference is purely on the price ID's `trialPeriod` configuration
   * inside Paddle. Lifetime plans use a one-time price.
   */
  async createCheckoutSession(opts: {
    planKey: string;
    customerId: string;
    googleSub: string;
    successDeepLink: string;
    cancelDeepLink: string;
    mode?: PaddleMode;
  }): Promise<{ url: string; sessionId: string; mode: PaddleMode }> {
    const mode = opts.mode ?? this.currentMode;
    const paddle = this.sdkFor(mode);
    const plan = planByKey(opts.planKey);
    if (!plan) throw new Error(`Unknown plan: ${opts.planKey}`);
    const priceId = priceIdForPlan(plan, mode);
    if (!priceId) {
      const suffix = `_${mode.toUpperCase()}`;
      const aliasList = [plan.priceEnv, ...(plan.priceEnvAliases ?? [])]
        .map((n) => `${n}${suffix}`)
        .join(" or ");
      throw new Error(
        `Paddle ${mode} price for ${plan.label} is not configured. Set ${aliasList} in .env to your Paddle price id.`,
      );
    }

    // Paddle's hosted checkout uses the seller's Default Payment Link
    // (Settings → Checkout → Default payment link in the Paddle
    // dashboard) as the success/cancel URL. Per-transaction `checkout.url`
    // overrides are also possible but the URL's domain must be
    // pre-approved by Paddle — passing an unapproved URL (or a custom
    // protocol like `web2desktop://`) returns "checkout.url does not
    // contain a domain that has been approved by Paddle".
    //
    // We omit `checkout` here so Paddle uses the Default Payment Link.
    // That link must point at an HTTPS bridge page on an approved domain
    // which then JS-redirects to `web2desktop://billing-success?_ptxn=...`
    // — see landing/billing-success.html. `opts.successDeepLink` is
    // intentionally unused; kept in the signature for backwards-compat
    // and in case Paddle ever permits raw deep-link redirects.
    void opts.successDeepLink;
    void opts.cancelDeepLink;
    const txn = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId: opts.customerId,
      customData: {
        googleSub: opts.googleSub,
        planKey: plan.key,
        tier: plan.tier,
      },
      collectionMode: "automatic",
    });

    const url = txn.checkout?.url;
    if (!url) {
      throw new Error(
        "Paddle didn't return a checkout URL. Verify the Default Payment Link is set in the Paddle dashboard (Settings → Checkout) to your app's success URL.",
      );
    }
    return { url, sessionId: txn.id, mode };
  }

  /**
   * Verify the deep-linked transaction id by fetching it from Paddle.
   * For recurring prices (trial / monthly), we walk into the linked
   * subscription so the entitlement reflects status changes (e.g. a
   * trial that's already converted to active by the time this fires).
   * For one-time prices (lifetime), we check the transaction status
   * directly and grant a no-expiry entitlement.
   */
  async verifyAndApplySession(opts: {
    /** Paddle transaction id (the `_ptxn` query param). */
    sessionId: string;
    googleSub: string;
    previous?: SubscriptionState;
    /** Mode the checkout was opened in. Persisted into
     *  settings.subscription.paddleMode at create time, so this is the
     *  authoritative value even if the renderer's flag flipped while
     *  the user was in Paddle's hosted checkout. */
    mode?: PaddleMode;
  }): Promise<SubscriptionState> {
    const mode = opts.mode ?? this.currentMode;
    const paddle = this.sdkFor(mode);
    const txn = await paddle.transactions.get(opts.sessionId);

    const customDataSub =
      txn.customData && typeof (txn.customData as Record<string, unknown>).googleSub === "string"
        ? ((txn.customData as Record<string, unknown>).googleSub as string)
        : undefined;
    if (customDataSub && customDataSub !== opts.googleSub) {
      throw new Error("Checkout was created for a different account.");
    }

    const priceId = txn.items[0]?.price?.id;
    const plan = priceId ? planByPriceId(priceId, mode) : undefined;
    if (!plan) {
      throw new Error("Couldn't identify the plan tier from the paid transaction.");
    }

    const customerId = txn.customerId ?? undefined;

    // Subscription-mode (trial / monthly recurring). Walk into the
    // subscription so a converted-from-trial customer reads as "1mo"
    // active rather than "trial".
    if (txn.subscriptionId) {
      const sub = await paddle.subscriptions.get(txn.subscriptionId);
      return this.deriveStateFromSubscription({
        subscription: sub,
        transactionId: txn.id,
        plan,
        previous: opts.previous,
        mode,
      });
    }

    // One-time payment (lifetime). Paddle marks paid one-off
    // transactions as "completed"; "billed" / "paid" are intermediate
    // states that shouldn't reach the success deep-link, but we accept
    // them too so a fast deep-link doesn't race the webhook.
    const okStatuses = new Set(["completed", "paid", "billed"]);
    if (!okStatuses.has(txn.status)) {
      throw new Error(`Transaction is not paid yet (status: ${txn.status}).`);
    }

    // Reject downgrades — if the user already holds a higher-rank plan,
    // we record the customer id but keep the entitlement where it is.
    const prev = opts.previous;
    if (prev && isDowngrade(prev.tier, plan.tier)) {
      throw new Error(
        `You already have a ${prev.tier} subscription, which is higher than ${plan.tier}. Downgrades aren't supported.`,
      );
    }

    // Lifetime supersedes any recurring billing the customer is on
    // (typical case: was on Monthly, upgraded to Lifetime — Paddle
    // would otherwise keep charging them every month). Schedule cancel
    // at the next billing period so the user keeps what they already
    // paid for through the current cycle.
    if (plan.tier === "lifetime" && customerId) {
      await this.cancelRecurringForCustomer(customerId, mode);
    }

    const now = new Date();
    const expiresAt =
      plan.durationDays === null
        ? undefined
        : new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

    return {
      tier: plan.tier,
      paddleTransactionId: txn.id,
      paddleCustomerId: customerId,
      paddleSubscriptionId: undefined,
      paddleMode: mode,
      expiresAt,
      purchasedAt: now.toISOString(),
      trialStartedAt: prev?.trialStartedAt,
    };
  }

  /**
   * Project a Paddle Subscription onto our local SubscriptionState.
   * Status drives the tier: "trialing" → tier="trial", "active" /
   * "past_due" → the plan's underlying paid tier, anything else → free.
   * Used by both the post-checkout verification and the periodic
   * refresh.
   */
  private deriveStateFromSubscription(opts: {
    subscription: Subscription;
    transactionId?: string;
    plan: PlanDefinition;
    previous?: SubscriptionState;
    mode: PaddleMode;
  }): SubscriptionState {
    const { subscription, plan, mode } = opts;
    const customerId = subscription.customerId;
    const status = subscription.status;
    const periodEnd = subscription.currentBillingPeriod?.endsAt ?? undefined;

    if (status === "trialing") {
      return {
        tier: "trial",
        paddleTransactionId: opts.transactionId,
        paddleCustomerId: customerId,
        paddleSubscriptionId: subscription.id,
        paddleMode: mode,
        expiresAt: periodEnd,
        purchasedAt: new Date().toISOString(),
        trialStartedAt: opts.previous?.trialStartedAt ?? new Date().toISOString(),
      };
    }

    if (status === "active" || status === "past_due") {
      // Trial price + active status = the trial converted; surface the
      // post-trial tier (typically "1mo") so the renderer stops calling
      // the user a trialer.
      const effectiveTier: BillingTier = plan.isTrial ? "1mo" : plan.tier;
      return {
        tier: effectiveTier,
        paddleTransactionId: opts.transactionId,
        paddleCustomerId: customerId,
        paddleSubscriptionId: subscription.id,
        paddleMode: mode,
        expiresAt: periodEnd,
        purchasedAt: new Date().toISOString(),
        trialStartedAt: opts.previous?.trialStartedAt,
      };
    }

    // canceled / paused — entitlement lapses.
    return {
      tier: "free",
      paddleCustomerId: customerId,
      paddleMode: mode,
      trialStartedAt: opts.previous?.trialStartedAt,
    };
  }

  /**
   * Schedule cancel-at-next-billing-period for every still-active
   * recurring subscription on a customer. Best-effort: logs nothing and
   * swallows individual failures so a partial sweep still finishes.
   */
  private async cancelRecurringForCustomer(
    customerId: string,
    mode: PaddleMode = this.currentMode,
  ): Promise<void> {
    const paddle = this.sdkFor(mode);
    try {
      const collection = paddle.subscriptions.list({
        customerId: [customerId],
        status: ["active", "trialing", "past_due"],
        perPage: 20,
      });
      for await (const sub of collection) {
        if (sub.scheduledChange?.action === "cancel") continue;
        try {
          await paddle.subscriptions.cancel(sub.id, { effectiveFrom: "next_billing_period" });
        } catch {
          /* per-sub failure is non-fatal */
        }
      }
    } catch {
      /* listing failure is non-fatal too — entitlement still applies */
    }
  }

  /**
   * Re-pull the latest customer state from Paddle and reconcile with
   * the local entitlement. Used by the BillingPage's "Refresh" button
   * and on app startup to catch out-of-band changes (a payment made
   * from another device, a manual cancel from the dashboard, etc.).
   *
   * Reconciliation is "highest rank wins": we collect every
   * entitlement-bearing object on the customer (recurring subs +
   * completed one-off transactions), then return the one with the
   * highest plan rank. This protects upgrades from being clobbered —
   * e.g. an old still-active Monthly subscription would otherwise
   * overwrite a freshly-purchased Lifetime entitlement.
   */
  async refreshFromPaddle(opts: {
    customerId: string;
    previous?: SubscriptionState;
    /** Which Paddle environment the customerId belongs to. Defaults to
     *  the previous entitlement's stored mode if available, then the
     *  service's current mode. */
    mode?: PaddleMode;
  }): Promise<SubscriptionState | null> {
    const mode = opts.mode ?? opts.previous?.paddleMode ?? this.currentMode;
    const paddle = this.sdkFor(mode);
    const candidates: SubscriptionState[] = [];

    try {
      const subs = paddle.subscriptions.list({
        customerId: [opts.customerId],
        status: ["active", "trialing", "past_due"],
        perPage: 20,
      });
      for await (const sub of subs) {
        const priceId = sub.items[0]?.price?.id;
        const plan = priceId ? planByPriceId(priceId, mode) : undefined;
        if (!plan) continue;
        candidates.push(
          this.deriveStateFromSubscription({
            subscription: sub,
            plan,
            previous: opts.previous,
            mode,
          }),
        );
      }
    } catch {
      // Tolerate listing failures — fall through to transactions.
    }

    try {
      const txns = paddle.transactions.list({
        customerId: [opts.customerId],
        status: ["completed", "paid", "billed"],
        perPage: 20,
      });
      for await (const txn of txns) {
        // Skip transactions tied to a subscription — those are already
        // represented in `candidates` via the sub itself, and we want
        // the sub's status (trialing/active/canceled) to drive the
        // tier. The remaining transactions are the one-time payments
        // (lifetime).
        if (txn.subscriptionId) continue;
        const priceId = txn.items[0]?.price?.id;
        const plan = priceId ? planByPriceId(priceId, mode) : undefined;
        if (!plan) continue;
        const purchasedAt = txn.billedAt
          ? new Date(txn.billedAt)
          : new Date(txn.createdAt);
        const expiresAt =
          plan.durationDays === null
            ? undefined
            : new Date(purchasedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();
        candidates.push({
          tier: plan.tier,
          paddleTransactionId: txn.id,
          paddleCustomerId: opts.customerId,
          paddleSubscriptionId: undefined,
          paddleMode: mode,
          expiresAt,
          purchasedAt: purchasedAt.toISOString(),
          trialStartedAt: opts.previous?.trialStartedAt,
        });
      }
    } catch {
      // Same — best-effort.
    }

    if (candidates.length === 0) return opts.previous ?? null;

    candidates.sort((a, b) => {
      const rankDiff = rankFor(b.tier) - rankFor(a.tier);
      if (rankDiff !== 0) return rankDiff;
      const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return bExp - aExp;
    });

    return candidates[0];
  }
}
