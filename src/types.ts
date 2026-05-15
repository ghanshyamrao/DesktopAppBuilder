export type BuildStatus = "idle" | "queued" | "building" | "success" | "error" | "cancelled";

export type Platform = "win" | "mac" | "linux";

export interface WindowSettings {
  width: number;
  height: number;
  resizable: boolean;
  fullscreen: boolean;
  centerOnLaunch: boolean;
  rememberState: boolean;
}

export interface SecuritySettings {
  contextIsolation: boolean;
  nodeIntegration: boolean;
  disableContextMenu: boolean;
  enableDevToolsInProduction: boolean;
  customUserAgent?: string;
}

/* ---------- Native action / capability flags per project ---------- */

export interface GlobalShortcut {
  /** Electron accelerator string, e.g. "CmdOrCtrl+Shift+Y". */
  accelerator: string;
  /** Built-in action: "show", "hide", "toggle", "reload", "home", "togglePin". */
  action: "show" | "hide" | "toggle" | "reload" | "home" | "togglePin";
}

export interface ActionsConfig {
  /** Show a tray icon with a context menu. */
  tray: boolean;
  /** Hide window to tray on close instead of quitting. */
  minimizeToTray: boolean;
  /** Single-instance lock — second launch focuses existing window. */
  singleInstance: boolean;
  /** Launch the app on system startup. */
  startupLaunch: boolean;
  /** Show the standard application menu / accelerators. */
  applicationMenu: boolean;
  /** Allow OS notifications from the page. */
  notifications: boolean;
  /** Open with the window pinned above all others. Toggleable at runtime
   *  via the tray menu or a "togglePin" global shortcut. */
  alwaysOnTop?: boolean;
  /** Externalize OAuth navigation to the system browser, then deep-link
   *  the callback back into the app. Requires deepLinkProtocol to be set
   *  and the OAuth provider to allow `<protocol>://callback` as a redirect URI. */
  oauthExternal?: boolean;
  /** Custom protocol handler — opens links like myapp://… in this window. */
  deepLinkProtocol?: string;
  /** Cross-app keyboard shortcuts that work even when window is hidden. */
  globalShortcuts: GlobalShortcut[];
}

export interface BuildRecord {
  id: string;
  projectId: string;
  status: BuildStatus;
  startedAt: string;
  finishedAt?: string;
  outputPath?: string;
  error?: string;
}

export interface AppProject {
  id: string;
  name: string;
  url: string;
  description?: string;
  iconPath?: string;
  /** Google `sub` of the user that owns this project. Stamped by the
   *  main-process ProjectStore at creation time and used to scope every
   *  list/get/update call to the signed-in user. */
  ownerSub?: string;
  /** Project kind. Defaults to "wrapper" when missing. */
  kind?: "wrapper" | "starter";
  /** Starter template id when kind="starter". */
  starterId?: string;
  /** When set, template generator writes these files directly. Used by
   *  Studio Builder for scene-compiled projects. */
  sceneFiles?: Record<string, string>;
  window: WindowSettings;
  security: SecuritySettings;
  /** Native capabilities (tray, shortcuts, deep linking, etc). Optional for backwards compat. */
  actions?: ActionsConfig;
  /** Optional per-project theme — falls back to global default if omitted. */
  theme?: import("./lib/themes/types").Theme | null;
  /** User-authored CSS injected into the wrapped page after dom-ready. */
  customCss?: string;
  /** User-authored JS injected into the wrapped page after dom-ready
   *  (wrapped in IIFE + try/catch so it can't crash the host). */
  customJs?: string;
  /** electron-updater feed URL — directory hosting latest.yml + artifacts. */
  updateFeedUrl?: string;
  /** GitHub repo in `owner/repo` form for the publish action. */
  githubRepo?: string;
  platforms: Platform[];
  createdAt: string;
  updatedAt: string;
  /** Mirror of `builds[0]`. Kept for back-compat with UI code that only
   *  reads the latest build. */
  lastBuild?: BuildRecord;
  /** Rolling build history, newest first. Capped at 20. */
  builds?: BuildRecord[];
}

