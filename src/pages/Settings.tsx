import { useEffect, useMemo, useState } from "react";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import { Loader2, LogOut, Save, ShieldCheck, Monitor as MonitorIcon, Bot, ExternalLink, Github, FileKey, FolderOpen, X, User, Mail, BadgeCheck, Palette, Check, Sun, Moon, Sparkles, CreditCard, Calendar, Zap, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { SubSidebar, type SubNavEntry } from "@/components/ui/SubSidebar";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import Checkbox from "@/components/Checkbox";
import { useAppStore } from "@/store/appStore";
import { useAuth } from "@/components/auth/AuthGate";
import { THEME_PRESETS, type ThemeKey } from "@/lib/theme";
import { isEnabled, isSettingsSectionEnabled, type SettingsSectionKey } from "@/lib/features";
import { cn } from "@/lib/utils";
import type { GlobalSettings } from "@/types";

type SectionKey = SettingsSectionKey;

const ALL_SUB_NAV: readonly SubNavEntry<SectionKey>[] = [
  { key: "profile",      label: "Profile",        icon: <User size={14} /> },
  { key: "subscription", label: "Subscription",   icon: <CreditCard size={14} /> },
  { key: "appearance",   label: "Appearance",     icon: <Palette size={14} /> },
  { key: "window",       label: "Default window", icon: <MonitorIcon size={14} /> },
  { key: "security",     label: "Security",       icon: <ShieldCheck size={14} /> },
  { key: "ai",           label: "AI Assistant",   icon: <Bot size={14} /> },
  { key: "github",       label: "GitHub",         icon: <Github size={14} /> },
  { key: "signing",      label: "Code signing",   icon: <FileKey size={14} /> },
];

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const route = useAppStore((s) => s.route);
  const toast = useToast();

  // Re-render when PostHog reloads flags so disabled sections drop out of
  // the sub-nav (and re-enabled ones come back) without a page reload.
  const flagsTick = useFeatureFlagsLoadedTick();

  // Filter the sub-nav on every render — `isSettingsSectionEnabled` reads
  // PostHog under the hood and falls back to the static `SETTINGS_SECTIONS`
  // table. Memoize on `flagsTick` so we only re-walk the list when flag
  // values actually change.
  //
  // The Subscription tab is additionally linked to the top-level
  // `feature-billing` PostHog flag — same flag the sidebar's Billing entry
  // uses. When billing is disabled, both the sidebar entry and this tab
  // disappear together (and we avoid the "Loading subscription…" state,
  // since `SubscriptionGateProvider` skips its load when billing is off).
  const subNav = useMemo<readonly SubNavEntry<SectionKey>[]>(
    () => ALL_SUB_NAV.filter((e) => {
      if (!isSettingsSectionEnabled(e.key)) return false;
      if (e.key === "subscription" && !isEnabled("billing")) return false;
      return true;
    }),
    [flagsTick],
  );
  const defaultSection: SectionKey = subNav[0]?.key ?? "profile";

  const [draft, setDraft] = useState<GlobalSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>(defaultSection);

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  // If the currently active section just got hidden by a flag flip, snap
  // the rail back to the first still-visible entry.
  useEffect(() => {
    if (!subNav.some((e) => e.key === activeSection)) {
      setActiveSection(defaultSection);
    }
  }, [subNav, activeSection, defaultSection]);

  // Sync to ?section when it's a known + visible section. Lets global search
  // jump straight to e.g. "Security" without an extra click.
  useEffect(() => {
    if (route.name !== "settings") return;
    const target = route.section as SectionKey | undefined;
    if (target && subNav.some((e) => e.key === target)) {
      setActiveSection(target);
    }
  }, [route, subNav]);

  if (!draft) {
    return (
      <div className="pb-12">
        <PageHeader eyebrow="Workspace" title="Settings" />
        <div className="flex items-center justify-center text-text-secondary py-24">
          <Loader2 className="animate-spin" />
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings(draft);
      setSavedAt(Date.now());
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Couldn't save settings", err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  };

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Workspace"
        title="Global preferences"
        description="Defaults applied to every new app you create. Changes here don't affect existing projects."
        actions={
          <div className="flex items-center gap-3">
            {savedAt && !dirty && <Badge tone="green">Saved</Badge>}
            <Button variant="primary" leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} disabled={!dirty || saving} onClick={save}>
              Save Changes
            </Button>
          </div>
        }
      />

      {/* Rail anchored to the LEFT edge of the content area (no centering
          on the grid). The form column gets a max-width applied locally
          so inputs don't stretch the full screen on wide monitors. */}
      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)]">
        <SubSidebar entries={subNav} active={activeSection} onChange={setActiveSection} />

        <div className="min-w-0 space-y-5 max-w-3xl">
        {activeSection === "profile" && <ProfileSection />}

        {activeSection === "subscription" && <SubscriptionSection />}

        {activeSection === "appearance" && (
          <AppearanceSection
            value={draft.appearance ?? { mode: "dark", customAccent: "#A78BFA" }}
            onChange={(appearance) => setDraft({ ...draft, appearance })}
          />
        )}

        {activeSection === "window" && (
        <GlassCard className="p-6 space-y-5">
          <SectionTitle icon={<MonitorIcon size={14} />} title="Default Window" subtitle="Initial size and behavior for new apps" />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Default Width (px)">
              <input type="number" min={320} value={draft.defaultWindow.width}
                onChange={(e) => setDraft({ ...draft, defaultWindow: { ...draft.defaultWindow, width: Number(e.target.value) || 0 } })}
                className="input" />
            </Field>
            <Field label="Default Height (px)">
              <input type="number" min={240} value={draft.defaultWindow.height}
                onChange={(e) => setDraft({ ...draft, defaultWindow: { ...draft.defaultWindow, height: Number(e.target.value) || 0 } })}
                className="input" />
            </Field>
          </div>

          <div className="space-y-1">
            <Checkbox checked={draft.defaultWindow.centerOnLaunch}
              onChange={(v) => setDraft({ ...draft, defaultWindow: { ...draft.defaultWindow, centerOnLaunch: v } })}
              label="Center window on launch"
              description="Always open new apps in the center of the primary display." />
            <Checkbox checked={draft.defaultWindow.rememberState}
              onChange={(v) => setDraft({ ...draft, defaultWindow: { ...draft.defaultWindow, rememberState: v } })}
              label="Remember window state"
              description="Restore size and position from previous session." />
          </div>
        </GlassCard>
        )}

        {activeSection === "security" && (
        <GlassCard className="p-6 space-y-5">
          <SectionTitle icon={<ShieldCheck size={14} />} title="Security Defaults" subtitle="Sensible defaults for new apps" />

          <div className="space-y-1">
            <Checkbox checked={draft.defaultSecurity.disableContextMenu}
              onChange={(v) => setDraft({ ...draft, defaultSecurity: { ...draft.defaultSecurity, disableContextMenu: v } })}
              label="Disable Right Click (Context Menu)"
              description="Prevents users from inspecting elements or copying text easily." />
            <Checkbox checked={draft.defaultSecurity.enableDevToolsInProduction}
              onChange={(v) => setDraft({ ...draft, defaultSecurity: { ...draft.defaultSecurity, enableDevToolsInProduction: v } })}
              label="Enable Developer Tools in Production"
              description="Allow F12 to open devtools in built apps." />
          </div>

          <Field label="Custom User Agent" helper="Override the default UA string for all web views.">
            <input placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X...)"
              value={draft.defaultSecurity.customUserAgent ?? ""}
              onChange={(e) => setDraft({ ...draft, defaultSecurity: { ...draft.defaultSecurity, customUserAgent: e.target.value } })}
              className="input" />
          </Field>
        </GlassCard>
        )}

        {activeSection === "ai" && (
        <GlassCard className="p-6 space-y-5">
          <SectionTitle icon={<Bot size={14} />} title="AI Assistant" subtitle="Google Gemini API key for the in-app AI" />

          <Field label="Gemini API key"
            helper="Free tier — no credit card. Get one at aistudio.google.com. Stored locally in your user data folder.">
            <input
              type="password"
              placeholder="AIza..."
              value={draft.aiApiKey ?? ""}
              onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value })}
              className="input font-mono"
            />
          </Field>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-xs text-accent-blue hover:underline">
            Get a free API key <ExternalLink size={11} />
          </a>
        </GlassCard>
        )}

        {activeSection === "github" && (
        <GlassCard className="p-6 space-y-5">
          <SectionTitle icon={<Github size={14} />} title="GitHub publishing" subtitle="Push built artifacts to a GitHub Release" />

          <Field label="Personal access token"
            helper="Needs `repo` scope. Create one at github.com/settings/tokens. Stored as plain text in your user data folder.">
            <input
              type="password"
              placeholder="ghp_..."
              value={draft.githubToken ?? ""}
              onChange={(e) => setDraft({ ...draft, githubToken: e.target.value })}
              className="input font-mono"
            />
          </Field>
          <a href="https://github.com/settings/tokens/new?scopes=repo&description=WebToDesktop+Builder" target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-xs text-accent-blue hover:underline">
            Create a token <ExternalLink size={11} />
          </a>
        </GlassCard>
        )}

        {activeSection === "signing" && (
        <GlassCard className="p-6 space-y-5">
          <SectionTitle icon={<FileKey size={14} />} title="Windows code signing" subtitle="Sign .exe / .msi installers with a .pfx certificate" />

          <Field label="Certificate (.pfx / .p12)"
            helper="Used as WIN_CSC_LINK at build time. Path is stored — file isn't copied.">
            <div className="flex items-center gap-2">
              <input
                placeholder="C:\\path\\to\\cert.pfx"
                value={draft.signing?.pfxPath ?? ""}
                onChange={(e) => setDraft({
                  ...draft,
                  signing: { pfxPath: e.target.value, password: draft.signing?.password ?? "" },
                })}
                className="input font-mono flex-1"
              />
              <button
                type="button"
                onClick={async () => {
                  const result = await api.dialog.pickPfx();
                  if (result?.path) {
                    setDraft({
                      ...draft,
                      signing: { pfxPath: result.path, password: draft.signing?.password ?? "" },
                    });
                  }
                }}
                className="h-9 px-3 rounded-md text-xs bg-bg-card border border-border hover:border-border-strong inline-flex items-center gap-1.5 transition"
              >
                <FolderOpen size={12} /> Browse
              </button>
              {draft.signing?.pfxPath && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, signing: undefined })}
                  className="h-9 px-2 rounded-md text-xs bg-bg-card border border-border hover:border-accent-red/50 hover:text-accent-red transition"
                  title="Clear signing config"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </Field>

          <Field label="Certificate password"
            helper="Passed to electron-builder via WIN_CSC_KEY_PASSWORD. Plain text — same threat model as the API keys above.">
            <input
              type="password"
              placeholder="••••••••"
              value={draft.signing?.password ?? ""}
              onChange={(e) => setDraft({
                ...draft,
                signing: { pfxPath: draft.signing?.pfxPath ?? "", password: e.target.value },
              })}
              className="input font-mono"
              disabled={!draft.signing?.pfxPath}
            />
          </Field>
        </GlassCard>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * Profile section — driven entirely by the signed-in Google account.
 * Read-only: name/email/picture come from the OAuth id_token. The only
 * mutating action here is "Sign out", which clears the persisted refresh
 * token and bounces the user back to the LoginScreen.
 */
