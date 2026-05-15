import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions (delete, etc) — uses red accent. */
  tone?: "danger" | "default";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm: ConfirmFn = useCallback(
    (opts) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  function settle(value: boolean) {
    if (pending) pending.resolve(value);
    setPending(null);
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {pending && <Dialog opts={pending} onSettle={settle} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

function Dialog({ opts, onSettle }: { opts: PendingConfirm; onSettle: (v: boolean) => void }) {
  const danger = opts.tone === "danger";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={() => onSettle(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onSettle(false);
        if (e.key === "Enter") onSettle(true);
      }}
      tabIndex={-1}
      autoFocus
    >
      <motion.div
        initial={{ scale: 0.95, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.97, y: 6, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md glass-strong rounded-2xl shadow-elev overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex items-start gap-4">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              danger
                ? "bg-accent-red/15 border-accent-red/30 text-accent-red"
                : "bg-accent-blue/15 border-accent-blue/30 text-accent-blue",
            )}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-text-primary">{opts.title}</div>
            {opts.body && (
              <div className="text-xs text-text-secondary mt-1.5 leading-relaxed">{opts.body}</div>
            )}
          </div>
          <button
            onClick={() => onSettle(false)}
            className="text-text-muted hover:text-text-primary transition shrink-0 -mr-1 -mt-1"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-3 border-t border-border bg-white/[0.02] flex items-center justify-end gap-2">
          <Button size="sm" onClick={() => onSettle(false)}>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            size="sm"
            variant={danger ? "danger" : "primary"}
            onClick={() => onSettle(true)}
            autoFocus
          >
            {opts.confirmLabel ?? (danger ? "Delete" : "Confirm")}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