export interface BuildLogEvent {
  buildId: string;
  projectId: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  timestamp: string;
}

export interface BuildProgressEvent {
  buildId: string;
  projectId: string;
  status: BuildStatus;
  step: number;
  totalSteps: number;
  stepLabel: string;
  percent: number;
}

export interface SigningSettings {
  pfxPath: string;
  password: string;
}

export interface ProfileSettings {
  name?: string;
  avatarUrl?: string;
  plan?: string;
}

export interface GlobalSettings {
  defaultWindow: WindowSettings;
  defaultSecurity: SecuritySettings;
  defaultTheme?: import("./lib/themes/types").Theme | null;
  /** Plugin marketplace — set of installed plugin ids. */
  installedPlugins?: string[];
  /** Anthropic API key for the AI Assistant. Stored in user data. */
  aiApiKey?: string;
  /** GitHub personal access token used by the publish action (needs `repo` scope). */
  githubToken?: string;
  /** Per-machine code-signing config applied to Windows builds. */
  signing?: SigningSettings;
  /** Cosmetic profile (name + avatar) for the sidebar / greetings. */
  profile?: ProfileSettings;
  /** Builder-app UI theme. Independent of `defaultTheme` (which is for
   *  the user's GENERATED apps, not WebToDesktop Builder itself). */
  appearance?: AppearanceSettings;
}

export interface AppearanceSettings {
  mode: "light" | "dark" | "custom";
  customAccent: string;
}

export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/* ---------- AI Assistant ---------- */
export interface AIProjectDraft {
  /** Reasoning shown to the user. */
  rationale: string;
  /** The proposed project values — caller fills the rest from defaults. */
  draft: {
    name: string;
    url: string;
    description?: string;
    window?: Partial<WindowSettings>;
    security?: Partial<SecuritySettings>;
    actions?: Partial<ActionsConfig>;
    customCss?: string;
    customJs?: string;
    suggestedThemeId?: string;
  };
}

export interface AIChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AIProjectSummary {
  id: string;
  name: string;
  url: string;
  themeId?: string;
  hasIcon: boolean;
}

export interface AIChatContext {
  projects: AIProjectSummary[];
  route: string;
  currentDraft?: AIProjectDraft["draft"] | null;
}

export type AIAction =
  | { kind: "apply_draft"; label: string }
  | { kind: "open_route"; label: string; route: "dashboard" | "studio" | "themes" | "actions" | "plugins" | "ai" | "settings" | "wizard" | "build" | "deploy" | "recipes"; projectId?: string }
  | { kind: "set_theme"; label: string; themeId: string; projectId?: string }
  | { kind: "fetch_favicon"; label: string; url: string }
  | { kind: "build"; label: string; projectId: string }
  | { kind: "patch_project"; label: string; projectId: string; patch: Partial<Pick<AppProject, "name" | "url" | "description" | "window" | "security" | "actions">> }
  | { kind: "apply_recipe"; label: string; recipeId: string; projectId: string };

export interface AIChatResponse {
  message: string;
  draft?: AIProjectDraft | null;
  actions?: AIAction[];
}

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

/* ---------- Billing (Stripe) ---------- */

export type BillingTier = "free" | "trial" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";

/** Pricing tabs in the BillingPage UI. */
export type PricingPeriod = "monthly" | "yearly";

/** Stable feature keys gated by tier. Mirror of GatedFeatureKey in
 *  electron/services/stripeService.ts — keep in sync. */
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

