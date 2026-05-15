import { create } from "zustand";
import { nanoid } from "nanoid";
import type { AppProject, BuildLogEvent, BuildProgressEvent, GlobalSettings, SubscriptionSummary } from "@/types";
import { api } from "@/lib/api";

export type Route =
  | { name: "dashboard" }
  | { name: "wizard"; draft?: import("@/types").AIProjectDraft["draft"]; starterId?: string }
  | { name: "build"; projectId: string }
  | { name: "settings"; section?: string }
  | { name: "studio"; projectId?: string }
  | { name: "themes" }
  | { name: "actions" }
  | { name: "plugins" }
  | { name: "ai" }
  | { name: "deploy" }
  | { name: "recipes" }
  | { name: "builder" }
  | { name: "billing" };

export type NotificationKind = "success" | "error" | "info" | "update";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** When set, clicking the notification navigates here. */
  route?: Route;
  createdAt: string; // ISO
  readAt?: string;   // ISO when the user dismissed/opened it
  /** Stable de-dupe key — a second push with the same key replaces the
   *  earlier one instead of stacking duplicates (e.g. one error per build). */
  dedupeKey?: string;
}

const NOTIF_STORAGE_PREFIX = "w2a:notifications";
const NOTIF_LEGACY_KEY = "w2a:notifications"; // pre-per-user shared slot
const NOTIF_LIMIT = 50;

/** Per-user notification scope. Set by AuthGate via `setUserScope(sub)`
 *  on sign-in (and `null` on sign-out). While null, notifications still
 *  function in memory but writes target the "anon" slot which never gets
 *  read back — effectively making the bell ephemeral when signed out. */
let currentNotifScope: string | null = null;

function notifKey(scope: string | null): string {
  return scope ? `${NOTIF_STORAGE_PREFIX}:${scope}` : `${NOTIF_STORAGE_PREFIX}:anon`;
}

function loadStoredNotifications(scope: string | null): Notification[] {
  try {
    const raw = localStorage.getItem(notifKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is Notification =>
      n && typeof n.id === "string" && typeof n.title === "string" && typeof n.createdAt === "string"
    ).slice(0, NOTIF_LIMIT);
  } catch { return []; }
}

function persistNotifications(scope: string | null, list: Notification[]): void {
  try { localStorage.setItem(notifKey(scope), JSON.stringify(list.slice(0, NOTIF_LIMIT))); }
  catch { /* localStorage can be unavailable — non-fatal */ }
}

/** One-shot migration from the pre-per-user shared slot. Runs the first
 *  time a user signs in after this code ships — if `w2a:notifications`
 *  has entries and the user's per-user slot is empty, those legacy rows
 *  get claimed by that user (mirroring the project-claim migration in
 *  electron/ipc/handlers.ts). The legacy key is removed afterwards so a
 *  second account never inherits the same rows. */
function migrateLegacyNotifications(scope: string): void {
  try {
    const legacy = localStorage.getItem(NOTIF_LEGACY_KEY);
    if (!legacy) return;
    const existing = localStorage.getItem(notifKey(scope));
    if (!existing) localStorage.setItem(notifKey(scope), legacy);
    localStorage.removeItem(NOTIF_LEGACY_KEY);
  } catch { /* non-fatal */ }
}

interface AppState {
  route: Route;
  navigate: (route: Route) => void;

  /* ---- shell UI ---- */
  railCollapsed: boolean;
  toggleRail: () => void;
  consoleOpen: boolean;
  toggleConsole: () => void;
  setConsoleOpen: (open: boolean) => void;
  paletteOpen: boolean;
  togglePalette: () => void;
  setPaletteOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  docsOpen: boolean;
  setDocsOpen: (open: boolean) => void;

  projects: AppProject[];
  loadingProjects: boolean;
  refreshProjects: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  settings: GlobalSettings | null;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<void>;

  /* ---- billing / Paddle ---- */
  subscription: SubscriptionSummary | null;
  loadSubscription: () => Promise<void>;
  setSubscription: (next: SubscriptionSummary) => void;

  // build live state per project id
  liveLogs: Record<string, BuildLogEvent[]>;
  liveProgress: Record<string, BuildProgressEvent>;
  ingestLog: (event: BuildLogEvent) => void;
  ingestProgress: (event: BuildProgressEvent) => void;
  hydrateLogs: (projectId: string) => Promise<void>;
  clearLogs: (projectId: string) => void;

