import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge tailwind classes safely — later wins, conditional values supported. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(day / 365);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Coerce any common GitHub repo input into the canonical `owner/repo`.
 * Accepts:
 *   - "owner/repo"
 *   - "https://github.com/owner/repo"
 *   - "https://github.com/owner/repo/"
 *   - "https://github.com/owner/repo.git"
 *   - "git@github.com:owner/repo.git"
 *   - "github.com/owner/repo"
 * Returns null if nothing recognizable can be extracted.
 */
export function normalizeGithubRepo(raw: string): string | null {
  const s = raw.trim().replace(/\.git$/i, "").replace(/\/+$/g, "");
  if (!s) return null;

  // git@github.com:owner/repo
  const sshMatch = s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+)$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  // https?://github.com/owner/repo  or  github.com/owner/repo
  const urlMatch = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/|$)/i);
  if (urlMatch) return `${urlMatch[1]}/${urlMatch[2]}`;

  // owner/repo (with no scheme/host)
  const bareMatch = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (bareMatch) return `${bareMatch[1]}/${bareMatch[2]}`;

  return null;
}

export function platformLabel(p: string): string {
  switch (p) {
    case "win":
      return "Windows";
    case "mac":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return p;
  }
}
