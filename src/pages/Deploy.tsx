import { useEffect, useMemo, useState } from "react";
import {
  Upload, Github, ExternalLink, KeyRound, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Settings as SettingsIcon, Hammer, Save, Pencil,
} from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { useFeatureGuard } from "@/lib/useFeatureGuard";
import type { AppProject } from "@/types";
import { cn, normalizeGithubRepo } from "@/lib/utils";

/**
 * Deploy hub — bird's-eye view of every project's distribution config
 * (GitHub repo, auto-update feed) and a per-row "Publish to GitHub" action.
 *
 * The same fields are also editable in App Studio's Distribution section
 * for one-off tweaks; this page is the workflow for "I want to release a
 * new version across N apps".
 */
export default function Deploy() {
  useFeatureGuard("github-publish");
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const navigate = useAppStore((s) => s.navigate);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const liveProgress = useAppStore((s) => s.liveProgress);
  const toast = useToast();
  const confirm = useConfirm();

  // Re-load on mount so Settings token / Studio repo edits are reflected.
  useEffect(() => { void loadSettings(); void refreshProjects(); }, [loadSettings, refreshProjects]);

  const hasToken = !!settings?.githubToken?.trim();

  // Per-project local edits — staged here, persisted on Save.
  const [drafts, setDrafts] = useState<Record<string, { githubRepo?: string; updateFeedUrl?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const configured = projects.filter((p) => p.githubRepo?.trim()).length;
    const built = projects.filter((p) => p.lastBuild?.status === "success").length;
    return {
      configured,
      built,
      total: projects.length,
      ready: projects.filter((p) => p.githubRepo?.trim() && p.lastBuild?.status === "success").length,
    };
  }, [projects]);

  function patch(projectId: string, fields: { githubRepo?: string; updateFeedUrl?: string }) {
    setDrafts((d) => ({ ...d, [projectId]: { ...d[projectId], ...fields } }));
  }

  async function saveDraft(project: AppProject) {
    const d = drafts[project.id];
    if (!d) return;
    // Normalize the repo (URL → owner/repo) before persisting so downstream
    // consumers (the publish handler, the AppStudio Distribution section)
    // always see the canonical form.
    let repoToSave: string | undefined;
    if (d.githubRepo !== undefined) {
      const trimmed = d.githubRepo.trim();
      repoToSave = trimmed ? (normalizeGithubRepo(trimmed) ?? trimmed) : "";
    }
    setSavingId(project.id);
    try {
      await api.projects.update(project.id, {
        ...(repoToSave !== undefined ? { githubRepo: repoToSave } : {}),
        ...(d.updateFeedUrl !== undefined ? { updateFeedUrl: d.updateFeedUrl } : {}),
      });
      await refreshProjects();
      setDrafts((all) => { const { [project.id]: _, ...rest } = all; return rest; });
      toast.success(`Saved ${project.name}`);
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : String(e));
    } finally { setSavingId(null); }
  }

  async function publish(project: AppProject) {
    if (!hasToken) {
      toast.error("Add a GitHub token first", "Open Settings to configure your token.");
      navigate({ name: "settings" });
      return;
    }
    setPublishingId(project.id);
    try {
      const result = await api.publish.github(project.id);
      toast.success(`Published ${project.name} ${result.tag}`, `Uploaded ${result.uploaded.length} artifact${result.uploaded.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error("Publish failed", e instanceof Error ? e.message : String(e));
    } finally { setPublishingId(null); }
  }

  /**
   * Kick off a build, prompting first if the app has been built before. The
   * confirmation prevents accidental rebuilds — Windows builds run npm
   * install + electron-builder which can take minutes, so a misclick is
   * expensive.
   */
  async function rebuild(project: AppProject) {
    const hasBuilt = !!project.lastBuild;
    if (hasBuilt) {
      const ok = await confirm({
        title: `Rebuild ${project.name}?`,
        body: (
          <span>
            This will install dependencies and run electron-builder again — usually
            takes 1-3 minutes. Any previously-built copy of the app must be closed
            first.
          </span>
        ),
        confirmLabel: "Rebuild",
      });
      if (!ok) return;
    }
    try {
      await api.builds.start(project.id);
      navigate({ name: "build", projectId: project.id });
    } catch (e) {
      toast.error("Build failed to start", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Workspace"
        title={
          <span className="flex items-center gap-3">
            <span>Deploy &amp; releases</span>
            <Badge tone="violet" dot>GitHub Releases</Badge>
          </span>
        }
        description="Publish your built apps to GitHub Releases, and configure the auto-update feed each generated app polls."
        actions={
          <Button leftIcon={<SettingsIcon size={14} />} onClick={() => navigate({ name: "settings" })}>
            Distribution settings
          </Button>
        }
      />

      <div className="px-8 space-y-5">
        {/* token banner */}
        {!hasToken && (
          <GlassCard tone="violet" className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent-violet/15 border border-accent-violet/30 text-accent-violet flex items-center justify-center shrink-0">
                <KeyRound size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Add a GitHub personal access token</div>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  Publishing requires a token with <code>repo</code> scope. Stored locally in your user-data folder.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="primary" size="sm" leftIcon={<KeyRound size={13} />} onClick={() => navigate({ name: "settings" })}>
                    Open Settings
                  </Button>
                  <a href="https://github.com/settings/tokens/new?scopes=repo&description=WebToDesktop+Builder" target="_blank" rel="noreferrer"
                     className="h-8 inline-flex items-center gap-1 px-3 rounded-md text-xs text-accent-blue hover:bg-accent-blue/10 transition">
                    Create a token <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* stat strip — 2 cols on phones, 4 on desktop. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Stat label="Apps"           value={stats.total}      tone="blue"   />
          <Stat label="Has GitHub repo" value={stats.configured} tone="violet" />
          <Stat label="Build succeeded" value={stats.built}      tone="green"  />
          <Stat label="Ready to publish" value={stats.ready}     tone="amber"  />
        </div>

        {/* projects */}
        {projects.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-text-secondary">
            No apps yet. Create one from the Dashboard, then come back here to publish it.
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                draft={drafts[p.id]}
                live={liveProgress[p.id]}
                hasToken={hasToken}
                isSaving={savingId === p.id}
                isPublishing={publishingId === p.id}
                onPatch={(fields) => patch(p.id, fields)}
                onSave={() => saveDraft(p)}
                onPublish={() => publish(p)}
                onRebuild={() => rebuild(p)}
                onOpenStudio={() => navigate({ name: "studio", projectId: p.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- per-project row ---------- */

interface RowProps {
  project: AppProject;
  draft: { githubRepo?: string; updateFeedUrl?: string } | undefined;
  live: { status?: string; percent?: number } | undefined;
  hasToken: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  onPatch: (fields: { githubRepo?: string; updateFeedUrl?: string }) => void;
  onSave: () => void;
  onPublish: () => void;
  onRebuild: () => void;
  onOpenStudio: () => void;
}

function ProjectRow({
  project, draft, live, hasToken, isSaving, isPublishing,
  onPatch, onSave, onPublish, onRebuild, onOpenStudio,
}: RowProps) {
  const repo = draft?.githubRepo ?? project.githubRepo ?? "";
  const feed = draft?.updateFeedUrl ?? project.updateFeedUrl ?? "";
  const hasDraft = draft && (draft.githubRepo !== undefined || draft.updateFeedUrl !== undefined);
  // Empty is fine; otherwise anything we can normalize to owner/repo passes
  // (full URLs, SSH form, bare slug). Saving normalizes; this just decides
  // whether to highlight the input.
  const repoValid = !repo.trim() || normalizeGithubRepo(repo) !== null;

  const lastBuild = project.lastBuild;
  const isBuilding = live?.status === "building" || live?.status === "queued";
  const buildOk = lastBuild?.status === "success";
  const canPublish = hasToken && repoValid && !!repo.trim() && buildOk && !isBuilding && !isPublishing && !hasDraft;

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className="p-5">
        {/* Row layout collapses on narrow widths: identity + config stack
            into one column below md, side-by-side at md+, and the action
            menu sits inline at lg+. */}
        <div className="grid gap-4 items-start grid-cols-1 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
          {/* identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate">{project.name}</div>
              <BuildStatusBadge status={lastBuild?.status} live={live} />
            </div>
            <div className="text-xs text-text-secondary truncate font-mono mt-0.5">{project.url}</div>
            <div className="text-2xs text-text-muted mt-1.5">
              {lastBuild?.startedAt
                ? `Last built ${formatRelative(lastBuild.startedAt)}`
                : "Never built"}
            </div>
          </div>

          {/* config inputs */}
          <div className="space-y-2 min-w-0">
            <div>
              <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">GitHub repo</label>
              <div className="flex items-center gap-2 mt-1">
                <Github size={13} className="text-text-secondary shrink-0" />
                <input
                  placeholder="owner/repo"
                  value={repo}
                  onChange={(e) => onPatch({ githubRepo: e.target.value })}
                  className={cn(
                    "input h-8 font-mono text-xs flex-1",
                    !repoValid && "border-accent-red/40 focus:border-accent-red/60",
                  )}
                />
              </div>
              {!repoValid && (
                <div className="text-2xs text-accent-red mt-1 inline-flex items-center gap-1">
                  <AlertTriangle size={10} /> Couldn't parse — use <code>owner/repo</code> or a full GitHub URL
                </div>
              )}
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">Auto-update feed</label>
              <input
                placeholder="https://updates.example.com/myapp/  (optional)"
                value={feed}
                onChange={(e) => onPatch({ updateFeedUrl: e.target.value })}
                className="input h-8 font-mono text-xs w-full mt-1"
              />
            </div>
          </div>

          {/* actions — at md the row is 2-col, so actions span both
              and right-align under the inputs; at lg+ they sit inline. */}
          <div className="flex items-start gap-2 shrink-0 md:col-span-2 md:justify-end lg:col-span-1 lg:justify-start">
            {/* When the user has unsaved field edits, surface Save as a real
                primary button — that's the only "you must do this next" CTA
                in the row. Everything else hides under the … menu. */}
            {hasDraft && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                disabled={!repoValid || isSaving}
                onClick={onSave}
              >
                Save
              </Button>
            )}
            {/* In-flight states: spinner + label, no menu (action is busy). */}
            {!hasDraft && isPublishing && (
              <Button size="sm" variant="primary" disabled leftIcon={<Loader2 size={12} className="animate-spin" />}>
                Publishing…
              </Button>
            )}
            {!hasDraft && !isPublishing && isBuilding && (
              <Button size="sm" variant="primary" disabled leftIcon={<Loader2 size={12} className="animate-spin" />}>
                Building {live?.percent ?? 0}%
              </Button>
            )}
            <ActionMenu
              label={`Actions for ${project.name}`}
              items={buildMenuItems({
                canPublish, isPublishing, isBuilding, hasDraft: !!hasDraft, hasToken,
                repoValid, hasRepo: !!repo.trim(), buildOk,
                onPublish, onRebuild, onOpenStudio, hasBuilt: !!project.lastBuild,
              })}
            />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

/**
 * Compose the items shown in the row's "…" menu. Disables Publish with a
 * specific tooltip when prerequisites aren't met, and renames Build →
 * "Rebuild" once a build exists so the confirm copy matches the affordance.
 */
function buildMenuItems(args: {
  canPublish: boolean; isPublishing: boolean; isBuilding: boolean;
  hasDraft: boolean; hasToken: boolean; repoValid: boolean; hasRepo: boolean; buildOk: boolean;
  hasBuilt: boolean;
  onPublish: () => void; onRebuild: () => void; onOpenStudio: () => void;
}): ActionMenuItem[] {
  return [
    {
      key: "publish",
      icon: <Upload size={13} />,
      label: args.hasDraft ? "Publish (save first)" : args.isPublishing ? "Publishing…" : "Publish to GitHub",
      onSelect: args.onPublish,
      disabled: !args.canPublish || args.isPublishing,
    },
    {
      key: "build",
      icon: <Hammer size={13} />,
      label: args.isBuilding ? "Building…" : args.hasBuilt ? "Rebuild" : "Build",
      onSelect: args.onRebuild,
      disabled: args.isBuilding,
    },
    { key: "sep1", label: "" },
    {
      key: "edit",
      icon: <Pencil size={13} />,
      label: "Edit in App Studio",
      onSelect: args.onOpenStudio,
    },
  ];
}

function publishDisabledReason(s: { hasToken: boolean; repoValid: boolean; hasRepo: boolean; buildOk: boolean; isBuilding: boolean; hasDraft: boolean }): string {
  if (s.hasDraft)    return "Save your changes first";
  if (!s.hasToken)   return "Add a GitHub token in Settings";
  if (!s.hasRepo)    return "Set a GitHub repo above";
  if (!s.repoValid)  return "Fix the repo format (owner/repo)";
  if (s.isBuilding)  return "Build in progress";
  if (!s.buildOk)    return "No successful build yet — Build first";
  return "Publish to GitHub";
}

function BuildStatusBadge({ status, live }: { status?: string; live?: { status?: string; percent?: number } }) {
  if (live?.status === "building" || live?.status === "queued") {
    return <Badge tone="blue" dot>Building {live.percent ?? 0}%</Badge>;
  }
  switch (status) {
    case "success":   return <Badge tone="green"><CheckCircle2 size={9} className="mr-1" /> Built</Badge>;
    case "error":     return <Badge tone="red"><XCircle size={9} className="mr-1" /> Failed</Badge>;
    case "cancelled": return <Badge tone="amber">Cancelled</Badge>;
    default:          return <Badge tone="muted">No build</Badge>;
  }
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "violet" | "amber" }) {
  const toneClass = {
    blue:   "text-accent-blue   bg-accent-blue/10   border-accent-blue/30",
    green:  "text-accent-green  bg-accent-green/10  border-accent-green/30",
    violet: "text-accent-violet bg-accent-violet/10 border-accent-violet/30",
    amber:  "text-accent-amber  bg-accent-amber/10  border-accent-amber/30",
  }[tone];
  return (
    <GlassCard className="p-4">
      <div className="text-2xs uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="flex items-baseline justify-between mt-1.5">
        <div className="text-2xl font-semibold tracking-tight font-display tabular-nums">{value}</div>
        <span className={cn("text-2xs px-2 py-0.5 rounded-md border", toneClass)}>{tone}</span>
      </div>
    </GlassCard>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
