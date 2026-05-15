import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X, Terminal, Filter, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { isBuildConsoleFeatureEnabled } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { BuildLogEvent } from "@/types";

const LEVEL_TONE: Record<BuildLogEvent["level"], string> = {
  info:    "text-text-secondary",
  warn:    "text-accent-amber",
  error:   "text-accent-red",
  success: "text-accent-green",
};

export default function BottomConsole() {
  // Re-render when PostHog flags refresh so toggling a console-feature flag
  // updates this dock without a reload.
  useFeatureFlagsLoadedTick();
  const consoleEnabled = isBuildConsoleFeatureEnabled("bottomConsole");
  const showFilter = isBuildConsoleFeatureEnabled("consoleFilter");
  const showClear = isBuildConsoleFeatureEnabled("consoleClear");
  const showTabsFlag = isBuildConsoleFeatureEnabled("consoleTabs");

  const open = useAppStore((s) => s.consoleOpen);
  const setOpen = useAppStore((s) => s.setConsoleOpen);
  const liveLogs = useAppStore((s) => s.liveLogs);
  const liveProgress = useAppStore((s) => s.liveProgress);
  const route = useAppStore((s) => s.route);
  const projects = useAppStore((s) => s.projects);
  const clearLogs = useAppStore((s) => s.clearLogs);

  // All projects with a live build state — both in-flight and recently
  // finished. Stable order so tabs don't reshuffle as percentages tick.
  const trackedIds = useMemo(
    () => Object.keys(liveProgress).sort(),
    [liveProgress],
  );

  // Currently-running builds (used to decide whether to show tabs).
  const activeIds = useMemo(
    () => trackedIds.filter((id) => {
      const s = liveProgress[id]?.status;
      return s === "building" || s === "queued";
    }),
    [trackedIds, liveProgress],
  );

  // The user's explicit tab pick. Cleared when its build leaves the
  // tracked set (e.g. after the project is deleted).
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  useEffect(() => {
    if (selectedTab && !trackedIds.includes(selectedTab)) setSelectedTab(null);
  }, [trackedIds, selectedTab]);

  /**
   * Pick which project's logs to show. Order of preference:
   *   1. The user's explicit tab choice (if still tracked).
   *   2. The project we're viewing on the build page.
   *   3. The currently-running build with the highest progress.
   *   4. The most recent project — falls back to "no logs yet" cleanly.
   */
  const focusProjectId = useMemo(() => {
    if (selectedTab && trackedIds.includes(selectedTab)) return selectedTab;
    if (route.name === "build" && trackedIds.includes(route.projectId)) return route.projectId;
    if (activeIds.length) {
      return [...activeIds].sort(
        (a, b) => (liveProgress[b]?.percent ?? 0) - (liveProgress[a]?.percent ?? 0),
      )[0];
    }
    return projects[0]?.id;
  }, [selectedTab, trackedIds, route, activeIds, liveProgress, projects]);

  // Hide warn-level entries from the console — most warnings come from
  // npm install (deprecation notices) and electron-rebuild (version
  // mismatch noise) and aren't actionable from this UI. Errors and
  // progress lines are what the user actually needs to see.
  const logs = focusProjectId
    ? (liveLogs[focusProjectId] ?? []).filter((l) => l.level !== "warn")
    : [];
  const progress = focusProjectId ? liveProgress[focusProjectId] : undefined;
  const project = projects.find((p) => p.id === focusProjectId);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, open, focusProjectId]);

  // Show tabs only when there are 2+ tracked builds AND the tabs flag is on.
  // The single-line header (".. · Gmail · 86%") already conveys context when
  // tabs are hidden.
  const showTabs = showTabsFlag && trackedIds.length >= 2;

  // Bottom console can be hidden entirely via flag — render nothing rather
  // than the animated container so it doesn't leave a 0px sliver of border.
  if (!consoleEnabled) return null;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          key="console"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "var(--console-h)", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 border-t border-border bg-bg-panel/85 backdrop-blur-xl flex flex-col overflow-hidden"
        >
          {/* console header */}
          <div className="h-9 px-3 flex items-center gap-3 border-b border-border shrink-0">
            <Terminal size={13} className="text-accent-blue shrink-0" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Build Console</span>
            {!showTabs && project && (
              <span className="text-xs text-text-muted truncate">· {project.name}</span>
            )}
            {!showTabs && progress?.status === "building" && (
              <Badge tone="blue" dot className="ml-1">{progress.percent}%</Badge>
            )}
            {!showTabs && progress?.status === "success" && <Badge tone="green">Success</Badge>}
            {!showTabs && progress?.status === "error"   && <Badge tone="red">Error</Badge>}

            <div className="flex-1" />

            {showFilter && <IconButton size="sm" icon={<Filter size={13} />} />}
            {showClear && (
              <IconButton
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => focusProjectId && clearLogs(focusProjectId)}
              />
            )}
            <IconButton size="sm" icon={<X size={14} />} onClick={() => setOpen(false)} />
          </div>

          {/* tabs — one per tracked build, only when 2+ */}
          {showTabs && (
            <div className="flex items-stretch border-b border-border bg-bg-input/30 overflow-x-auto shrink-0">
              {trackedIds.map((id) => {
                const p = projects.find((x) => x.id === id);
                const prog = liveProgress[id];
                const active = id === focusProjectId;
                const status = prog?.status;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedTab(id)}
                    className={cn(
                      "h-8 px-3 inline-flex items-center gap-2 text-xs border-r border-border whitespace-nowrap shrink-0 transition",
                      active
                        ? "bg-bg-card text-text-primary"
                        : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]",
                    )}
                  >
                    {(status === "building" || status === "queued") ? (
                      <Loader2 size={11} className="animate-spin text-accent-blue" />
                    ) : (
                      <Terminal size={11} className="text-text-muted" />
                    )}
                    <span className="font-medium truncate max-w-[140px]">{p?.name ?? id}</span>
                    {status === "building" && (
                      <span className="text-2xs font-mono text-accent-blue tabular-nums">{prog?.percent ?? 0}%</span>
                    )}
                    {status === "success" && <Badge tone="green" className="text-2xs">✓</Badge>}
                    {status === "error"   && <Badge tone="red"   className="text-2xs">!</Badge>}
                  </button>
                );
              })}
            </div>
          )}

          {/* log stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[11.5px] leading-[1.55] px-3 py-2">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted">
                <span className="text-xs">No log output yet. Start a build to stream logs here.</span>
              </div>
            ) : (
              logs.map((log, i) => <LogLine key={i} log={log} />)
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function LogLine({ log }: { log: BuildLogEvent }) {
  const time = new Date(log.timestamp).toTimeString().slice(0, 8);
  return (
    <div className={cn("flex gap-3 hover:bg-white/[0.02] px-1 -mx-1 rounded")}>
      <span className="text-text-muted shrink-0 select-none">{time}</span>
      <span className={cn("uppercase text-[10px] mt-0.5 shrink-0 w-12 font-semibold tracking-wider", LEVEL_TONE[log.level])}>
        {log.level}
      </span>
      <span className={cn("flex-1 break-words whitespace-pre-wrap", LEVEL_TONE[log.level])}>{log.message}</span>
    </div>
  );
}
