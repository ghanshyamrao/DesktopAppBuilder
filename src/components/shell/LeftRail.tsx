import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Sparkles, Palette, Zap, Puzzle, Bot, Settings as SettingsIcon,
  ChevronLeft, Upload, BookOpen, Wand2, CreditCard,
} from "lucide-react";
import { useAppStore, type Route } from "@/store/appStore";
import { useAuth } from "@/components/auth/AuthGate";
import { Tooltip } from "@/components/ui/Tooltip";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/lib/utils";
import { isEnabled, type FeatureKey } from "@/lib/features";
import { requireFeature } from "@/lib/api";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { GatedFeatureKey } from "@/types";
import logo from "./../../assets/logo.png";

interface NavEntry {
  key: string;
  /** Which feature flag controls visibility. When the flag is false in
   *  src/lib/features.ts, this entry is filtered out of the rail. */
  feature: FeatureKey;
  label: string;
  icon: React.ReactNode;
  route: Route;
  match: (r: Route) => boolean;
  /** Filled in by `visibleEntries()` based on the visible-list index, so
   *  shortcuts always count 1..N regardless of which features are off. */
  shortcut?: string;
  badge?: string;
  /** When set, clicking this entry calls `requireFeature(key)` — if the
   *  user's subscription doesn't include the feature, navigation is
   *  cancelled and the gate redirects to /billing with a toast. */
  gatedFeature?: GatedFeatureKey;
}

/* The PRIMARY/SECONDARY arrays declare every POSSIBLE entry. Visibility
 * is decided at render time by `FEATURES`. Shortcut numbers are assigned
 * dynamically based on the visible-item index, so 1-N is always sequential
 * regardless of which features are turned off. */
const PRIMARY_ALL: NavEntry[] = [
  { key: "dashboard", feature: "dashboard",     label: "Dashboard",     icon: <LayoutDashboard size={18} />, route: { name: "dashboard" }, match: (r) => r.name === "dashboard" || r.name === "wizard" || r.name === "build" },
  { key: "studio",    feature: "appStudio",     label: "App Studio",    icon: <Sparkles size={18} />,        route: { name: "studio" },    match: (r) => r.name === "studio",  gatedFeature: "app-studio" },
  { key: "builder",   feature: "builder",       label: "Builder",       icon: <Wand2 size={18} />,           route: { name: "builder" },   match: (r) => r.name === "builder", badge: "beta" },
  { key: "themes",    feature: "themeBuilder",  label: "Theme Builder", icon: <Palette size={18} />,         route: { name: "themes" },    match: (r) => r.name === "themes",  gatedFeature: "theme-builder" },
  { key: "actions",   feature: "actionBuilder", label: "Action Builder",icon: <Zap size={18} />,             route: { name: "actions" },   match: (r) => r.name === "actions", gatedFeature: "action-builder" },
  { key: "recipes",   feature: "recipes",       label: "Recipes",       icon: <BookOpen size={18} />,        route: { name: "recipes" },   match: (r) => r.name === "recipes" },
  { key: "plugins",   feature: "plugins",       label: "Plugins",       icon: <Puzzle size={18} />,          route: { name: "plugins" },   match: (r) => r.name === "plugins" },
  { key: "deploy",    feature: "deploy",        label: "Deploy",        icon: <Upload size={18} />,          route: { name: "deploy" },    match: (r) => r.name === "deploy",  gatedFeature: "github-publish" },
  { key: "ai",        feature: "aiAssistant",   label: "AI Assistant",  icon: <Bot size={18} />,             route: { name: "ai" },        match: (r) => r.name === "ai",      gatedFeature: "ai-assistant", badge: "beta" },
];

const SECONDARY_ALL: NavEntry[] = [
  { key: "billing",   feature: "billing",  label: "Billing",  icon: <CreditCard size={18} />,   route: { name: "billing" },  match: (r) => r.name === "billing" },
  { key: "settings",  feature: "settings", label: "Settings", icon: <SettingsIcon size={18} />, route: { name: "settings" }, match: (r) => r.name === "settings" },
];

/**
 * Filter to enabled entries and assign sequential shortcut numbers.
 * Returned shortcuts are strings of "1".."9" (Cmd/Ctrl + N covers up to 9).
 * Anything past 9 just gets no shortcut — Cmd-0 collides with the OS.
 */
function visibleEntries(all: NavEntry[]): Array<NavEntry & { shortcut?: string }> {
  return all
    .filter((e) => isEnabled(e.feature))
    .map((e, i) => (i < 9 ? { ...e, shortcut: String(i + 1) } : e));
}

