import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

interface ComingSoonProps {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  highlights: { title: string; body: string }[];
  accent?: "blue" | "violet" | "green";
}

export default function ComingSoon({ eyebrow, title, description, highlights, accent = "violet" }: ComingSoonProps) {
  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={eyebrow}
        title={
          <span className="flex items-center gap-3">
            <span>{title}</span>
            <Badge tone={accent} dot>Phase 2+</Badge>
          </span>
        }
        description={description}
      />

      <div className="px-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((h) => (
          <GlassCard key={h.title} tone={accent} className="p-5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-violet to-accent-blue text-white flex items-center justify-center mb-3 shadow-glow-violet">
              <Sparkles size={16} />
            </div>
            <div className="text-sm font-semibold mb-1">{h.title}</div>
            <p className="text-xs text-text-secondary leading-relaxed">{h.body}</p>
          </GlassCard>
        ))}
      </div>

      <div className="px-8 mt-8">
        <div className="glass-strong rounded-xl p-5 max-w-3xl">
          <div className="text-xs uppercase tracking-wider text-text-muted mb-2">What you can do today</div>
          <p className="text-sm text-text-secondary leading-relaxed">
            The shell, design system, and routing for this section are live. The interactive editor lands in the next phase
            once the foundation here is approved.
          </p>
        </div>
      </div>
    </div>
  );
}