  /* ---- notifications ---- */
  notifications: Notification[];
  pushNotification: (n: Omit<Notification, "id" | "createdAt">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  /** Bind the store to a user. Called by AuthGate on sign-in (with the
   *  Google sub) and sign-out (with null). Reloads notifications from
   *  that user's localStorage slot so each user has their own history. */
  setUserScope: (sub: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  route: { name: "dashboard" },
  navigate: (route) => set({ route }),

  railCollapsed: false,
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  consoleOpen: false,
  toggleConsole: () => set((s) => ({ consoleOpen: !s.consoleOpen })),
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  paletteOpen: false,
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  aboutOpen: false,
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  docsOpen: false,
  setDocsOpen: (docsOpen) => set({ docsOpen }),

  projects: [],
  loadingProjects: false,
  refreshProjects: async () => {
    set({ loadingProjects: true });
    try {
      const projects = await api.projects.list();
      set({ projects });
    } finally {
      set({ loadingProjects: false });
    }
  },
  deleteProject: async (id: string) => {
    await api.projects.delete(id);
    await get().refreshProjects();
  },

  settings: null,
  loadSettings: async () => {
    const settings = await api.settings.get();
    set({ settings });
  },
  updateSettings: async (patch) => {
    const settings = await api.settings.update(patch);
    set({ settings });
  },

  subscription: null,
  loadSubscription: async () => {
    try {
      const sub = await api.billing.status();
      set({ subscription: sub });
    } catch {
      // Paddle not configured or main hasn't started — treat as free.
      // Filled-out SubscriptionSummary so consumers can read e.g.
      // `subscription.features.includes("theme-switch")` without nulls.
      set({
        subscription: {
          tier: "free",
          active: false,
          dailyBuildLimit: 0,
          buildsUsedToday: 0,
          buildsRemainingToday: 0,
          totalBuildLimit: 0,
          buildsUsedTotal: 0,
          buildsRemainingTotal: 0,
          features: [],
          isTrial: false,
          trialUsed: false,
        },
      });
    }
  },
  setSubscription: (next) => set({ subscription: next }),

  liveLogs: {},
  liveProgress: {},
  ingestLog: (event) =>
    set((state) => {
      const list = state.liveLogs[event.projectId] ?? [];
      return { liveLogs: { ...state.liveLogs, [event.projectId]: [...list, event] } };
    }),
  ingestProgress: (event) =>
    set((state) => ({ liveProgress: { ...state.liveProgress, [event.projectId]: event } })),
  hydrateLogs: async (projectId) => {
    try {
      const logs = await api.builds.getLogs(projectId);
      set((state) => ({ liveLogs: { ...state.liveLogs, [projectId]: logs } }));
    } catch {
      // ignore
    }
  },
  clearLogs: (projectId) =>
    set((state) => {
      const nextProgress = { ...state.liveProgress };
      delete nextProgress[projectId];
      return {
        liveLogs: { ...state.liveLogs, [projectId]: [] },
        liveProgress: nextProgress,
      };
    }),

  // Start empty — `setUserScope(sub)` reloads from the right slot once
  // AuthGate has confirmed which user is signed in. Prevents a flash of
  // another account's notifications between boot and auth resolution.
  notifications: [],
  pushNotification: (n) =>
    set((state) => {
      // Drop any earlier entry with the same dedupeKey so re-running a build
      // doesn't stack "Build failed" rows for the same project.
      const filtered = n.dedupeKey
        ? state.notifications.filter((x) => x.dedupeKey !== n.dedupeKey)
        : state.notifications;
      const next: Notification[] = [
        { ...n, id: nanoid(), createdAt: new Date().toISOString() },
        ...filtered,
      ].slice(0, NOTIF_LIMIT);
      persistNotifications(currentNotifScope, next);
      return { notifications: next };
    }),
  markNotificationRead: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const next = state.notifications.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n));
      persistNotifications(currentNotifScope, next);
      return { notifications: next };
    }),
  markAllNotificationsRead: () =>
    set((state) => {
      const now = new Date().toISOString();
      const next = state.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now }));
      persistNotifications(currentNotifScope, next);
      return { notifications: next };
    }),
  removeNotification: (id) =>
    set((state) => {
      const next = state.notifications.filter((n) => n.id !== id);
      persistNotifications(currentNotifScope, next);
      return { notifications: next };
    }),
  clearNotifications: () => {
    persistNotifications(currentNotifScope, []);
    set({ notifications: [] });
  },
  setUserScope: (sub) => {
    currentNotifScope = sub;
    if (sub) migrateLegacyNotifications(sub);
    set({ notifications: loadStoredNotifications(sub) });
  },
}));
