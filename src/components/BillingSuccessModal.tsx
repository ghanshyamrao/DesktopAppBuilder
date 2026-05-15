import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SubscriptionSummary } from "@/types";

interface Props {
  /** Set to the freshly-activated subscription summary, or null to hide. */
  subscription: SubscriptionSummary | null;
  onDismiss: () => void;
  onOpenBilling: () => void;
}

/**
 * Post-Paddle-checkout success popup. Shown once when the renderer sees
 * the subscription flip from inactive → active (i.e. the deep-link
 * handler in main has just applied a paid session).
 *
 * Plan-aware copy: trial / monthly / lifetime each get a tailored CTA so
 * the user knows what they unlocked and where to go next.
 */
export default function BillingSuccessModal({ subscription, onDismiss, onOpenBilling }: Props) {
  const visible = !!subscription;

  return (
    <AnimatePresence>
      {visible && subscription && (
        <motion.div
          key="billing-success"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={onDismiss}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 6, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md glass-strong rounded-2xl shadow-elev overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center relative">
              <button
                onClick={onDismiss}
                className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-accent-green/15 border border-accent-green/30 text-accent-green">
                <CheckCircle2 size={28} />
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-[10px] font-semibold uppercase tracking-wider mb-3">
                <Sparkles size={10} />
                Payment confirmed
              </div>

              <h2 className="text-lg font-semibold text-text-primary tracking-tight">
                {welcomeTitle(subscription)}
              </h2>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-sm mx-auto">
                {welcomeBody(subscription)}
              </p>

              <ul className="mt-5 grid gap-1.5 text-left text-xs text-text-secondary max-w-sm mx-auto">
                {welcomeBullets(subscription).map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="text-accent-green shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-6 py-4 border-t border-border bg-white/[0.02] flex items-center justify-between gap-2">
              <Button size="sm" onClick={onOpenBilling} leftIcon={<ExternalLink size={13} />}>
                View subscription
              </Button>
              <Button size="sm" variant="primary" onClick={onDismiss}>
                Start building
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function welcomeTitle(sub: SubscriptionSummary): string {
  if (sub.tier === "lifetime") return "Welcome to Lifetime";
  if (sub.tier === "trial")    return "Your 14-day trial has started";
  return `You're on ${sub.planLabel ?? "the Monthly plan"}`;
}

function welcomeBody(sub: SubscriptionSummary): string {
  if (sub.tier === "lifetime") {
    return "Unlimited builds forever, every premium feature, plus all future updates and new releases.";
  }
  if (sub.tier === "trial") {
    return "Three free builds and access to Action Builder for the next two weeks. Upgrade any time to unlock the rest.";
  }
  return "Five builds per day plus the full feature set. You can switch to Lifetime any time from this page.";
}

function welcomeBullets(sub: SubscriptionSummary): string[] {
  if (sub.tier === "lifetime") {
    return [
      "Unlimited builds, no daily cap",
      "Reveal output, export, GitHub publishing, code signing",
      "AI Assistant, custom CSS/JS, theme switching, notifications",
      "All future Web2Desktop updates included",
    ];
  }
  if (sub.tier === "trial") {
    return [
      "3 free builds (no daily cap)",
      "Action Builder — tray icons, hotkeys, deep links",
      "Auto-converts to Monthly at $25/mo when the trial ends",
    ];
  }
  return [
    "5 builds per day",
    "Action Builder, Theme Builder, AI Assistant, GitHub publishing",
    "Code signing + custom CSS/JS",
    "Upgrade to Lifetime for unlimited builds + reveal output",
  ];
}