export default function LeftRail() {
  const route = useAppStore((s) => s.route);
  const navigate = useAppStore((s) => s.navigate);
  const collapsed = useAppStore((s) => s.railCollapsed);
  const toggle = useAppStore((s) => s.toggleRail);

  // Subscription-based click gating is linked to the same `feature-billing`
  // PostHog flag the Billing sidebar entry uses. When billing is ON, we
  // call `requireFeature` so users without the right plan get bounced to
  // /billing. When billing is OFF (PostHog flip), every nav entry works
  // for everyone regardless of subscription — useful for previewing the
  // app without a payment flow. The tick re-renders the rail when PostHog
  // reloads its flag set, so toggling the flag takes effect within ~15s.
  useFeatureFlagsLoadedTick();
  const billingEnabled = isEnabled("billing");

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? "var(--rail-w-collapsed)" : "var(--rail-w-expanded)" }}
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
      className="shrink-0 h-full bg-bg-panel/80 backdrop-blur-xl border-r border-border flex flex-col relative z-10"
    >
      {/* brand */}
      <div className={cn("h-12 flex items-center gap-2.5 border-b border-border app-drag", collapsed ? "px-3 justify-center" : "px-4")}>
          <img src={logo} alt="WebToDesktop Builder" className="w-[24px] h-[24px] object-contain" />
        {!collapsed && (
          <div className="leading-tight no-drag">
            <div className="text-[13px] font-semibold tracking-tight">WebToDesktop</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Studio · Pro</div>
          </div>
        )}
      </div>

      {/* primary nav — filtered by FEATURES + shortcuts re-numbered 1..N */}
      <nav className="flex flex-col gap-0.5 p-2 mt-1 no-drag">
        {visibleEntries(PRIMARY_ALL).map((entry) => (
          <RailItem
            key={entry.key}
            entry={entry}
            active={entry.match(route)}
            collapsed={collapsed}
            onClick={() => {
              // Feature gate, scoped to the `feature-billing` PostHog flag:
              // when billing is enabled we ask the subscription gate before
              // navigating (it redirects to /billing + toasts on misses).
              // When billing is disabled in PostHog, we skip the gate so
              // every entry is reachable for every user.
              if (billingEnabled && entry.gatedFeature && !requireFeature(entry.gatedFeature)) return;
              navigate(entry.route);
            }}
          />
        ))}
      </nav>

      <div className="mx-3 my-3 neon-divider" />

      {/* secondary */}
      <nav className="flex flex-col gap-0.5 p-2 no-drag">
        {visibleEntries(SECONDARY_ALL).map((entry) => (
          <RailItem
            key={entry.key}
            entry={entry}
            active={entry.match(route)}
            collapsed={collapsed}
            onClick={() => {
              if (billingEnabled && entry.gatedFeature && !requireFeature(entry.gatedFeature)) return;
              navigate(entry.route);
            }}
          />
        ))}
      </nav>

      {/* user + collapse toggle pinned bottom */}
      <div className="mt-auto p-2 border-t border-border no-drag">
        <button
          type="button"
          onClick={() => navigate({ name: "settings" })}
          className={cn("w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition", collapsed && "justify-center")}
          title="Edit profile"
        >
          <RailAvatar />
          {!collapsed && <RailIdentity />}
        </button>

        <button
          onClick={toggle}
          className={cn(
            "mt-2 w-full h-8 rounded-md text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition flex items-center justify-center gap-1.5 text-xs",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronLeft size={14} />
          </motion.span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}

/**
 * Avatar bubble in the bottom-left identity block. Sourced from the
 * signed-in Google account (via `useAuth()`). Falls back to initials when
 * the picture URL fails to load (Google occasionally rate-limits).
 */
function RailAvatar() {
  const { user } = useAuth();
  const [imgFailed, setImgFailed] = useState(false);
  const initials = deriveInitials(user.name || user.email);
  const showImg = !!user.picture && !imgFailed;
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-violet/40 to-accent-blue/30 border border-border flex items-center justify-center text-xs font-semibold text-text-primary shrink-0 overflow-hidden">
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
  );
}

function RailIdentity() {
  const { user } = useAuth();
  const name = user.name?.trim() || user.email;
  return (
    <div className="leading-tight min-w-0 text-left">
      <div className="text-[12.5px] font-medium truncate">{name}</div>
      <div className="text-[10px] text-text-secondary truncate">{user.email}</div>
    </div>
  );
}

function deriveInitials(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
}

function RailItem({ entry, active, collapsed, onClick }: { entry: NavEntry; active: boolean; collapsed: boolean; onClick: () => void }) {
  const inner = (
    <button
      onClick={onClick}
      className={cn(
        "rail-item w-full",
        collapsed ? "justify-center px-0" : "px-3",
        active && "rail-item-active",
      )}
    >
      <span className={cn("shrink-0 transition-transform", active && "text-accent-blue")}>{entry.icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{entry.label}</span>
          {entry.badge && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-violet bg-accent-violet/10 border border-accent-violet/30 rounded px-1.5 py-0.5">
              {entry.badge}
            </span>
          )}
        </>
      )}
    </button>
  );

  if (!collapsed) return inner;
  return (
    <Tooltip content={entry.label} side="right" shortcut={entry.shortcut ? `⌘${entry.shortcut}` : undefined}>
      {inner}
    </Tooltip>
  );
}
