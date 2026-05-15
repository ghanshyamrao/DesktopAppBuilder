import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FolderOpen, Loader2, RefreshCw, XCircle, ChevronLeft, Square, Github } from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { isBuildConsoleFeatureEnabled, isEnabled } from "@/lib/features";
import { useHasFeature } from "@/lib/featureAccess";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { AppProject, BuildLogEvent } from "@/types";

interface Props {
  projectId: string;
}

const EMPTY_LOGS: BuildLogEvent[] = [];

export default function BuildProgress({ projectId }: Props) {
  // Re-render when PostHog reloads flags so toggling `recentOutput` shows /
  // hides the inline card without a reload.
  useFeatureFlagsLoadedTick();
  const showRecentOutput = isBuildConsoleFeatureEnabled("recentOutput");
  // Action-bar visibility mirrors the project-card and sidebar gating:
  // both are scoped to the `feature-billing` PostHog flag.
  //   • billing OFF → show "Open Output" for everyone (no paywall at all)
  //   • billing ON  → only Lifetime users see "Open Output" — it reveals
  //                   the raw build folder in the OS file manager, kept
  //                   behind the top tier as a power-user perk.
  // The hook subscribes to the store so the button appears automatically
  // after a user upgrades, no page reload required.
  //
  // "Export to…" is always available when a build succeeded — anyone who
  // can produce a build can copy the artifacts to a folder of their choice.
  const billingEnabled = isEnabled("billing");
  const hasLifetimeReveal = useHasFeature("reveal-output");
  const canRevealOutput = !billingEnabled || hasLifetimeReveal;

  const navigate = useAppStore((s) => s.navigate);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const liveLogs = useAppStore((s) => s.liveLogs[projectId] ?? EMPTY_LOGS);
  const liveProgress = useAppStore((s) => s.liveProgress[projectId]);
  const hydrateLogs = useAppStore((s) => s.hydrateLogs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const setConsoleOpen = useAppStore((s) => s.setConsoleOpen);
  const allProjects = useAppStore((s) => s.projects);

  const [project, setProject] = useState<AppProject | undefined>(() =>
    allProjects.find((p) => p.id === projectId),
  );
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  useEffect(() => {
    const found = allProjects.find((p) => p.id === projectId);
    if (found) setProject(found);
  }, [allProjects, projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!project) {
      void api.projects.get(projectId).then((p) => { if (!cancelled) setProject(p); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [project, projectId]);

  useEffect(() => { void hydrateLogs(projectId); }, [projectId, hydrateLogs]);

  const status = liveProgress?.status ?? project?.lastBuild?.status ?? "idle";
  const isBuilding = status === "building" || status === "queued";

  useEffect(() => {
    if (!isBuilding) {
      const start = project?.lastBuild?.startedAt;
      const end = project?.lastBuild?.finishedAt;
      if (start && end) setElapsed(new Date(end).getTime() - new Date(start).getTime());
      return;
    }
    const start = project?.lastBuild?.startedAt ? new Date(project.lastBuild.startedAt).getTime() : Date.now();
    setElapsed(Date.now() - start);
    const t = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(t);
  }, [isBuilding, project?.lastBuild?.startedAt, project?.lastBuild?.finishedAt]);

  const percent = liveProgress?.percent ?? (status === "success" ? 100 : 0);
  const stepText = useMemo(() => {
    if (!liveProgress) {
      if (status === "success") return "Build complete";
      if (status === "error") return "Build failed";
      if (status === "cancelled") return "Build cancelled";
      return "Preparing…";
    }
    if (liveProgress.step >= 0) {
      return `Step ${liveProgress.step + 1} of ${liveProgress.totalSteps}: ${liveProgress.stepLabel}…`;
    }
    return `${liveProgress.stepLabel || "Working"}…`;
  }, [liveProgress, status]);

  const onCancel = async () => {
    if (!liveProgress?.buildId) return;
    setBusy(true); setActionError(null);
    try { await api.builds.cancel(liveProgress.buildId); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const onRebuild = async () => {
    setBusy(true); setActionError(null); setActionInfo(null);
    clearLogs(projectId);
    setConsoleOpen(true);
    try { await api.builds.start(projectId); await refreshProjects(); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const onReveal = async () => {
    setActionError(null);
    try { await api.builds.revealOutput(projectId); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
  };

  const onExport = async () => {
    setBusy(true); setActionError(null); setActionInfo(null);
    try {
      const result = await api.builds.export(projectId);
      if (result.cancelled) return;
      const count = result.files?.length ?? 0;
      if (count > 0) setActionInfo(`Exported ${count} file${count === 1 ? "" : "s"} to ${result.destDir}`);
      else setActionError("No files were exported.");
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const onPublishGithub = async () => {
    setBusy(true); setActionError(null); setActionInfo(null);
    try {
      const result = await api.publish.github(projectId);
      const list = result.uploaded.length ? ` — uploaded ${result.uploaded.join(", ")}` : "";
      setActionInfo(`Draft release ${result.tag} ready${list}. Open: ${result.htmlUrl}`);
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!project) {
    return (
      <div className="pb-12">
        <PageHeader eyebrow="Build" title="Loading…" />
        <div className="flex items-center justify-center text-text-secondary py-24">
          <Loader2 className="animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={
          <button onClick={() => navigate({ name: "dashboard" })} className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition">
            <ChevronLeft size={11} /> All apps
          </button>
        }
        title={
          <span className="flex items-center gap-3">
            <span>{project.name}</span>
            <StatusPill status={status} />
          </span>
        }
        description={hostname(project.url)}
        actions={
          isBuilding ? (
            <Button variant="danger" leftIcon={<Square size={13} />} disabled={busy} onClick={onCancel}>
              Cancel Build
            </Button>
          ) : (
            <div className="flex gap-2">
              {status === "success" && (
                <>
                  {canRevealOutput && (
                    <Button leftIcon={<FolderOpen size={14} />} disabled={busy} onClick={onReveal}>Open Output</Button>
                  )}
                  <Button leftIcon={<Download size={14} />} disabled={busy} onClick={onExport}>Export to…</Button>
                  {project.githubRepo && (
                    <Button leftIcon={<Github size={14} />} disabled={busy} onClick={onPublishGithub}>
                      Publish to GitHub
                    </Button>
                  )}
                </>
              )}
              <Button variant="primary" leftIcon={<RefreshCw size={14} />} disabled={busy} onClick={onRebuild}>Rebuild</Button>
            </div>
          )
        }
      />

      <div className="px-8 space-y-5">
        {actionError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm">
            <XCircle size={16} className="shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}
        {actionInfo && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{actionInfo}</span>
          </div>
        )}

        {/* progress card */}
        <GlassCard tone={status === "error" ? "default" : status === "success" ? "green" : "blue"} className="p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">{compileTitle(project, status)}</h2>
              <p className="text-text-secondary text-sm mt-1">{stepText}</p>
            </div>
            <div className="text-text-secondary font-mono text-sm tabular-nums">{formatDuration(elapsed)}</div>
          </div>
          <ProgressBar percent={percent} status={status} />
          <div className="mt-3 flex items-center gap-3 text-xs text-text-muted">
            <span>{liveLogs.length} log line{liveLogs.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <button onClick={() => setConsoleOpen(true)} className="hover:text-text-primary transition">Open console</button>
          </div>
        </GlassCard>

        {/* recent log preview (last 6) — gated by feature flag */}
        {showRecentOutput && (
          <GlassCard className="p-0 overflow-hidden">
            <div className="h-9 px-4 flex items-center justify-between border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Recent output</span>
              <Badge tone="muted">tail · {Math.min(6, liveLogs.length)}/{liveLogs.length}</Badge>
            </div>
            <div className="font-mono text-[11.5px] p-3 max-h-[280px] overflow-hidden">
              {liveLogs.length === 0 ? (
                <div className="text-text-muted text-xs px-2 py-3">No output yet.</div>
              ) : (
                liveLogs.slice(-6).map((l, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 py-0.5">
                    <span className="text-text-muted shrink-0">{new Date(l.timestamp).toTimeString().slice(0, 8)}</span>
                    <span className={`uppercase text-[10px] mt-0.5 shrink-0 w-12 font-semibold tracking-wider ${LEVEL_COLOR[l.level]}`}>{l.level}</span>
                    <span className={`flex-1 break-words whitespace-pre-wrap ${LEVEL_COLOR[l.level]}`}>{l.message}</span>
                  </motion.div>
                ))
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

const LEVEL_COLOR: Record<BuildLogEvent["level"], string> = {
  info:    "text-text-secondary",
  warn:    "text-accent-amber",
  error:   "text-accent-red",
  success: "text-accent-green",
};

function compileTitle(project: AppProject, status: string): string {
  if (status === "success") return "Build complete";
  if (status === "error") return "Build failed";
  if (status === "cancelled") return "Build cancelled";
  const target = project.platforms[0];
  if (target === "win") return "Compiling for Windows (x64)";
  if (target === "mac") return "Compiling for macOS (Apple Silicon)";
  if (target === "linux") return "Compiling for Linux (x64)";
  return "Compiling…";
}

function ProgressBar({ percent, status }: { percent: number; status: string }) {
  const color =
    status === "error" ? "from-accent-red to-accent-red" :
    status === "success" ? "from-accent-green to-accent-green" :
    "from-accent-blue to-accent-violet";
  return (
    <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mt-4 relative">
      <motion.div
        className={`h-full bg-gradient-to-r ${color}`}
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      />
      {(status === "building" || status === "queued") && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%] animate-shimmer" />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "building" || status === "queued") return <Badge tone="blue" dot>Building</Badge>;
  if (status === "success") return <Badge tone="green">Success</Badge>;
  if (status === "error") return <Badge tone="red">Error</Badge>;
  if (status === "cancelled") return <Badge tone="muted">Cancelled</Badge>;
  return null;
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
