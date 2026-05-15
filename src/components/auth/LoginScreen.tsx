import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Lock, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types";

interface Props {
  /** Whether google-oauth.json was found by the main process. */
  configured: boolean;
  onSignedIn: (user: AuthUser) => void;
}

/**
 * Hard gate: until the user signs in with Google, the rest of WebToDesktop Builder
 * is unreachable. The Sign-In button kicks the OAuth flow in the main
 * process which opens Google's consent page in the user's default browser
 * and listens on a loopback port for the redirect.
 */
export default function LoginScreen({ configured, onSignedIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    if (!configured) return;
    setBusy(true);
    setError(null);
    try {
      const user = await api.auth.signIn();
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-[290] flex items-center justify-center p-10 bg-bg overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[760px] h-[760px] rounded-full bg-accent-blue/8 blur-3xl" />
      </div>

      <motion.div
        initial={{ scale: 0.97, y: 8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md glass-strong rounded-3xl shadow-elev p-9"
      >
        <img
          src={logo}
          alt="WebToDesktop Builder"
          className="w-14 h-14 mx-auto mb-5 rounded-xl object-contain"
        />

        <h1 className="text-xl font-semibold tracking-tight text-text-primary text-center">
          Sign in to WebToDesktop Builder
        </h1>
        <p className="text-text-secondary text-sm text-center mt-2 leading-relaxed">
          Continue with your Google account to access your projects, themes, and build history.
        </p>

        {!configured && (
          <div className="mt-6 flex items-start gap-2.5 p-3 rounded-lg bg-accent-yellow/10 border border-accent-yellow/30 text-accent-yellow text-xs leading-snug">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Google OAuth client is not configured. Place your{" "}
              <code className="font-mono">google-oauth.json</code> in the project root, restart the
              app, and try again.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-2.5 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs leading-snug">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={onSignIn}
          disabled={busy || !configured}
          className="mt-7 w-full h-11 rounded-xl bg-white text-[#1f1f1f] font-medium text-sm inline-flex items-center justify-center gap-3 hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Waiting for Google…
            </>
          ) : (
            <>
              <GoogleMark />
              Continue with Google
            </>
          )}
        </button>

        <div className="mt-6 flex items-center gap-2 text-[11px] text-text-muted justify-center">
          <Lock size={11} />
          <span>Browser-based sign-in. No password ever leaves your machine.</span>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-text-muted justify-center">
          <ShieldCheck size={11} />
          <span>Tokens are encrypted with the OS keychain.</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
