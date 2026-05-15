import { useEffect, useState } from "react";
import type { AppProject } from "@/types";
import { api } from "@/lib/api";

/**
 * Module-scoped cache of icon data URLs keyed by `${id}:${iconPath}` so that:
 *   - re-renders don't re-fetch (cards/list rows remount during filters etc.)
 *   - changing a project's icon (different iconPath) busts the cache because
 *     the key changes.
 *
 * Trade-off: this lives in memory only — a hard refresh re-fetches all
 * icons. Acceptable for typical project counts (<50).
 */
const iconCache = new Map<string, string | null>();

/** Returns a data: URL for the project's icon, or null while loading or if
 *  the project has no iconPath / the read failed. */
export function useProjectIcon(project: AppProject): string | null {
  const key = `${project.id}:${project.iconPath ?? ""}`;
  const [url, setUrl] = useState<string | null>(() => iconCache.get(key) ?? null);

  useEffect(() => {
    if (!project.iconPath) { setUrl(null); return; }
    if (iconCache.has(key)) {
      setUrl(iconCache.get(key) ?? null);
      return;
    }
    let cancelled = false;
    api.projects.getIconDataUrl(project.id).then((dataUrl) => {
      if (cancelled) return;
      iconCache.set(key, dataUrl);
      setUrl(dataUrl);
    }).catch(() => {
      iconCache.set(key, null);
      if (!cancelled) setUrl(null);
    });
    return () => { cancelled = true; };
  }, [key, project.id, project.iconPath]);

  return url;
}
