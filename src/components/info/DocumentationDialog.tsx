import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BookOpen, Keyboard, Mail, Rocket, Sparkles, Wrench, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAppStore } from "@/store/appStore";

const HELP_EMAIL = "ghanshyamrao@toodesktop.com";

/**
 * In-app quick-start guide. The Help menu's "Documentation" entry points
 * here. Sections mirror the order a new user discovers the app:
 *   1. Create your first build (the happy path)
 *   2. Customize the shell (theme / icon / splash)
 *   3. Power features (AI assistant, recipes)
 *   4. Keyboard shortcuts
 *   5. Where to get help
 *
 * Mounted at the App root so it overlays any route.
 */
export default function DocumentationDialog() {
  const open = useAppStore((s) => s.docsOpen);
  const close = () => useAppStore.getState().setDocsOpen(false);

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
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 6, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="docs-title"
            className="w-full max-w-3xl max-h-[80vh] glass-strong rounded-2xl shadow-elev overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
                <BookOpen size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="docs-title" className="text-[15px] font-semibold text-text-primary">
                  Documentation
                </h2>
                <p className="text-[11.5px] text-text-muted">
                  Quick-start guide and keyboard shortcuts.
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="text-text-muted hover:text-text-primary transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <Section
                icon={<Rocket size={14} />}
                title="1. Create your first app"
                body={
                  <ol className="list-decimal pl-5 space-y-1.5">
                    <li>Click <strong>New App</strong> in the Dashboard or press <Kbd>Ctrl</Kbd>+<Kbd>N</Kbd>.</li>
                    <li>Paste the URL of the website you want to wrap.</li>
                    <li>Pick an icon (auto-fetched from the site's favicon, or upload your own).</li>
                    <li>Hit <strong>Build</strong> — a signed Windows installer drops into the project's <code>release/</code> folder.</li>
                  </ol>
                }
              />

              <Section
                icon={<Wrench size={14} />}
                title="2. Customize the shell"
                body={
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Theme Builder</strong> — swap accent colors, surfaces, and corner radii. Preview live before applying.</li>
                    <li><strong>Action Builder</strong> — define tray menu items, global hotkeys, and notifications.</li>
                    <li><strong>App Studio</strong> — drop in custom CSS/JS that runs against the wrapped page (auto-fill forms, hide nav, inject branding).</li>
                  </ul>
                }
              />

              <Section
                icon={<Sparkles size={14} />}
                title="3. Power features"
                body={
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>AI Assistant</strong> — describe what you're wrapping and the assistant suggests a theme, icon, and recipes.</li>
                    <li><strong>Recipe Marketplace</strong> — drop-in plugins for offline cache, system tray, hotkeys.</li>
                    <li><strong>Deploy</strong> — one-click publish a GitHub release with auto-update wired in.</li>
                  </ul>
                }
              />

              <Section
                icon={<Keyboard size={14} />}
                title="4. Keyboard shortcuts"
                body={
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <ShortcutRow keys={["Ctrl", "K"]} label="Command palette" />
                    <ShortcutRow keys={["Ctrl", "N"]} label="New app" />
                    <ShortcutRow keys={["Ctrl", "`"]} label="Toggle console" />
                    <ShortcutRow keys={["Ctrl", "R"]} label="Reload window" />
                    <ShortcutRow keys={["Ctrl", "J"]} label="Open AI Assistant" />
                    <ShortcutRow keys={["F12"]} label="Developer tools" />
                  </div>
                }
              />

              <Section
                icon={<Mail size={14} />}
                title="5. Need help?"
                body={
                  <p className="leading-relaxed">
                    Email us at{" "}
                    <a href={`mailto:${HELP_EMAIL}`} className="text-accent-blue hover:underline">
                      {HELP_EMAIL}
                    </a>{" "}
                    with the project ID and a copy of the build log (visible in the bottom console).
                    We typically reply within one business day.
                  </p>
                }
              />
            </div>

            <div className="px-6 py-3 border-t border-border bg-white/[0.02] flex items-center justify-between">
              <span className="text-[11px] text-text-muted">
                More on{" "}
                <a
                  href="https://github.com/web2desktop"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-blue hover:underline inline-flex items-center gap-0.5"
                >
                  GitHub
                  <ArrowUpRight size={11} />
                </a>
              </span>
              <button
                onClick={close}
                className="px-3 h-7 rounded-md text-xs font-medium bg-bg-elev border border-border text-text-primary hover:bg-white/[0.04] transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-elev border border-border text-text-secondary">
          {icon}
        </span>
        <h3 className="text-[13.5px] font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="text-[12.5px] text-text-secondary leading-relaxed pl-8">{body}</div>
    </section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 h-5 rounded border border-border bg-bg-elev text-[10.5px] font-mono text-text-primary mx-0.5">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-text-secondary text-[12px]">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}
