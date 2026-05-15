import { Search, Box } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppProject } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useProjectIcon } from "@/lib/useProjectIcon";

/** Compact left rail of projects — used by Action Builder and App Studio. */
export function ProjectPicker({
  projects,
  selectedId,
  onSelect,
}: {
  projects: AppProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(needle) || p.url.toLowerCase().includes(needle));
  }, [projects, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter projects…"
          className="input h-8 pl-7 text-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-2xs text-text-muted px-2 py-3 text-center">No projects.</div>
      ) : (
        <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          {filtered.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === selectedId}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project, active, onSelect,
}: {
  project: AppProject;
  active: boolean;
  onSelect: () => void;
}) {
  const iconUrl = useProjectIcon(project);
  return (
    <button
      onClick={onSelect}
      className={cn(
        // Selected state uses an inset ring instead of `shadow-glow`. The
        // glow extends ~20px outside the box and was being clipped by the
        // narrow scroll container above; an inset ring stays fully within
        // the row's footprint so it always renders crisply.
        "w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition",
        active
          ? "bg-accent-blue/[0.08] border-accent-blue/60 ring-1 ring-inset ring-accent-blue/30"
          : "bg-bg-card/40 border-border hover:border-border-strong hover:bg-white/[0.04]",
      )}
    >
      <div
        className={cn(
          "w-7 h-7 shrink-0 rounded-md border border-border flex items-center justify-center overflow-hidden",
          iconUrl ? "bg-bg-input" : "bg-gradient-to-br from-bg-elev to-bg-input text-text-secondary",
        )}
      >
        {iconUrl
          ? <img src={iconUrl} alt="" className="w-full h-full object-cover" />
          : <Box size={13} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate">{project.name}</div>
        <div className="text-[10px] text-text-muted truncate">{hostname(project.url)}</div>
      </div>
      <ProjectStatusBadge project={project} />
    </button>
  );
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function ProjectStatusBadge({ project }: { project: AppProject }) {
  const last = project.lastBuild;
  if (!last) return <Badge tone="muted">new</Badge>;
  if (last.status === "building") return <Badge tone="blue" dot>build</Badge>;
  if (last.status === "error")    return <Badge tone="red">err</Badge>;
  // Successful build, but check if stale (project edited since).
  const built = new Date(last.startedAt).getTime();
  const updated = new Date(project.updatedAt).getTime();
  if (updated > built) return <Badge tone="amber" dot>stale</Badge>;
  return <Badge tone="green">ok</Badge>;
}
