import { AnimatePresence, motion } from "framer-motion";
import { Github, Mail, User, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAppStore } from "@/store/appStore";

const HELP_EMAIL = "ghanshyamrao@toodesktop.com";
const DEVELOPER = "Ghanshyam Rao";

/**
 * "About WebToDesktop Builder" surface — version, developer, support contact.
 * Built as a centered modal (matches Confirm.tsx's vocabulary) and mounted
 * at the App root so it overlays any route.
 */
export default function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen);
  const close = () => useAppStore.getState().setAboutOpen(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-[260] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={close}
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
          tabIndex={-1}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 6, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="w-full max-w-md glass-strong rounded-2xl shadow-elev overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-6 pt-8 pb-5 flex flex-col items-center text-center">
              <button
                onClick={close}
                aria-label="Close"
                className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition"
              >
                <X size={16} />
              </button>

              <img
                src={logo}
                alt=""
                className="w-16 h-16 rounded-2xl shadow-elev ring-1 ring-white/10 mb-4"
              />
              <h2 id="about-title" className="text-lg font-semibold text-text-primary">
                WebToDesktop Builder
              </h2>
              <p className="text-xs text-text-muted mt-1">Version {__APP_VERSION__}</p>
              <p className="mt-3 text-[12.5px] text-text-secondary leading-relaxed max-w-sm">
                Convert any website into a polished Windows desktop app — installer, system tray,
                native window controls. No code required.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-border bg-white/[0.02] space-y-3">
              <InfoRow
                icon={<User size={14} />}
                label="Developer"
                value={DEVELOPER}
              />
              <InfoRow
                icon={<Mail size={14} />}
                label="Support"
                value={
                  <a
                    href={`mailto:${HELP_EMAIL}`}
                    className="text-accent-blue hover:underline"
                  >
                    {HELP_EMAIL}
                  </a>
                }
              />
              <InfoRow
                icon={<Github size={14} />}
                label="Source"
                value={
                  <a
                    href="https://github.com/web2desktop"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-blue hover:underline"
                  >
                    github.com/web2desktop
                  </a>
                }
              />
            </div>

            <div className="px-6 py-3 border-t border-border text-[10.5px] text-text-muted text-center">
              © {new Date().getFullYear()} {DEVELOPER}. All rights reserved.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[12.5px]">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-bg-elev border border-border text-text-secondary shrink-0">
        {icon}
      </span>
      <span className="text-text-muted w-20 shrink-0">{label}</span>
      <span className="text-text-primary truncate">{value}</span>
    </div>
  );
}
