import {
  Check, Clock, Loader2, Monitor, Smartphone, LayoutGrid as DashboardIcon,
  XCircle, Zap, Play, FolderOpen, Download, Trash2,
} from "lucide-react";
import type { AppProject } from "@/types";
import { cn, platformLabel, timeAgo } from "@/lib/utils";
import { hasFeature } from "@/lib/featureAccess";
import { isEnabled } from "@/lib/features";
import { useAppStore } from "@/store/appStore";
import { useProjectIcon } from "@/lib/useProjectIcon";
import { GlassCard } from "@/components/ui/GlassCard";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { useConfirm } from "@/components/ui/Confirm";

const PLACEHOLDER_ICONS: Record<string, JSX.Element> = {
  zap: <Zap size={20} />,
  smartphone: <Smartphone size={20} />,
  dashboard: <DashboardIcon size={20} />,
};

function pickIconKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("notion") || n.includes("doc")) return "smartphone";
  if (n.includes("dashboard") || n.includes("admin")) return "dashboard";
  return "zap";
}

interface Props {
  project: AppProject;
}

export default function AppCard({ project }: Props) {
  const navigate = useAppStore((s) => s.navigate);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const confirm = useConfirm();

  const status = project.lastBuild?.status;
  const isBuilding = status === "building";
  const iconUrl = useProjectIcon(project);

  // Build-action visibility is scoped to the `feature-billing` PostHog flag,
  // matching the sidebar and the BuildProgress action bar. When billing is
  // OFF we show every action regardless of plan (useful for previewing the
  // app without a paywall). When billing is ON we keep the original tiering:
  // Export is available to everyone, Reveal Output stays Lifetime-only.
  const hasOutput = !!project.lastBuild?.outputPath;
  const billingEnabled = isEnabled("billing");
  const canRevealOutput = hasOutput && (!billingEnabled || hasFeature("reveal-output"));
  const canExportBuild = hasOutput;

  const onClick = () =>
    isBuilding
      ? navigate({ name: "build", projectId: project.id })
      : navigate({ name: "studio", projectId: project.id });

  return (
    <GlassCard
      interactive
      onClick={onClick}
      className="p-5 relative group"
    >
      {/* hover glow border */}
      <div className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition" style={{
        boxShadow: "0 0 0 1px rgba(91,157,255,0.25), 0 16px 48px -12px rgba(91,157,255,0.18)",
      }} />

      <div className="relative flex items-start justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center text-text-secondary shrink-0 shadow-elev overflow-hidden",
            iconUrl
              ? "bg-bg-input border border-border"
              : "bg-gradient-to-br from-bg-elev to-bg-input border border-border",
          )}>
            {iconUrl
              ? <img src={iconUrl} alt="" className="w-full h-full object-cover" />
              : PLACEHOLDER_ICONS[pickIconKey(project.name)]}
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{project.name}</div>
            <div className="text-xs text-text-secondary truncate">{hostname(project.url)}</div>
          </div>
        </div>

        {/* Card actions — Radix-based menu so it portals out of the card,
            anchors cleanly to the trigger, and never overlaps the title. */}
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${project.name}`}
            items={[
              {
                key: "open",
                icon: <Play size={13} />,
                label: "Open / Rebuild",
                onSelect: () => navigate({ name: "build", projectId: project.id }),
              },
              // Reveal Output / Export visibility is gated by the
              // `feature-billing` PostHog flag (see hooks above). With
              // billing OFF, both actions appear for every user. With
              // billing ON, Export still shows for everyone but Reveal
              // Output is hidden unless the user holds the Lifetime plan,
              // so trial/monthly users don't see an action that bounces
              // them to the upgrade page.
              ...(canRevealOutput ? [
                {
                  key: "reveal",
                  icon: <FolderOpen size={13} />,
                  label: "Reveal output",
                  onSelect: () => { void window.w2a.builds.revealOutput(project.id); },
                },
              ] : []),
              ...(canExportBuild ? [
                {
                  key: "export",
                  icon: <Download size={13} />,
                  label: "Export to…",
                  onSelect: () => { void window.w2a.builds.export(project.id); },
                },
              ] : []),
              { key: "sep1", label: "" },
              {
                key: "delete",
                icon: <Trash2 size={13} />,
                label: "Delete",
                danger: true,
                onSelect: async () => {
                  const ok = await confirm({
                    title: `Delete "${project.name}"?`,
                    body: "This removes the project and its build output. This action can't be undone.",
                    tone: "danger",
                    confirmLabel: "Delete project",
                  });
                  if (ok) await deleteProject(project.id);
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="relative border-t border-border pt-4 flex items-center justify-between text-xs">
        <div>
          <div className="text-2xs uppercase tracking-wider text-text-muted mb-1">Last build</div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Clock size={12} />
            <span>{project.lastBuild ? timeAgo(project.lastBuild.startedAt) : "Never"}</span>
          </div>
        </div>
        <div className="text-right">
          <StatusBadge status={status} />
          <div className="flex items-center justify-end gap-1.5 text-text-secondary mt-1">
            <Monitor size={12} />
            <span>{project.platforms.map(platformLabel).join(", ") || "—"}</span>
          </div>
        </div>
      </div>

      {isBuilding && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-xl">
          <div className="h-full bg-gradient-to-r from-accent-blue via-accent-violet to-accent-blue bg-[length:200%_100%] animate-shimmer" />
        </div>
      )}
    </GlassCard>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-text-muted text-[11px]">No builds</span>;
  if (status === "success")
    return <span className="inline-flex items-center gap-1 text-accent-green text-[11px] font-medium"><Check size={12} />Success</span>;
  if (status === "building")
    return <span className="inline-flex items-center gap-1 text-accent-amber text-[11px] font-medium"><Loader2 size={12} className="animate-spin" />Building</span>;
  if (status === "error")
    return <span className="inline-flex items-center gap-1 text-accent-red text-[11px] font-medium"><XCircle size={12} />Error</span>;
  return <span className="text-text-secondary capitalize text-[11px]">{status}</span>;
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
