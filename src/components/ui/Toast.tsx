import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "loading";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

/** Returned by `toast.loading()` so the caller can transition the SAME toast
 *  from spinner → success/error in place instead of stacking a new one. */
export interface LoadingHandle {
  update: (patch: { tone?: ToastTone; title?: string; body?: string }) => void;
  success: (title: string, body?: string) => void;
  error:   (title: string, body?: string) => void;
  dismiss: () => void;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => number;
  success: (title: string, body?: string) => void;
  error:   (title: string, body?: string) => void;
  info:    (title: string, body?: string) => void;
  /** Show an indeterminate-progress toast and return a handle that lets the
   *  caller flip it to success/error when the awaited work resolves. */
  loading: (title: string, body?: string) => LoadingHandle;
}

const Ctx = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // `push` must return the new id synchronously (callers like `loading`
  // need it to build a handle), so we allocate the id outside the
  // setter and use a functional update for state.
  const push: ToastApi["push"] = useCallback((t) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...t, id }]);
    return id;
  }, []);

  const update = useCallback((id: number, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api: ToastApi = {
    push,
    success: (title, body) => { push({ tone: "success", title, body }); },
    error:   (title, body) => { push({ tone: "error",   title, body }); },
    info:    (title, body) => { push({ tone: "info",    title, body }); },
    loading: (title, body) => {
      const id = push({ tone: "loading", title, body });
      return {
        update:  (patch) => update(id, patch),
        success: (t, b)  => update(id, { tone: "success", title: t, body: b }),
        error:   (t, b)  => update(id, { tone: "error",   title: t, body: b }),
        dismiss: ()      => dismiss(id),
      };
    },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <Viewport toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function Viewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const TONE_ICON: Record<ToastTone, JSX.Element> = {
  success: <CheckCircle2 size={15} />,
  error:   <AlertCircle  size={15} />,
  info:    <Info         size={15} />,
  loading: <Loader2      size={15} className="animate-spin" />,
};
const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-accent-green/40 text-accent-green",
  error:   "border-accent-red/50 text-accent-red",
  info:    "border-accent-blue/40 text-accent-blue",
  loading: "border-accent-blue/40 text-accent-blue",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Auto-dismiss after 5s for success/info, 8s for errors. Loading toasts
  // wait indefinitely — the caller will flip the tone to success/error
  // when work completes, which re-runs this effect and arms the timer.
  useEffect(() => {
    if (toast.tone === "loading") return;
    const t = setTimeout(onDismiss, toast.tone === "error" ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [onDismiss, toast.tone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative overflow-hidden pointer-events-auto w-[340px] glass-strong rounded-lg shadow-elev border-l-2 px-3.5 py-3 flex items-start gap-2.5",
        TONE_CLASS[toast.tone],
      )}
    >
      <span className="shrink-0 mt-0.5">{TONE_ICON[toast.tone]}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-text-primary truncate">{toast.title}</div>
        {toast.body && <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">{toast.body}</div>}
      </div>
      <button onClick={onDismiss} className="text-text-muted hover:text-text-primary transition shrink-0 -mr-1" aria-label="Dismiss">
        <X size={14} />
      </button>
      {/* Indeterminate progress strip. Only renders while the toast is
          still in the loading state; the caller will swap the tone to
          success/error when work completes, which removes this line. */}
      {toast.tone === "loading" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-lg">
          <div className="h-full bg-gradient-to-r from-accent-blue via-accent-violet to-accent-blue bg-[length:200%_100%] animate-shimmer" />
        </div>
      )}
    </motion.div>
  );
}
