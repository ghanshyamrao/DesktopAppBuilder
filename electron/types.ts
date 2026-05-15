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

export interface GlobalShortcut {
  accelerator: string;
  action: "show" | "hide" | "toggle" | "reload" | "home" | "togglePin";
}

export interface ActionsConfig {
  tray: boolean;
  minimizeToTray: boolean;
  singleInstance: boolean;
  startupLaunch: boolean;
  applicationMenu: boolean;
  notifications: boolean;
  /** Open with the window pinned above all others. Toggleable via the
   *  tray menu / a "togglePin" global shortcut at runtime. */
  alwaysOnTop?: boolean;
  /** When true AND deepLinkProtocol is set, OAuth navigations are routed
   *  to the user's default browser via shell.openExternal. The OAuth
   *  provider must be configured to redirect to `<protocol>://callback?…`
   *  — the OS then routes that URL back to the wrapped app, which maps
   *  it onto the original origin and reloads the webview to complete
   *  sign-in. Useful for first-party apps you control end-to-end. */
  oauthExternal?: boolean;
  deepLinkProtocol?: string;
  globalShortcuts: GlobalShortcut[];
}

export interface AIProjectDraft {
  rationale: string;
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

/** A single turn in the AI chat — sent both ways to keep history. */
export interface AIChatMessage {
  role: "user" | "assistant";
  text: string;
}

/** Light snapshot of project state, fed to the model so it can reason
 *  about the user's existing apps without us shipping their full data. */
export interface AIProjectSummary {
  id: string;
  name: string;
  url: string;
  themeId?: string;
  hasIcon: boolean;
}

export interface AIChatContext {
  projects: AIProjectSummary[];
  /** Current renderer route — name only, e.g. "dashboard", "studio", "ai". */
  route: string;
  /** The draft the user is currently iterating on, if any. */
  currentDraft?: AIProjectDraft["draft"] | null;
}

/** Discriminated union of the actions the model can suggest. The renderer
 *  is responsible for executing these via existing api.* methods. */
export type AIAction =
  | { kind: "apply_draft"; label: string }
  | { kind: "open_route"; label: string; route: "dashboard" | "studio" | "themes" | "actions" | "plugins" | "ai" | "settings" | "wizard" | "build" | "deploy" | "recipes"; projectId?: string }
  | { kind: "set_theme"; label: string; themeId: string; projectId?: string }
  | { kind: "fetch_favicon"; label: string; url: string }
  | { kind: "build"; label: string; projectId: string }
  | { kind: "patch_project"; label: string; projectId: string; patch: Partial<Pick<AppProject, "name" | "url" | "description" | "window" | "security" | "actions">> }
  | { kind: "apply_recipe"; label: string; recipeId: string; projectId: string };

export interface AIChatResponse {
  /** Natural-language reply shown above the action chips. */
  message: string;
  /** Optional updated/new draft. If present, an apply_draft action usually
   *  accompanies it. */
  draft?: AIProjectDraft | null;
  /** Suggested actions the user can click to execute. */
  actions?: AIAction[];
}

export interface FeatureSettings {
  applicationMenu: boolean;
  systemTray: boolean;
  singleInstance: boolean;
  minimizeToTray: boolean;
}

export interface AppProject {
  id: string;
  name: string;
  url: string;
  description?: string;
  iconPath?: string;
  /** Kind of project. "wrapper" (default) loads `url` in a chrome-wrapped
   *  WebContentsView. "starter" is a full Electron source project copied
   *  from a starter template — the URL field is unused (set to "app://local"
   *  for schema satisfaction) and the build pipeline ships the starter's
   *  main.js / index.html as-is. Optional + back-compat: missing values
   *  are treated as "wrapper". */
  kind?: "wrapper" | "starter";
  /** When kind="starter", the id of the starter template that seeded this
   *  project. Used by the template generator to know which directory to
   *  copy from (templates/starters/<starterId>/). */
  starterId?: string;
  /** When set, the template generator writes these files directly to the
   *  workspace instead of copying from a starter directory. Used by the
   *  Studio Builder when the user compiles a scene with custom slot
   *  values — the compiled HTML/JS/CSS is captured here so the project
   *  re-materializes identically on every rebuild. Map keys are relative
   *  paths (e.g. "main.js", "index.html", "package.json"). */
  sceneFiles?: Record<string, string>;
  window: WindowSettings;
  security: SecuritySettings;
  actions?: ActionsConfig;
  theme?: Theme | null;
  /** User-authored CSS injected into the wrapped page after dom-ready.
   *  Empty/undefined → no injection. Lives in workspace as userStyles.css. */
  customCss?: string;
  /** User-authored JS injected into the wrapped page after dom-ready.
   *  Empty/undefined → no injection. Wrapped in an IIFE + try/catch so
   *  a syntax error in user code can't take down the whole app. */
  customJs?: string;
  /** electron-updater feed URL — points at a directory hosting `latest.yml`
   *  + the actual installer artifacts. Generated app calls
   *  `autoUpdater.setFeedURL` and `checkForUpdatesAndNotify` on launch +
   *  every 4h when set. Empty → no update check at runtime. */
  updateFeedUrl?: string;
  /** GitHub repo in `owner/repo` form. Used by the publish action to push
   *  built artifacts to a draft release. Token comes from GlobalSettings. */
  githubRepo?: string;
  platforms: Platform[];
  createdAt: string;
  updatedAt: string;
  /** Mirror of `builds[0]`. Kept for back-compat with code that only reads
   *  the latest build. The source of truth is `builds`. */
  lastBuild?: BuildRecord;
  /** Rolling history of recent builds, newest first. Capped at 20. Older
   *  project.json files without this field are migrated on load by seeding
   *  it from `lastBuild`. */
  builds?: BuildRecord[];
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

export interface ThemeColors {
  bg: string;
  surface: string;
  titlebar: string;
  accent: string;
  accent2: string;
  text: string;
  textMuted: string;
  border: string;
  lights: { close: string; min: string; max: string };
}

export interface Theme {
  id: string;
  name: string;
  tagline?: string;
  windowFrame: "macos" | "windows11" | "unified" | "frameless";
  sidebar: "rail" | "wide" | "floating" | "hidden";
  background: "solid" | "gradient" | "mesh" | "image";
  density: "compact" | "comfortable" | "spacious";
  animation: "smooth" | "snappy" | "bouncy" | "none";
  colors: ThemeColors;
  radius: number;
  glass: number;
  shadow: number;
  titleBarHeight: number;
  font?: string;
}

/** Cosmetic profile shown in the sidebar + dashboard greeting. Stored
 *  locally only — no auth, no third-party. A real OAuth flow can layer on
 *  top later by writing the same shape from the auth callback. */
export interface ProfileSettings {
  name?: string;
  avatarUrl?: string;
  /** Free-form plan label shown under the name (e.g. "Pro plan"). */
  plan?: string;
}

export interface SigningSettings {
  /** Absolute path to a `.pfx` certificate. Empty → signing skipped. */
  pfxPath: string;
  /** Plaintext password for the .pfx. Stored as-is in settings.json — same
   *  threat model as aiApiKey. Empty for unprotected certs. */
  password: string;
}

/** Stripe billing tier the user is currently entitled to. Tier ranks are
 *  used to enforce upgrade-only logic — users can never move to a tier
 *  with a lower rank than their current one. Lifetime is the cap. */
export type BillingTier = "free" | "trial" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";

/** Rolling daily build counter. `date` is YYYY-MM-DD in local time; when
 *  the user's wall-clock day rolls over, the counter resets to 0. */
export interface BuildsTodayCounter {
  date: string;
  count: number;
}

export interface SubscriptionState {
  /** Current tier the user has paid for. "free" = no paid subscription. */
  tier: BillingTier;
  /** Latest Paddle Transaction id that resulted in this entitlement.
   *  Used by the deep-link handler to verify a fresh purchase + by the
   *  refresher to skip transactions we've already applied. */
  paddleTransactionId?: string;
  /** Paddle customer record we created/linked for this signed-in Google
   *  user. Kept so repeat purchases attach to the same Customer record. */
  paddleCustomerId?: string;
  /** Paddle subscription id for trial / monthly entitlements. Lifetime
   *  has no subscription (one-time payment). Stored so we can cancel
   *  / inspect from the management UI later. */
  paddleSubscriptionId?: string;
  /** Which Paddle environment ("sandbox" / "production") the IDs above
   *  belong to. Persisted at checkout-creation time so the deep-link
   *  verify path always queries the right environment, even if the
   *  PostHog `feature-billing-production` flag flipped while the user
   *  was completing checkout in the browser. */
  paddleMode?: "sandbox" | "production";
  /** ISO timestamp when the current term expires. Undefined for "free"
   *  and "lifetime" (lifetime never expires). */
  expiresAt?: string;
  /** ISO timestamp the most recent term was activated. */
  purchasedAt?: string;
  /** First time the user's free trial started. Set once, never reset.
   *  Used to prevent trial-replay — once present, the "Start free trial"
   *  CTA stays disabled even after the trial expires. */
  trialStartedAt?: string;
  /** Rolling counter for daily build-limit enforcement. */
  buildsToday?: BuildsTodayCounter;
  /** Cumulative build count, never resets. Used by the trial tier to
   *  enforce a hard "3 builds total" cap regardless of the day. */
  buildsLifetime?: number;
}

export interface GlobalSettings {
  defaultWindow: WindowSettings;
  defaultSecurity: SecuritySettings;
  defaultTheme?: Theme | null;
  installedPlugins?: string[];
  aiApiKey?: string;
  /** Personal access token for the GitHub publish action. Needs `repo`
   *  scope. Plaintext in user-data — show a warning in the UI. */
  githubToken?: string;
  /** Per-machine signing config applied to Windows builds via
   *  WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD env vars at build time. */
  signing?: SigningSettings;
  /** Cosmetic profile (name + avatar) for the sidebar / greetings. */
  profile?: ProfileSettings;
  /** Builder-app UI theme (independent of `defaultTheme`, which is for
   *  the user's GENERATED apps). */
  appearance?: AppearanceSettings;
  /** Stripe-driven billing state. Persisted alongside other settings so
   *  the app knows on launch whether the user is entitled to build. */
  subscription?: SubscriptionState;
}

export interface AppearanceSettings {
  /** "light" | "dark" | "custom" — see src/lib/theme.ts. */
  mode: "light" | "dark" | "custom";
  /** Hex like "#A78BFA". Only honored when mode === "custom". */
  customAccent: string;
}

export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
