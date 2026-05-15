import { spawnSync } from "node:child_process";

export interface SymlinkPrivilegeStatus {
  /** Whether we can almost certainly create symbolic links right now. */
  canCreateSymlinks: boolean;
  /** True if Windows Developer Mode is enabled (registry probe). */
  developerMode: boolean;
  /** True if the current process is running elevated. */
  elevated: boolean;
  /** Set when not running on Windows — feature isn't applicable. */
  notApplicable: boolean;
  /** Diagnostic detail useful for the UI / logs. */
  detail: string;
}

const IS_WIN = process.platform === "win32";

/**
 * Probe whether the current Windows session has the privilege to create
 * symbolic links. We treat two conditions as sufficient:
 *
 *   1. The "AllowDevelopmentWithoutDevLicense" registry key is 1 — i.e.
 *      Developer Mode is on. Microsoft grants SeCreateSymbolicLinkPrivilege
 *      to non-admin users when this is set.
 *   2. The current process is running elevated (admin), via the
 *      `net session` probe (only succeeds for admins).
 *
 * Either makes electron-builder's winCodeSign extraction work without the
 * "A required privilege is not held by the client" error.
 */
export function probeSymlinkPrivilege(): SymlinkPrivilegeStatus {
  if (!IS_WIN) {
    return {
      canCreateSymlinks: true,
      developerMode: false,
      elevated: false,
      notApplicable: true,
      detail: `${process.platform} — Windows symlink privilege check skipped.`,
    };
  }

  const developerMode = readDeveloperMode();
  const elevated = isElevated();
  const canCreateSymlinks = developerMode || elevated;

  let detail: string;
  if (canCreateSymlinks) {
    detail = elevated
      ? "Running elevated — symbolic links allowed."
      : "Windows Developer Mode is on — symbolic links allowed.";
  } else {
    detail =
      "Windows Developer Mode is off and this app is not running as administrator. " +
      "electron-builder's tooling cache extraction will fail with " +
      "'A required privilege is not held by the client'.";
  }

  return {
    canCreateSymlinks,
    developerMode,
    elevated,
    notApplicable: false,
    detail,
  };
}

function readDeveloperMode(): boolean {
  // HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock
  //   AllowDevelopmentWithoutDevLicense  REG_DWORD  0x1 when Developer Mode on
  const result = spawnSync(
    "reg",
    [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock",
      "/v",
      "AllowDevelopmentWithoutDevLicense",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) return false;
  // Output line looks like:
  //   AllowDevelopmentWithoutDevLicense    REG_DWORD    0x1
  const match = /AllowDevelopmentWithoutDevLicense\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(
    result.stdout,
  );
  if (!match) return false;
  return parseInt(match[1], 16) === 1;
}

function isElevated(): boolean {
  // `net session` requires admin privileges; non-admins get exit code 2.
  // It's faster and more reliable than firing up PowerShell for an SID check.
  const result = spawnSync("net", ["session"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}
