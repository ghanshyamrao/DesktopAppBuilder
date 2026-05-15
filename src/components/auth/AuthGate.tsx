import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import SplashScreen from "./SplashScreen";
import LoginScreen from "./LoginScreen";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types";
import { identify, resetIdentity, track } from "@/lib/analytics";
import { useAppStore } from "@/store/appStore";

interface AuthContextValue {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

/** Hook for components inside the gate to read the signed-in user / sign out. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthGate>");
  return ctx;
}

type Phase =
  | { kind: "boot" }
  | { kind: "splash" }
  | { kind: "login"; configured: boolean }
  | { kind: "ready"; user: AuthUser };

interface Props {
  children: ReactNode;
}

/**
 * Top-level gate that hides everything inside `children` until:
 *   1. The first-run welcome splash has been dismissed (one time only), and
 *   2. The user has signed in with Google.
 */
export default function AuthGate({ children }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });

  /** Pull the renderer's data for whichever user just signed in. App.tsx
   *  also fires `refreshProjects` on mount, but App lives ABOVE AuthGate
   *  — that initial call happens while signed out, the per-user project
   *  store returns [], and nothing re-triggers a fetch when sign-in
   *  later completes. This helper closes that gap. */
  const hydrateForUser = useCallback(() => {
    const store = useAppStore.getState();
    void store.refreshProjects();
    void store.loadSettings();
    void store.loadSubscription();
  }, []);

  // Boot: ask main process for first-run + auth state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [firstRun, status] = await Promise.all([
          api.firstRun.status(),
          api.auth.status(),
        ]);
        if (cancelled) return;
        if (firstRun.showWelcome) {
          setPhase({ kind: "splash" });
        } else if (status.user) {
          identify(status.user);
          // Point the appStore at this user's notification slot before
          // children mount — otherwise the first paint shows an empty
          // bell, then flips to the user's history on the next tick.
          useAppStore.getState().setUserScope(status.user.sub);
          hydrateForUser();
          setPhase({ kind: "ready", user: status.user });
        } else {
          setPhase({ kind: "login", configured: status.configured });
        }
      } catch (err) {
        // Boot probe failed — safest default is the login screen so the
        // user can see the actual error and retry, instead of a stuck spinner.
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("Auth boot probe failed", err);
        setPhase({ kind: "login", configured: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissSplash = useCallback(async () => {
    try {
      await api.firstRun.acknowledge();
      track({ name: "first_run_acknowledged" });
    } catch {
      // even if the persistence call fails we still proceed — worst case
      // we re-show the splash next launch, no data loss.
    }
    // Re-check auth state after dismiss in case the user already had a
    // refresh token from a prior install.
    const status = await api.auth.status().catch(() => ({ configured: false, user: null }));
    if (status.user) {
      identify(status.user);
      useAppStore.getState().setUserScope(status.user.sub);
      hydrateForUser();
      setPhase({ kind: "ready", user: status.user });
    } else {
      setPhase({ kind: "login", configured: status.configured });
    }
  }, [hydrateForUser]);

  const onSignedIn = useCallback((user: AuthUser) => {
    identify(user);
    track({ name: "auth_signed_in", props: { method: "google" } });
    // Load this user's notification history before children render so
    // they see their own bell contents from the very first paint.
    useAppStore.getState().setUserScope(user.sub);
    // Refresh projects/settings/subscription against the new user. App.tsx
    // fires these on mount, but App lives above AuthGate so its fetch ran
    // BEFORE sign-in completed and returned []. Without this, dashboard
    // shows 0 projects until the user navigates to another route.
    hydrateForUser();
    setPhase({ kind: "ready", user });
  }, [hydrateForUser]);

  const signOut = useCallback(async () => {
    track({ name: "auth_signed_out" });
    await api.auth.signOut();
    resetIdentity();
    // Wipe the previous user's projects + subscription from the Zustand
    // store so the next person to sign in never sees a flash of the
    // prior account's data while refreshProjects() is in flight. The
    // main-process project store already filters by sub, but stale
    // renderer state would still show through for a single paint.
    useAppStore.setState({ projects: [], subscription: null });
    // Detach notifications from the previous user's localStorage slot —
    // `setUserScope(null)` clears in-memory state but PRESERVES each
    // user's persisted slot (`w2a:notifications:<sub>`) so they get
    // their full history back the next time they sign in.
    useAppStore.getState().setUserScope(null);
    // Chat history and wizard draft are still single-slot caches and
    // would leak between accounts — clear them. (TODO: namespace these
    // by user like notifications so each user keeps their own history.)
    try {
      localStorage.removeItem("w2a:ai-chat-history");
      localStorage.removeItem("w2a:wizard-draft");
    } catch { /* localStorage unavailable — non-fatal */ }
    const status = await api.auth.status().catch(() => ({ configured: false, user: null }));
    setPhase({ kind: "login", configured: status.configured });
  }, []);

  return (
    <>
      {/* Children always rendered — kept hidden under overlays so unmount/
          remount churn (and any expensive state inside) doesn't happen
          every time the user signs out and back in. */}
      {phase.kind === "ready" ? (
        <Ctx.Provider value={{ user: phase.user, signOut }}>{children}</Ctx.Provider>
      ) : null}

      <AnimatePresence mode="wait">
        {phase.kind === "boot" && <BootScreen key="boot" />}
        {phase.kind === "splash" && (
          <SplashScreen key="splash" onContinue={dismissSplash} />
        )}
        {phase.kind === "login" && (
          <LoginScreen key="login" configured={phase.configured} onSignedIn={onSignedIn} />
        )}
      </AnimatePresence>
    </>
  );
}

function BootScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-[310] bg-bg flex items-center justify-center"
    >
      <Loader2 className="animate-spin text-text-secondary" size={22} />
    </motion.div>
  );
}
