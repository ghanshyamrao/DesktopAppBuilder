import { useEffect, useRef } from "react";
import type { BuildLogEvent } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  logs: BuildLogEvent[];
}

export default function BuildLog({ logs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div className="panel flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border text-sm font-mono text-text-secondary">build.log</div>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-6">
        {logs.length === 0 ? (
          <div className="text-text-muted">Waiting for build to start...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3">
              <span className={cn("shrink-0", levelColor(log.level))}>[{formatTime(log.timestamp)}]</span>
              <span className={cn("whitespace-pre-wrap break-words", levelTextColor(log.level))}>
                {log.level === "warn" && "WARN: "}
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function levelColor(level: BuildLogEvent["level"]): string {
  switch (level) {
    case "success":
      return "text-accent-green";
    case "warn":
      return "text-accent-yellow";
    case "error":
      return "text-accent-red";
    default:
      return "text-text-muted";
  }
}

function levelTextColor(level: BuildLogEvent["level"]): string {
  switch (level) {
    case "success":
      return "text-accent-green";
    case "warn":
      return "text-accent-yellow";
    case "error":
      return "text-accent-red";
    default:
      return "text-text-primary";
  }
}