export interface BillingPlan {
  tier: BillingTier;
  key: string;
  label: string;
  amountCents: number;
  currency: string;
  /** Days the term lasts. `null` for lifetime. */
  durationDays: number | null;
  /** Rank for upgrade-only enforcement. Higher = more access. */
  rank: number;
  /** Name of the env var that must hold the Stripe price id. */
  priceEnv: string;
  /** Populated by the main process when the corresponding env var is set. */
  priceId?: string;
  /** Builds the user can start per 24h. `null` = unlimited. */
  dailyBuildLimit: number | null;
  /** Cumulative build cap (trial-only). `null` = no lifetime cap. */
  totalBuildLimit: number | null;
  /** Feature keys unlocked by this tier. */
  features: GatedFeatureKey[];
  /** Which pricing tab to surface this plan under. */
  period: PricingPeriod;
  /** True for the free-trial card so the renderer swaps in a "Start free
   *  trial" CTA instead of "Subscribe". */
  isTrial?: boolean;
  /** When set, Checkout uses subscription mode (Stripe-managed recurring
   *  billing) instead of one-time payment mode. */
  recurringInterval?: "month" | "year";
}

export interface BuildsTodayCounter {
  date: string;
  count: number;
}

export interface SubscriptionSummary {
  tier: BillingTier;
  /** True when paid and (for term plans) not expired. */
  active: boolean;
  /** Set only on `billing:status` — reflects whether main has a Paddle key. */
  configured?: boolean;
  /** Humanized label for the current paid tier, e.g. "Monthly". */
  planLabel?: string;
  /** ISO. Undefined for free and lifetime. */
  expiresAt?: string;
  purchasedAt?: string;
  paddleCustomerId?: string;
  paddleTransactionId?: string;
  paddleSubscriptionId?: string;
  /** Which Paddle environment the IDs above belong to. */
  paddleMode?: "sandbox" | "production";
  trialStartedAt?: string;
  buildsToday?: BuildsTodayCounter;
  buildsLifetime?: number;
  /** Daily build cap. `null` = unlimited, `0` = none (free). */
  dailyBuildLimit: number | null;
  /** Builds started today (resets at local midnight). */
  buildsUsedToday: number;
  /** `dailyBuildLimit - buildsUsedToday`, or null when unlimited. */
  buildsRemainingToday: number | null;
  /** Cumulative build cap (trial only). `null` = uncapped. */
  totalBuildLimit: number | null;
  /** Builds used over the entire entitlement window. */
  buildsUsedTotal: number;
  /** `totalBuildLimit - buildsUsedTotal`, or null when uncapped. */
  buildsRemainingTotal: number | null;
  /** Feature keys the current tier unlocks. */
  features: GatedFeatureKey[];
  /** True for the trial tier (drives "Free Trial" badge etc.). */
  isTrial: boolean;
  /** True once the user has ever started a trial. */
  trialUsed: boolean;
}

