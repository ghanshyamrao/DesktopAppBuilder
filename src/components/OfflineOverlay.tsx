import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff, RotateCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { isEnabled } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";

/**
 * Full-screen modal that appears whenever the renderer goes offline. Listens
 * to `navigator.onLine` plus the browser's `online`/`offline` events, and
 * additionally polls the network state every 5s while offline so we catch
 * adapter changes that don't fire events (some Windows VPN clients drop the
 * event entirely on reconnect).
 *
 * UI exposes two actions:
 *   1. Retry — re-checks `navigator.onLine`; dismisses on success.
 *   2. Open network settings — deep-links to the OS network panel
 *      (Windows ms-settings:network, macOS Network prefpane, Linux best-effort).
 *
 * Gated by the `offlineOverlay` feature flag so it can be hidden remotely.
 */
export default function OfflineOverlay() {
  useFeatureFlagsLoadedTick();
  const enabled = isEnabled("offlineOverlay");

  // `navigator.onLine === true` only means "the OS believes there's a route" —
  // captive portals still report true. We treat that as good enough.
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  // Detect whether the preload bundle exposes `openNetworkSettings`. After
  // editing electron/preload.ts the dev server has to restart before the
  // new method is visible — until then, calling it throws "not a function".
  const preloadReady =
    typeof window !== "undefined" &&
    typeof window.w2a?.system?.openNetworkSettings === "function";

  useEffect(() => {
    const onOnline = () => { setOnline(true); setError(null); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Poll `navigator.onLine` every 5s while offline — events are flaky on
  // Windows when toggling Wi-Fi via the OS flyout, so we backstop with a poll.
  useEffect(() => {
    if (online) {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => setOnline(navigator.onLine), 5000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [online]);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      setOnline(navigator.onLine);
    } finally {
      setBusy(false);
    }
  }

  async function openNetworkSettings() {
    if (!preloadReady) {
      setError("Restart the app to load the network-settings link.");
      return;
    }
    try {
      await api.system.openNetworkSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!enabled) return null;

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9000] bg-bg-base/85 backdrop-blur-md flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-overlay-title"
        >
          <motion.div
            initial={{ y: 12, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 6, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-2xl bg-bg-panel border border-border shadow-2xl overflow-hidden"
          >
            {/* hero */}
            <div className="relative px-6 pt-6 pb-5 border-b border-border">
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-accent-red/15 to-transparent pointer-events-none" />
              <div className="relative flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-accent-red/15 border border-accent-red/30 flex items-center justify-center text-accent-red shrink-0">
                  <WifiOff size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="offline-overlay-title" className="text-base font-semibold text-text-primary">
                    You&apos;re offline
                  </h2>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    WebToDesktop Builder needs a network connection for sign-in,
                    AI features, GitHub publishing and template downloads.
                  </p>
                </div>
              </div>
            </div>

            {/* action row */}
            <div className="px-6 py-4 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                onClick={() => void retry()}
                disabled={busy}
              >
                Retry connection
              </Button>
              <Button
                leftIcon={<ExternalLink size={14} />}
                onClick={() => void openNetworkSettings()}
              >
                Open network settings
              </Button>
            </div>

            {error && (
              <div className="px-6 pb-3 text-[11px] text-accent-red leading-relaxed">{error}</div>
            )}

            <div className="px-6 pb-5 text-[10px] text-text-muted">
              This window dismisses automatically when the connection is restored.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
