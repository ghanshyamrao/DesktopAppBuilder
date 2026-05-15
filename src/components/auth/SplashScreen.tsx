import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";

interface Props {
  onContinue: () => void;
}

/**
 * One-time post-install welcome card. Compact centered surface — brand,
 * one-line pitch, three feature blurbs, and a Get-Started CTA.
 * Dismissed once via firstRun.acknowledge() and never shown again.
 */
export default function SplashScreen({ onContinue }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-[300] flex items-center justify-center p-10 bg-bg overflow-hidden"
    >
      {/* Soft radial backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[820px] h-[820px] rounded-full bg-accent-blue/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[520px] h-[520px] rounded-full bg-accent-green/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ scale: 0.97, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl glass-strong rounded-3xl shadow-elev p-10 text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-[11px] font-semibold uppercase tracking-wider mb-6">
          <Sparkles size={11} />
          Welcome
        </div>

        <motion.img
          src={logo}
          alt="WebToDesktop Builder"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-16 h-16 mx-auto mb-5 rounded-2xl object-contain shadow-elev ring-1 ring-white/10"
        />

        <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-2">
          Welcome to WebToDesktop Builder
        </h1>
        <p className="text-text-secondary text-[13px] leading-relaxed max-w-md mx-auto">
          Wrap any website into a polished Windows desktop app — installer, system tray,
          native window controls. No code required.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-3 text-left">
          <Feature title="Build" body="Generate signed .exe installers from any URL." />
          <Feature title="Customize" body="Themes, icons, splash, system tray, hotkeys." />
          <Feature title="Distribute" body="One-click GitHub release publishing." />
        </div>

        <button
          onClick={onContinue}
          className="mt-9 inline-flex items-center gap-2 px-6 h-11 rounded-xl bg-accent-blue text-white text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-accent-blue/30"
        >
          Get started
          <ArrowRight size={15} />
        </button>

        <p className="mt-4 text-[11px] text-text-muted">
          You'll sign in with Google on the next step.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-3.5">
      <div className="text-[12px] font-semibold text-text-primary mb-1">{title}</div>
      <div className="text-[11px] text-text-secondary leading-snug">{body}</div>
    </div>
  );
}
