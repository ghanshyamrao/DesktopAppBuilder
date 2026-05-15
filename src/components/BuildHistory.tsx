import { CheckCircle2, XCircle, MinusCircle, Loader2, Folder, Clock } from "lucide-react";
import type { BuildRecord } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  builds: BuildRecord[];
  onRevealOutput?: () => void;
}

/**
 * Vertical timeline of past builds for a project. Newest first. Each row
 * shows the build's status, when it ran, and (when there's an output path)
 * a button to reveal it in Finder/Explorer.
 *
 * `onRevealOutput` is intentionally not per-row — the build orchestrator
 * only knows how to reveal the LATEST output (`<workspace>/dist`), not
 * historical outputs (those get overwritten by each build). So we expose
 * one reveal button on the most recent successful build.
 */
export default function BuildHistory({ builds, onRevealOutput }: Props) {
  if (!builds.length) {
    return (
      <div className="text-xs text-text-muted italic">
        No builds yet. Hit “Build” to create the first one.
      </div>
    );
  }

  // Index of the newest successful build — only that one gets a reveal
  // button (the others' outputs have been overwritten).
  const newestSuccessIdx = builds.findIndex((b) => b.status === "success");

  return (
    <ol className="space-y-2">
      {builds.map((b, i) => (
        <li key={b.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-input/40 border border-border">
          <StatusIcon status={b.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("font-medium", statusColor(b.status))}>
                {statusLabel(b.status)}
              </span>
              <span className="text-text-muted text-xs font-mono truncate">#{b.id}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-2xs text-text-secondary">
              <span className="inline-flex items-center gap-1">
                <Clock size={10} />
                {formatRelative(b.startedAt)}
              </span>
              {b.finishedAt && b.startedAt && (
                <span>{formatDuration(b.startedAt, b.finishedAt)}</span>
              )}
            </div>
            {b.error && (
              <div className="mt-1.5 text-2xs text-accent-red font-mono whitespace-pre-wrap break-words">
                {b.error}
              </div>
            )}
          </div>
          {i === newestSuccessIdx && onRevealOutput && (
            <button
              type="button"
              onClick={onRevealOutput}
              className="h-7 px-2.5 rounded-md text-2xs inline-flex items-center gap-1.5 bg-bg-card border border-border hover:border-accent-blue/50 hover:bg-accent-blue/10 text-text-primary transition shrink-0"
              title="Reveal output folder"
            >
              <Folder size={11} /> Reveal
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function StatusIcon({ status }: { status: BuildRecord["status"] }) {
  const cls = "shrink-0 mt-0.5";
  switch (status) {
    case "success":   return <CheckCircle2 size={16} className={cn(cls, "text-accent-green")} />;
    case "error":     return <XCircle size={16} className={cn(cls, "text-accent-red")} />;
    case "cancelled": return <MinusCircle size={16} className={cn(cls, "text-text-muted")} />;
    case "building":
    case "queued":    return <Loader2 size={16} className={cn(cls, "text-accent-violet animate-spin")} />;
    default:          return <MinusCircle size={16} className={cn(cls, "text-text-muted")} />;
  }
}

function statusColor(s: BuildRecord["status"]): string {
  switch (s) {
    case "success":   return "text-accent-green";
    case "error":     return "text-accent-red";
    case "cancelled": return "text-text-muted";
    case "building":
    case "queued":    return "text-accent-violet";
    default:          return "text-text-primary";
  }
}

function statusLabel(s: BuildRecord["status"]): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}
