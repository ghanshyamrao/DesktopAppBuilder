import type { ActionsConfig } from "@/types";

export const DEFAULT_ACTIONS: ActionsConfig = {
  tray: true,
  minimizeToTray: false,
  singleInstance: true,
  startupLaunch: false,
  applicationMenu: true,
  notifications: true,
  deepLinkProtocol: "",
  globalShortcuts: [],
};

export function withDefaults(actions: ActionsConfig | undefined | null): ActionsConfig {
  return { ...DEFAULT_ACTIONS, ...(actions ?? {}) };
}

const ACCEL_RE = /^([A-Za-z0-9]|F\d{1,2}|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc)$/;

/**
 * Validate an Electron accelerator. Accepts CmdOrCtrl/Cmd/Ctrl/Alt/Shift/Super
 * modifiers separated by `+`, then exactly one key.
 */
export function isValidAccelerator(s: string): boolean {
  if (!s) return false;
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const key = parts[parts.length - 1];
  if (!ACCEL_RE.test(key)) return false;
  const mods = parts.slice(0, -1);
  for (const m of mods) {
    if (!/^(CmdOrCtrl|Cmd|Ctrl|Alt|Option|Shift|Super|Meta)$/.test(m)) return false;
  }
  return mods.length > 0; // at least one modifier required for global shortcuts to be safe
}