function ProfileSection() {
  const { user, signOut } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const initials = deriveInitials(user.name || user.email);
  const showImg = !!user.picture && !imgFailed;

  const onSignOut = async () => {
    const yes = await confirm({
      title: "Sign out of WebToDesktop Builder?",
      body: "You'll need to sign in with Google again to reopen the app. Your projects and settings stay on this machine.",
      confirmLabel: "Sign out",
      tone: "danger",
    });
    if (!yes) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      toast.error("Sign out failed", err instanceof Error ? err.message : String(err));
      setSigningOut(false);
    }
  };

  return (
    <GlassCard className="p-6 space-y-5">
      <SectionTitle
        icon={<User size={14} />}
        title="Signed in with Google"
        subtitle="Your account identity comes from Google. To change name or photo, update your Google profile."
      />

      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-violet/40 to-accent-blue/30 border border-border flex items-center justify-center text-xl font-semibold text-text-primary shrink-0 overflow-hidden">
          {showImg ? (
            <img
              src={user.picture}
              alt={user.name ?? user.email}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-base font-semibold text-text-primary truncate">
              {user.name?.trim() || user.email}
            </div>
            {user.emailVerified && (
              <span className="inline-flex items-center gap-1 text-[11px] text-accent-green">
                <BadgeCheck size={12} />
                Verified
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-text-secondary flex items-center gap-1.5">
            <Mail size={12} />
            <span className="truncate">{user.email}</span>
          </div>
          <div className="mt-1 text-[11px] text-text-muted font-mono truncate" title={user.sub}>
            Google ID: {user.sub}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-border flex items-center justify-between gap-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          Tokens are encrypted with the OS keychain. Signing out removes them from this machine.
        </p>
        <Button
          variant="danger"
          onClick={onSignOut}
          disabled={signingOut}
          leftIcon={signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </GlassCard>
  );
}

/**
 * Appearance — Light / Dark / Custom theme picker for the WebToDesktop Builder UI
 * itself (not for generated apps; that's ThemeBuilder). Changes take effect
 * immediately via the App-level effect that watches `settings.appearance`.
 * The user still has to hit "Save Changes" to persist; the live preview is
 * just a draft until then.
 */
/**
 * Subscription details panel — read-only summary of the user's current
 * plan, expiry, build counters, and a CTA to manage the plan on the
 * full Billing page. Refresh button re-fetches from Paddle so users who
 * paid on the marketing website see their entitlement appear here as
 * soon as they hit it.
 */
function SubscriptionSection() {
  const subscription = useAppStore((s) => s.subscription);
  const loadSubscription = useAppStore((s) => s.loadSubscription);
  const navigate = useAppStore((s) => s.navigate);
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await api.billing.refresh();
      await loadSubscription();
      toast.success("Subscription refreshed");
    } catch (err) {
      toast.error("Couldn't refresh subscription", err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  if (!subscription) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center justify-center py-10 text-text-secondary text-sm">
          <Loader2 size={14} className="animate-spin mr-2" />
          Loading subscription…
        </div>
      </GlassCard>
    );
  }

  const sub = subscription;
  const isFree     = sub.tier === "free";
  const isTrial    = sub.tier === "trial";
  const isLifetime = sub.tier === "lifetime";
  const planLabel  = sub.planLabel ?? (isFree ? "No plan" : sub.tier);
  const status     = !sub.active ? "Inactive"
                   : isTrial     ? "Trial"
                   : isLifetime  ? "Active · Lifetime"
                                 : "Active";
  const expiresAtStr = sub.expiresAt && !isLifetime
    ? new Date(sub.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const purchasedAtStr = sub.purchasedAt
    ? new Date(sub.purchasedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <GlassCard className="p-6 space-y-5">
      <SectionTitle
        icon={<CreditCard size={14} />}
        title="Subscription"
        subtitle="Your current plan, status, and limits. Manage payment on the Billing page."
      />

      {/* Hero plan tile */}
      <div className="rounded-2xl border border-border bg-bg-card p-5 flex items-start gap-5">
        <div className={cn(
          "w-12 h-12 rounded-xl border flex items-center justify-center shrink-0",
          isLifetime ? "bg-accent-violet/15 border-accent-violet/30 text-accent-violet"
          : isTrial  ? "bg-accent-yellow/15 border-accent-yellow/30 text-accent-yellow"
          : sub.active ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue"
          : "bg-bg-elev border-border text-text-muted",
        )}>
          {isLifetime ? <Sparkles size={20} /> : <Zap size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-lg font-semibold text-text-primary">{planLabel}</div>
            <Badge tone={sub.active ? (isLifetime ? "violet" : "green") : "red"}>{status}</Badge>
          </div>
          <div className="mt-1.5 grid gap-1 text-xs text-text-secondary">
            {purchasedAtStr && (
              <div className="flex items-center gap-1.5">
                <Calendar size={11} /> <span>Purchased {purchasedAtStr}</span>
              </div>
            )}
            {expiresAtStr && (
              <div className="flex items-center gap-1.5">
                <Calendar size={11} /> <span>{isTrial ? "Trial ends" : "Renews"} {expiresAtStr}</span>
              </div>
            )}
            {isLifetime && (
              <div className="flex items-center gap-1.5 text-accent-violet">
                <Sparkles size={11} /> <span>Lifetime access — no expiry, future updates included</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Usage tile — daily + total build counters where they apply */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UsageTile
          label="Builds today"
          value={sub.dailyBuildLimit === null
            ? isFree
              ? "—"
              : `${sub.buildsUsedToday} (unlimited)`
            : `${sub.buildsUsedToday} / ${sub.dailyBuildLimit}`}
          hint={sub.dailyBuildLimit === null
            ? isFree
              ? "Free tier uses the lifetime allowance — no daily counter."
              : "No daily cap on your plan."
            : sub.buildsRemainingToday === 0
              ? "Daily limit hit — resets at midnight local time."
              : `${sub.buildsRemainingToday} more left today.`}
        />
        {sub.totalBuildLimit !== null ? (
          <UsageTile
            label={isFree ? "Free demo builds" : "Trial builds used"}
            value={`${sub.buildsUsedTotal} / ${sub.totalBuildLimit}`}
            hint={sub.buildsRemainingTotal === 0
              ? isFree
                ? "Free build used — pick a plan to keep building."
                : "Trial cap reached — upgrade to keep building."
              : isFree
                ? `${sub.buildsRemainingTotal} free build${sub.buildsRemainingTotal === 1 ? "" : "s"} remaining — try the product, then subscribe.`
                : `${sub.buildsRemainingTotal} trial builds remaining.`}
          />
        ) : (
          <UsageTile
            label="Total builds"
            value={String(sub.buildsUsedTotal)}
            hint="Cumulative builds run on this plan."
          />
        )}
      </div>

      <div className="pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-secondary leading-relaxed max-w-md">
          Already paid on the website? Hit <strong className="text-text-primary">Refresh</strong> to
          pull your subscription from Paddle. Tier and limits are derived from the live entitlement,
          not from local state.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" leftIcon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />} disabled={refreshing} onClick={onRefresh}>
            Refresh
          </Button>
          <Button size="sm" variant="primary" leftIcon={<ExternalLink size={13} />} onClick={() => navigate({ name: "billing" })}>
            {isFree || !sub.active ? "Pick a plan" : "Manage plan"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

function UsageTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card/60 p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-text-secondary leading-snug">{hint}</div>
    </div>
  );
}

function AppearanceSection({
  value,
  onChange,
}: {
  value: { mode: "light" | "dark" | "custom"; customAccent: string };
  onChange: (next: { mode: "light" | "dark" | "custom"; customAccent: string }) => void;
}) {
  const previewIcon: Record<ThemeKey, React.ReactNode> = {
    dark: <Moon size={14} />,
    light: <Sun size={14} />,
    custom: <Sparkles size={14} />,
  };

  return (
    <GlassCard className="p-6 space-y-5">
      <SectionTitle
        icon={<Palette size={14} />}
        title="Appearance"
        subtitle="Theme for the WebToDesktop Builder interface itself. Per-project app themes live in Theme Builder."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {THEME_PRESETS.map((preset) => {
          const active = value.mode === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange({ ...value, mode: preset.key })}
              className={cn(
                "relative text-left p-4 rounded-xl border transition group",
                active
                  ? "border-accent-blue/60 bg-accent-blue/[0.06] shadow-glow"
                  : "border-border bg-bg-card hover:border-border-strong",
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center border",
                    active
                      ? "bg-accent-blue/20 border-accent-blue/40 text-accent-blue"
                      : "bg-bg-elev border-border text-text-secondary",
                  )}
                >
                  {previewIcon[preset.key]}
                </span>
                <div className="text-sm font-semibold text-text-primary">{preset.label}</div>
                {active && (
                  <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-blue text-white">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* swatch preview row — actual hex shown in tiny tile */}
              <div className="flex items-center gap-1.5 mb-3">
                {preset.swatches.map((color, i) => (
                  <span
                    key={i}
                    className="h-5 flex-1 rounded border border-border"
                    style={{ background: color }}
                  />
                ))}
              </div>

              <p className="text-[11px] text-text-secondary leading-snug">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {value.mode === "custom" && (
        <div className="pt-4 border-t border-border space-y-3">
          <Field label="Accent color" helper="Used for buttons, focus rings, links, and the ambient background glow.">
            <div className="flex items-center gap-3">
              <label className="relative w-11 h-11 rounded-lg overflow-hidden border border-border-strong cursor-pointer shrink-0 ring-2 ring-transparent hover:ring-accent-blue/30 transition">
                <input
                  type="color"
                  value={value.customAccent}
                  onChange={(e) => onChange({ ...value, customAccent: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Pick accent color"
                />
                <span className="absolute inset-0 pointer-events-none" style={{ background: value.customAccent }} />
              </label>
              <input
                type="text"
                value={value.customAccent}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(v) || v === "" || v.startsWith("#")) {
                    onChange({ ...value, customAccent: v });
                  }
                }}
                placeholder="#A78BFA"
                className="input font-mono text-sm flex-1 max-w-[180px]"
              />
              <div className="flex gap-1.5">
                {["#5B9DFF", "#A78BFA", "#34D399", "#F472B6", "#F59E0B", "#22D3EE"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => onChange({ ...value, customAccent: c })}
                    className={cn(
                      "w-7 h-7 rounded-md border transition",
                      value.customAccent.toLowerCase() === c.toLowerCase()
                        ? "border-text-primary scale-110"
                        : "border-border hover:border-text-secondary",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </Field>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Custom uses the dark surface palette with your chosen accent — handy if you want the
            default look but in your brand color.
          </p>
        </div>
      )}
    </GlassCard>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-border text-text-secondary flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-text-secondary mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

/**
 * Live preview of how the profile will render in the sidebar.
 * Falls back to initials when the avatar URL is missing or fails to load —
 * mirrors the LeftRail logic so what you see here is what ships there.
 */
function ProfilePreview({ name, avatarUrl }: { name?: string; avatarUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = deriveInitials(name);
  const showImg = !!avatarUrl && !imgFailed;
  return (
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-violet/40 to-accent-blue/30 border border-border flex items-center justify-center text-base font-semibold text-text-primary shrink-0 overflow-hidden">
      {showImg ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

/** "Ghanshyam Rao" → "GR", "John" → "J", "" → "??". Always 1-2 characters. */
function deriveInitials(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {helper && <p className="helper">{helper}</p>}
    </div>
  );
}
