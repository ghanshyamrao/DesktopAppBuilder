import { useState } from "react";
import { Code2, FileCode, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  customCss?: string;
  customJs?: string;
  /** Either field changes — caller should debounce or accept frequent updates. */
  onChange: (next: { customCss?: string; customJs?: string }) => void;
}

type Tab = "css" | "js";

const CSS_PLACEHOLDER = `/* Inject CSS into the wrapped page after dom-ready.
   Examples:
     body { background: #0d0d0d; }
     [data-ad], .promo, #cookie-banner { display: none !important; }
*/`;

const JS_PLACEHOLDER = `// Inject JS into the wrapped page after dom-ready.
// Wrapped automatically in an IIFE + try/catch — safe to write top-level vars.
//
//   document.addEventListener("keydown", (e) => {
//     if (e.ctrlKey && e.key === "k") console.log("captured");
//   });`;

export default function CustomCodeEditor({ customCss, customJs, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("css");
  const [collapsed, setCollapsed] = useState(!customCss && !customJs);

  const cssLines = (customCss ?? "").split("\n").length;
  const jsLines = (customJs ?? "").split("\n").length;
  const hasJs = !!(customJs ?? "").trim();
  const hasCss = !!(customCss ?? "").trim();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center justify-between p-4 rounded-xl bg-bg-input/40 border border-border hover:border-border-strong hover:bg-bg-input/70 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-violet/10 border border-accent-violet/30 text-accent-violet flex items-center justify-center">
            <Code2 size={14} />
          </div>
          <div>
            <div className="text-sm font-medium">Custom CSS &amp; JS</div>
            <div className="text-xs text-text-secondary mt-0.5">
              Inject styles or scripts into the wrapped page — dark-mode any site, hide ads, add shortcuts.
            </div>
          </div>
        </div>
        <ChevronRight size={16} className="text-text-muted shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-input/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-input/60">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "css"} onClick={() => setTab("css")} icon={<FileCode size={12} />} label="CSS" badge={hasCss ? `${cssLines} lines` : undefined} />
          <TabButton active={tab === "js"}  onClick={() => setTab("js")}  icon={<Code2 size={12} />}    label="JS"  badge={hasJs ? `${jsLines} lines` : undefined} />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-2xs uppercase tracking-wider text-text-muted hover:text-text-primary transition"
        >
          Hide
        </button>
      </div>

      {tab === "css" && (
        <textarea
          value={customCss ?? ""}
          onChange={(e) => onChange({ customCss: e.target.value, customJs })}
          placeholder={CSS_PLACEHOLDER}
          spellCheck={false}
          rows={10}
          className="w-full bg-bg-card/60 text-text-primary font-mono text-xs leading-relaxed p-3 resize-y outline-none focus:bg-bg-card/80 transition"
        />
      )}

      {tab === "js" && (
        <>
          <textarea
            value={customJs ?? ""}
            onChange={(e) => onChange({ customCss, customJs: e.target.value })}
            placeholder={JS_PLACEHOLDER}
            spellCheck={false}
            rows={10}
            className="w-full bg-bg-card/60 text-text-primary font-mono text-xs leading-relaxed p-3 resize-y outline-none focus:bg-bg-card/80 transition"
          />
          {hasJs && (
            <div className="flex items-start gap-2 p-3 border-t border-border bg-accent-yellow/5 text-accent-yellow text-xs">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                This JS runs inside the wrapped page with the same privileges. Don't paste code from
                untrusted sources — it can read auth cookies and modify the DOM.
              </span>
            </div>
          )}
        </>
      )}

      <div className={cn("px-3 py-2 text-2xs text-text-muted border-t border-border", "flex items-center justify-between")}>
        <span>Injected after dom-ready · re-applied on every navigation</span>
        <span className="font-mono">
          {tab === "css" ? `userStyles.css` : `userScript.js`}
        </span>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-md text-xs inline-flex items-center gap-1.5 transition",
        active ? "bg-bg-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      <span>{label}</span>
      {badge && <span className="text-2xs text-text-muted">· {badge}</span>}
    </button>
  );
}
