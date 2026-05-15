import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import SplashScreen from "./SplashScreen";
import LoginScreen from "./LoginScreen";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types";
import { identify, resetIdentity, track } from "@/lib/analytics";

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
      setPhase({ kind: "ready", user: status.user });
    } else {
      setPhase({ kind: "login", configured: status.configured });
    }
  }, []);

  const onSignedIn = useCallback((user: AuthUser) => {
    identify(user);
    track({ name: "auth_signed_in", props: { method: "google" } });
    setPhase({ kind: "ready", user });
  }, []);

  const signOut = useCallback(async () => {
    track({ name: "auth_signed_out" });
    await api.auth.signOut();
    resetIdentity();
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