export interface BuildRecordResult {
  allowed: boolean;
  reason: "ok" | "no-subscription" | "daily-limit-exceeded" | "trial-exhausted";
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface W2AApi {
  projects: {
    list: () => Promise<IpcResult<AppProject[]>>;
    get: (id: string) => Promise<IpcResult<AppProject>>;
    create: (project: Omit<AppProject, "id" | "createdAt" | "updatedAt">) => Promise<IpcResult<AppProject>>;
    update: (id: string, patch: Partial<AppProject>) => Promise<IpcResult<AppProject>>;
    delete: (id: string) => Promise<IpcResult<void>>;
    clone: (id: string) => Promise<IpcResult<{ project: AppProject }>>;
    getIconDataUrl: (id: string) => Promise<IpcResult<string | null>>;
    export: (id: string) => Promise<IpcResult<{ cancelled: boolean; filePath?: string }>>;
    exportSource: (id: string) => Promise<IpcResult<{ cancelled: boolean; destDir?: string }>>;
    import: (filePath?: string) => Promise<IpcResult<{ cancelled: boolean; project?: AppProject }>>;
  };
  builds: {
    start: (projectId: string) => Promise<IpcResult<{ buildId: string }>>;
    cancel: (buildId: string) => Promise<IpcResult<void>>;
    revealOutput: (projectId: string) => Promise<IpcResult<void>>;
    getLogs: (projectId: string) => Promise<IpcResult<BuildLogEvent[]>>;
    export: (
      projectId: string,
      destDir?: string,
    ) => Promise<IpcResult<{ cancelled: boolean; destDir?: string; files?: string[] }>>;
  };
  settings: {
    get: () => Promise<IpcResult<GlobalSettings>>;
    update: (patch: Partial<GlobalSettings>) => Promise<IpcResult<GlobalSettings>>;
  };
  dialog: {
    pickIcon: () => Promise<IpcResult<{ path: string; dataUrl: string } | null>>;
    fetchFavicon: (url: string) => Promise<IpcResult<{ path: string; dataUrl: string } | null>>;
    saveIconDataUrl: (dataUrl: string, hint: string) => Promise<IpcResult<{ path: string; dataUrl: string }>>;
    pickOutputDir: () => Promise<IpcResult<string | null>>;
    pickPfx: () => Promise<IpcResult<{ path: string } | null>>;
  };
  publish: {
    github: (projectId: string) => Promise<IpcResult<{ url: string; htmlUrl: string; tag: string; uploaded: string[] }>>;
  };
  system: {
    openSettings: (key: "developers") => Promise<IpcResult<void>>;
    checkSymlinkPrivilege: () => Promise<
      IpcResult<{
        canCreateSymlinks: boolean;
        developerMode: boolean;
        elevated: boolean;
        notApplicable: boolean;
        detail: string;
      }>
    >;
    openNetworkSettings: () => Promise<IpcResult<void>>;
  };
  auth: {
    status: () => Promise<IpcResult<{ configured: boolean; user: AuthUser | null }>>;
    signIn: () => Promise<IpcResult<AuthUser>>;
    signOut: () => Promise<IpcResult<void>>;
  };
  billing: {
    listPlans: () => Promise<IpcResult<BillingPlan[]>>;
    status: () => Promise<IpcResult<SubscriptionSummary>>;
    setMode: (mode: "sandbox" | "production") =>
      Promise<IpcResult<{ mode: "sandbox" | "production" }>>;
    openCheckout: (planKey: string) =>
      Promise<IpcResult<{ url: string; sessionId: string; mode: "sandbox" | "production" }>>;
    applySession: (sessionId: string) => Promise<IpcResult<SubscriptionSummary>>;
    refresh: () => Promise<IpcResult<SubscriptionSummary>>;
    recordBuild: () => Promise<IpcResult<BuildRecordResult>>;
    onState: (cb: (state: SubscriptionSummary) => void) => () => void;
    onApplyFailed: (cb: (info: { reason: string }) => void) => () => void;
    onCancelled: (cb: () => void) => () => void;
  };
  firstRun: {
    status: () => Promise<IpcResult<{ showWelcome: boolean; installedAt: string }>>;
    acknowledge: () => Promise<IpcResult<void>>;
  };
  ai: {
    /** One-shot project blueprint from a single sentence — kept for the
     *  legacy "Generate" button flow. */
    generateProject: (prompt: string) => Promise<IpcResult<AIProjectDraft>>;
    /** Multi-turn conversational entry point. The renderer maintains the
     *  history and passes it on every call along with project context. */
    chat: (
      messages: AIChatMessage[],
      context: AIChatContext,
    ) => Promise<IpcResult<AIChatResponse>>;
    hasApiKey: () => Promise<IpcResult<boolean>>;
  };
  events: {
    onBuildLog: (cb: (event: BuildLogEvent) => void) => () => void;
    onBuildProgress: (cb: (event: BuildProgressEvent) => void) => () => void;
  };
  window: {
    minimize: () => Promise<IpcResult<void>>;
    toggleMaximize: () => Promise<IpcResult<{ maximized: boolean }>>;
    close: () => Promise<IpcResult<void>>;
    isMaximized: () => Promise<IpcResult<{ maximized: boolean }>>;
    reload: () => Promise<IpcResult<void>>;
    toggleDevTools: () => Promise<IpcResult<void>>;
    setTitleBarOverlay: (color: string, symbolColor: string) => Promise<IpcResult<void>>;
    onStateChange: (cb: (state: { maximized: boolean }) => void) => () => void;
  };
}

declare global {
  interface Window {
    w2a: W2AApi;
  }
}
