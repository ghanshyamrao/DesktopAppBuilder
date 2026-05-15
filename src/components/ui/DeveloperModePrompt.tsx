import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "./Button";
import { api, setBuildPreflight, clearBuildPreflight } from "@/lib/api";

export interface SymlinkStatus {
  canCreateSymlinks: boolean;
  developerMode: boolean;
  elevated: boolean;
  notApplicable: boolean;
  detail: string;
}

/**
 * Block until either:
 *   - Symlink privilege is available (resolves true), or
 *   - The user cancels (resolves false).
 *
 * The dialog auto-polls Windows after the user clicks "Open Settings" so
 * flipping the Developer Mode toggle dismisses it without requiring an
 * explicit retry click.
 */
type RequestFn = () => Promise<boolean>;

const Ctx = createContext<RequestFn | null>(null);

interface PendingRequest {
  initialStatus: SymlinkStatus;
  resolve: (granted: boolean) => void;
}

export function DeveloperModePromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const request: RequestFn = useCallback(async () => {
    const initialStatus = await api.system.checkSymlinkPrivilege();
    if (initialStatus.canCreateSymlinks || initialStatus.notApplicable) return true;
    return new Promise<boolean>((resolve) => setPending({ initialStatus, resolve }));
  }, []);

  // Register as the build pre-flight gate so `api.builds.start` everywhere
  // (wizard, dashboard, AI assistant, deploy) auto-prompts the user.
  useEffect(() => {
    setBuildPreflight(request);
    return () => clearBuildPreflight();
  }, [request]);

  function settle(granted: boolean) {
    if (pending) pending.resolve(granted);
    setPending(null);
  }

  return (
    <Ctx.Provider value={request}>
      {children}
      <AnimatePresence>
        {pending && (
          <Dialog
            initialStatus={pending.initialStatus}
            onResolved={() => settle(true)}
            onCancel={() => settle(false)}
          />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function useRequestSymlinkPrivilege(): RequestFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRequestSymlinkPrivilege must be used inside <DeveloperModePromptProvider>");
  return ctx;
}

interface DialogProps {
  initialStatus: SymlinkStatus;
  onResolved: () => void;
  onCancel: () => void;
}

function Dialog({ initialStatus, onResolved, onCancel }: DialogProps) {
  const [status, setStatus] = useState<SymlinkStatus>(initialStatus);
  const [opening, setOpening] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  /** Once the user has clicked "Open Settings" we start polling. */
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const recheck = useCallback(async () => {
    try {
      const next = await api.system.checkSymlinkPrivilege();
      setStatus(next);
      if (next.canCreateSymlinks) onResolved();
    } catch {
      // ignore — keep showing the prompt
    }
  }, [onResolved]);

  // Auto-poll the registry once the user has been sent to Settings, so the
  // dialog dismisses itself the moment they flip the toggle.
  useEffect(() => {
    if (!polling) return;
    pollRef.current = setInterval(recheck, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [polling, recheck]);

  // Re-check when the window regains focus — covers the case where the
  // user toggled the setting and Alt-Tabbed back.
  useEffect(() => {
    const onFocus = () => void recheck();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [recheck]);

  const onOpenSettings = async () => {
    setOpening(true);
    try {
      await api.system.openSettings("developers");
      setPolling(true);
    } finally {
      setOpening(false);
    }
  };

  const onRetry = async () => {
    setRechecking(true);
    try {
      await recheck();
    } finally {
      setRechecking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      tabIndex={-1}
      autoFocus
    >
      <motion.div
        initial={{ scale: 0.96, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.97, y: 6, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-lg glass-strong rounded-2xl shadow-elev overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border bg-accent-yellow/15 border-accent-yellow/30 text-accent-yellow">
            <ShieldAlert size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-text-primary">
              WebToDesktop Builder needs permission to create symbolic links
            </div>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              The build tool extracts a small Windows code-signing cache that contains symbolic
              links. Windows requires either <strong className="text-text-primary">Developer Mode</strong>
              {" "}or administrator rights for that.
            </p>

            <ol className="mt-4 space-y-2 text-xs text-text-secondary leading-relaxed list-decimal pl-5">
              <li>
                Click <strong className="text-text-primary">Open Windows Settings</strong> below — it
                jumps straight to the right page.
              </li>
              <li>
                In the Settings window, find <strong className="text-text-primary">Developer Mode</strong>
                {" "}and switch it <strong className="text-text-primary">On</strong>. Windows shows a
                short warning about development features — click <strong className="text-text-primary">Yes</strong>.
              </li>
              <li>
                Come back here. WebToDesktop Builder checks automatically, then closes this dialog and runs your
                build.
              </li>
            </ol>

            <StatusRow status={status} polling={polling} />
          </div>
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary transition shrink-0 -mr-1 -mt-1"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-3.5 border-t border-border bg-white/[0.02] flex items-center justify-between gap-2">
          <Button size="sm" onClick={onCancel}>
            Not now
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRetry} disabled={rechecking}>
              {rechecking && <Loader2 size={13} className="animate-spin" />}
              Re-check
            </Button>
            <Button size="sm" variant="primary" onClick={onOpenSettings} disabled={opening}>
              {opening ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
              Open Windows Settings
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusRow({ status, polling }: { status: SymlinkStatus; polling: boolean }) {
  if (status.canCreateSymlinks) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-accent-green">
        <CheckCircle2 size={14} />
        <span>Permission granted — closing…</span>
      </div>
    );
  }
  return (
    <div className="mt-4 text-[11px] text-text-muted flex items-center gap-2">
      <span
        className={
          "inline-block w-1.5 h-1.5 rounded-full " +
          (polling ? "bg-accent-yellow animate-pulse" : "bg-text-muted/50")
        }
      />
      <span>
        {polling
          ? "Watching for the toggle… you can leave this open."
          : "Developer Mode is currently off."}
      </span>
    </div>
  );
}
