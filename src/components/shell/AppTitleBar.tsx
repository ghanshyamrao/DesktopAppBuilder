import { useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Minus, Square, Copy as CopyIcon, X as CloseIcon } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Convert the renderer's RGB-triplet CSS variable (e.g. "247 248 252") into
 * the `#rrggbb` form `setTitleBarOverlay` expects. Falls back to a safe
 * dark/light default if the variable can't be read yet.
 */
function readThemeVarHex(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
  const hex = parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

/**
 * Sync the Windows native min/max/close overlay region to match the active
 * theme's surface and text colors. Without this, switching to light theme
 * leaves a black caption-button strip on a white title bar.
 *
 * Re-runs whenever the renderer's `appearance` setting flips. On non-Windows
 * platforms the IPC handler is a no-op so the call is cheap to spam.
 */
function pushOverlayColors(): void {
  const bg = readThemeVarHex("--bg", "#0B0E13");
  const fg = readThemeVarHex("--text-primary", "#E5E7EB");
  api.window.setTitleBarOverlay(bg, fg).catch(() => {
    // Best-effort — non-Windows or window already closed.
  });
}

/**
 * Custom top chrome that replaces the default Electron frame.
 *
 * Layout:
 *   Row 1 (32px) — app icon + product name. The 140px on the far right is
 *     reserved for Windows' native min/max/close, painted by
 *     `titleBarOverlay` in main.ts. The renderer's drag region is everything
 *     except interactive elements (which opt out with .no-drag).
 *   Row 2 (30px) — File / Edit / View / Account / Window / Help dropdowns
 *     built with Radix so we get keyboard navigation + focus management.
 *
 * On non-Windows platforms there is no `titleBarOverlay`, so we render
 * fallback min/max/close buttons in row 1 instead.
 */
export default function AppTitleBar() {
  const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);
  const [maximized, setMaximized] = useState(false);
  // Subscribed to the theme setting so we can repaint the native overlay
  // region the moment the user flips dark ⇄ light from Settings.
  const appearance = useAppStore((s) => s.settings?.appearance);

  // Sync the maximize glyph with the actual window state — the user can
  // toggle it from outside our control (snap layouts, double-click drag
  // region, OS shortcut), so we listen for the broadcast from main.ts.
  useEffect(() => {
    api.window.isMaximized().then((r) => setMaximized(r.maximized)).catch(() => {});
    const off = window.w2a.window.onStateChange((s) => setMaximized(s.maximized));
    return off;
  }, []);

  // Repaint the native overlay every time the theme tokens change. The
  // applyTheme() call in App.tsx mutates `data-theme` before we read the
  // computed style, so we wait one rAF to let the CSS variables flush.
  // Push on mount too (even before settings load) so the first paint is
  // already in the right palette — main.ts seeds with a dark default.
  useEffect(() => {
    const raf = requestAnimationFrame(pushOverlayColors);
    return () => cancelAnimationFrame(raf);
  }, [appearance?.mode, appearance?.customAccent]);
  useEffect(() => {
    pushOverlayColors();
  }, []);

  return (
    <div
      className="shrink-0 select-none bg-bg border-b border-border app-drag relative z-30"
      style={{ WebkitUserSelect: "none" } as React.CSSProperties}
    >
      {/* ── Row 1: identity + (native or fallback) window controls ──────── */}
      <div className="h-8 flex items-center px-3 gap-2">
        <img src={logo} alt="" className="w-4 h-4 rounded-[3px] shrink-0" />
        <span className="text-[12px] font-medium text-text-secondary truncate">
          WebToDesktop Builder
        </span>

        <div className="flex-1" />

        {/* Native overlay on Windows handles min/max/close. On Mac/Linux,
            paint our own to stay frameless without losing the controls. */}
        {!isWindows && (
          <div className="flex items-center gap-0.5 no-drag">
            <CtlBtn label="Minimize" onClick={() => api.window.minimize()}>
              <Minus size={13} />
            </CtlBtn>
            <CtlBtn
              label={maximized ? "Restore" : "Maximize"}
              onClick={() => api.window.toggleMaximize().then((r) => setMaximized(r.maximized))}
            >
              {maximized ? <CopyIcon size={11} /> : <Square size={10} />}
            </CtlBtn>
            <CtlBtn label="Close" danger onClick={() => api.window.close()}>
              <CloseIcon size={13} />
            </CtlBtn>
          </div>
        )}

        {/* Reserve the titleBarOverlay region on Windows (140×32) so our
            content never collides with native min/max/close. */}
        {isWindows && <div className="w-[140px] h-8 shrink-0" aria-hidden />}
      </div>

      {/* ── Row 2: menu strip ──────────────────────────────────────────── */}
      <div className="h-[28px] flex items-center px-2 gap-0.5">
        <MenuStrip />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
   Menu strip
---------------------------------------------------------------------- */

function MenuStrip() {
  const navigate = useAppStore((s) => s.navigate);
  const togglePalette = useAppStore((s) => s.togglePalette);
  const toggleConsole = useAppStore((s) => s.toggleConsole);

  return (
    <>
      <MenuButton label="File">
        <MenuItem label="New App" shortcut="Ctrl+N" onSelect={() => navigate({ name: "wizard" })} />
        <MenuItem label="Open Apps" onSelect={() => navigate({ name: "dashboard" })} />
        <MenuSeparator />
        <MenuItem label="Settings" onSelect={() => navigate({ name: "settings" })} />
        <MenuSeparator />
        <MenuItem label="Exit" onSelect={() => api.window.close()} />
      </MenuButton>

      <MenuButton label="Edit">
        <MenuItem
          label="Undo"
          shortcut="Ctrl+Z"
          onSelect={() => document.execCommand("undo")}
        />
        <MenuItem
          label="Redo"
          shortcut="Ctrl+Y"
          onSelect={() => document.execCommand("redo")}
        />
        <MenuSeparator />
        <MenuItem label="Cut" shortcut="Ctrl+X" onSelect={() => document.execCommand("cut")} />
        <MenuItem label="Copy" shortcut="Ctrl+C" onSelect={() => document.execCommand("copy")} />
        <MenuItem label="Paste" shortcut="Ctrl+V" onSelect={() => document.execCommand("paste")} />
      </MenuButton>

      <MenuButton label="View">
        <MenuItem label="Command Palette" shortcut="Ctrl+K" onSelect={togglePalette} />
        <MenuItem label="Toggle Console" shortcut="Ctrl+`" onSelect={toggleConsole} />
        <MenuSeparator />
        <MenuItem label="Reload" shortcut="Ctrl+R" onSelect={() => api.window.reload()} />
        <MenuItem label="Developer Tools" shortcut="F12" onSelect={() => api.window.toggleDevTools()} />
      </MenuButton>

      <AccountMenu />

      <MenuButton label="Window">
        <MenuItem label="Minimize" onSelect={() => api.window.minimize()} />
        <MenuItem
          label="Maximize / Restore"
          onSelect={() => api.window.toggleMaximize()}
        />
        <MenuSeparator />
        <MenuItem label="Close" onSelect={() => api.window.close()} />
      </MenuButton>

      <MenuButton label="Help">
        <MenuItem
          label="Documentation"
          onSelect={() => useAppStore.getState().setDocsOpen(true)}
        />
        <MenuItem
          label="Keyboard Shortcuts"
          onSelect={() => useAppStore.getState().setDocsOpen(true)}
        />
        <MenuItem
          label="Email Support"
          onSelect={() => window.open("mailto:ghanshyamrao@toodesktop.com", "_blank")}
        />
        <MenuSeparator />
        <MenuItem
          label="About WebToDesktop Builder"
          onSelect={() => useAppStore.getState().setAboutOpen(true)}
        />
      </MenuButton>
    </>
  );
}

/**
 * The Account menu's items differ based on whether the user is signed in.
 * The title bar lives outside <AuthGate>, so we read auth state directly
 * rather than via useAuth() (which would throw before the gate is ready).
 */
function AccountMenu() {
  const navigate = useAppStore((s) => s.navigate);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      api.auth
        .status()
        .then((s) => { if (!cancelled) setUser(s.user); })
        .catch(() => { if (!cancelled) setUser(null); });
    refresh();
    // Refresh on window focus — covers post-sign-in / sign-out transitions
    // initiated by AuthGate without needing a shared store.
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <MenuButton label="Account">
      {user ? (
        <>
          <div className="px-2.5 py-1.5 text-[11px] text-text-muted truncate max-w-[220px]">
            {user.name ?? user.email ?? "Signed in"}
          </div>
          <MenuSeparator />
          <MenuItem label="Settings" onSelect={() => navigate({ name: "settings" })} />
          <MenuItem
            label="Sign Out"
            danger
            onSelect={() => {
              api.auth.signOut().then(() => setUser(null)).catch(() => {});
            }}
          />
        </>
      ) : (
        <div className="px-2.5 py-1.5 text-[11px] text-text-muted">Not signed in</div>
      )}
    </MenuButton>
  );
}

/* ----------------------------------------------------------------------
   Radix wrappers
---------------------------------------------------------------------- */

function MenuButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "no-drag h-[22px] px-2 rounded text-[12px] text-text-secondary",
            "hover:bg-white/[0.06] hover:text-text-primary transition",
            "data-[state=open]:bg-white/[0.08] data-[state=open]:text-text-primary outline-none",
          )}
        >
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="start"
          className={cn(
            "z-[500] min-w-[220px] rounded-lg border border-border bg-bg-panel/95 backdrop-blur-xl",
            "shadow-elev p-1 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  label,
  shortcut,
  onSelect,
  danger,
}: {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={() => onSelect?.()}
      className={cn(
        "px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 cursor-default outline-none transition",
        "data-[highlighted]:bg-white/[0.06]",
        danger ? "text-accent-red data-[highlighted]:bg-accent-red/10" : "text-text-primary",
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <span className="text-[10px] text-text-muted font-mono">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

function MenuSeparator() {
  return <DropdownMenu.Separator className="h-px bg-border my-1" />;
}

/* ----------------------------------------------------------------------
   Fallback caption buttons (non-Windows only)
---------------------------------------------------------------------- */

function CtlBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-7 w-10 inline-flex items-center justify-center text-text-secondary rounded",
        "hover:bg-white/[0.06] hover:text-text-primary transition",
        danger && "hover:bg-accent-red hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
