import { useMemo, useState } from "react";
import { Check, ChevronRight, Code2, FileCode, Loader2, Wand2, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import {
  RECIPES, applyRecipeToFields, RECIPE_CATEGORY_LABEL, RECIPE_CATEGORY_ORDER,
  type Recipe, type RecipeCategory,
} from "@/lib/recipes";
import type { AppProject } from "@/types";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "@/components/ui/CategoryTabs";

/**
 * Recipes — small, reusable bundles of CSS / JS / actions you apply to any
 * project. Two-pane layout: gallery on the left, detail + apply panel on
 * the right. The detail pane shows what the recipe touches and lets you
 * pick which projects to apply it to.
 *
 * Apply is additive (CSS/JS concatenate; actions structurally merge), so
 * stacking multiple recipes on the same project works.
 */
export default function Recipes() {
  const projects = useAppStore((s) => s.projects);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const navigate = useAppStore((s) => s.navigate);
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string>(RECIPES[0]?.id ?? "");
  const selected: Recipe | undefined = useMemo(
    () => RECIPES.find((r) => r.id === selectedId),
    [selectedId],
  );

  // Filter tab — "all" or one of the categories.
  const [filter, setFilter] = useState<"all" | RecipeCategory>("all");
  const visible = filter === "all" ? RECIPES : RECIPES.filter((r) => r.category === filter);

  // Per-category counts for the tab badges.
  const counts: Record<RecipeCategory, number> = { appearance: 0, focus: 0, shortcuts: 0, behavior: 0 };
  for (const r of RECIPES) counts[r.category] += 1;

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Workspace"
        title={
          <span className="flex items-center gap-3">
            <span>Recipes</span>
            <Badge tone="violet" dot>{RECIPES.length} ready-made</Badge>
          </span>
        }
        description="Reusable bundles of CSS / JS / actions you can apply to any project. Stack them — they merge cleanly."
      />

      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* gallery — tabbed filter; one category at a time */}
        <main className="min-w-0 space-y-3">
          <CategoryTabs
            tabs={[
              { key: "all" as const, label: "All", count: RECIPES.length },
              ...RECIPE_CATEGORY_ORDER.map((cat) => ({
                key: cat,
                label: RECIPE_CATEGORY_LABEL[cat],
                count: counts[cat],
              })),
            ]}
            active={filter}
            onChange={setFilter}
          />
          <div className="grid gap-3 pt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {visible.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                active={r.id === selectedId}
                onSelect={() => setSelectedId(r.id)}
              />
            ))}
          </div>
        </main>

        {/* detail + apply panel */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          {selected
            ? <RecipeDetail
                recipe={selected}
                projects={projects}
                onApplied={async () => { await refreshProjects(); }}
                onOpenProject={(id) => navigate({ name: "studio", projectId: id })}
                toast={toast}
              />
            : <GlassCard className="p-5 text-sm text-text-secondary">Pick a recipe.</GlassCard>}
        </aside>
      </div>
    </div>
  );
}

/* ─────────── Cards ─────────── */

function RecipeCard({ recipe, active, onSelect }: { recipe: Recipe; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative aspect-[5/3] rounded-xl overflow-hidden border text-left transition",
        active ? "border-accent-blue/60 ring-2 ring-accent-blue/30" : "border-border hover:border-border-strong",
      )}
      style={{ background: `linear-gradient(135deg, ${recipe.grad[0]} 0%, ${recipe.grad[1]} 100%)` }}
    >
      <div className="absolute inset-0 p-3 flex flex-col justify-between text-white">
        <div className="flex items-center justify-between">
          <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center text-base font-bold">
            {recipe.glyph}
          </div>
          <div className="flex gap-1">
            {recipe.touches.includes("css")     && <Badge tone="blue"   className="text-2xs"><FileCode size={9} className="mr-0.5" />css</Badge>}
            {recipe.touches.includes("js")      && <Badge tone="amber"  className="text-2xs"><Code2 size={9} className="mr-0.5" />js</Badge>}
            {recipe.touches.includes("actions") && <Badge tone="violet" className="text-2xs"><Zap size={9} className="mr-0.5" />act</Badge>}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold">{recipe.name}</div>
          <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{recipe.tagline}</div>
        </div>
      </div>
    </button>
  );
}

/* ─────────── Detail / apply panel ─────────── */

function RecipeDetail({
  recipe, projects, onApplied, onOpenProject, toast,
}: {
  recipe: Recipe;
  projects: AppProject[];
  onApplied: () => Promise<void>;
  onOpenProject: (id: string) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyNow() {
    if (picked.size === 0 || !projects.length) return;
    setApplying(true);
    let okCount = 0;
    let lastErr: string | null = null;
    try {
      for (const id of picked) {
        const project = projects.find((p) => p.id === id);
        if (!project) continue;
        try {
          const merged = applyRecipeToFields({
            customCss: project.customCss,
            customJs: project.customJs,
            actions: project.actions,
          }, recipe);
          await api.projects.update(id, merged);
          okCount += 1;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      await onApplied();
      if (okCount > 0) {
        toast.success(`Applied to ${okCount} project${okCount === 1 ? "" : "s"}`);
        setPicked(new Set());
      }
      if (lastErr) toast.error("Some applies failed", lastErr);
    } finally {
      setApplying(false);
    }
  }

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-bold border border-white/20 shrink-0"
          style={{ background: `linear-gradient(135deg, ${recipe.grad[0]}, ${recipe.grad[1]})` }}
        >
          {recipe.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{recipe.name}</div>
          <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">{recipe.tagline}</div>
        </div>
      </div>

      {/* Body preview — collapsed by default into a code-style block */}
      <div className="space-y-2">
        {recipe.body.customCss && (
          <details className="group">
            <summary className="text-2xs uppercase tracking-wider text-text-muted font-semibold cursor-default flex items-center gap-1">
              <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
              CSS
            </summary>
            <pre className="text-2xs mt-1.5 p-2 rounded-md bg-bg-input/60 border border-border font-mono whitespace-pre-wrap break-words text-text-primary leading-relaxed max-h-48 overflow-auto">
              {recipe.body.customCss}
            </pre>
          </details>
        )}
        {recipe.body.customJs && (
          <details className="group">
            <summary className="text-2xs uppercase tracking-wider text-text-muted font-semibold cursor-default flex items-center gap-1">
              <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
              JS
            </summary>
            <pre className="text-2xs mt-1.5 p-2 rounded-md bg-bg-input/60 border border-border font-mono whitespace-pre-wrap break-words text-text-primary leading-relaxed max-h-48 overflow-auto">
              {recipe.body.customJs}
            </pre>
          </details>
        )}
        {recipe.body.actions && (
          <details className="group">
            <summary className="text-2xs uppercase tracking-wider text-text-muted font-semibold cursor-default flex items-center gap-1">
              <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
              Actions
            </summary>
            <pre className="text-2xs mt-1.5 p-2 rounded-md bg-bg-input/60 border border-border font-mono whitespace-pre-wrap break-words text-text-primary leading-relaxed">
              {JSON.stringify(recipe.body.actions, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* project picker */}
      <div className="border-t border-border pt-3">
        <div className="text-2xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          Apply to projects ({picked.size}/{projects.length})
        </div>
        {projects.length === 0 ? (
          <div className="text-xs text-text-muted">No projects yet.</div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {projects.map((p) => {
              const selected = picked.has(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition",
                    selected
                      ? "bg-accent-blue/10 border-accent-blue/30"
                      : "border-transparent hover:bg-white/[0.04]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(p.id)}
                    className="sr-only"
                  />
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    selected
                      ? "bg-accent-blue border-accent-blue text-white"
                      : "border-border-strong",
                  )}>
                    {selected && <Check size={11} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-2xs text-text-secondary truncate">{p.url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); onOpenProject(p.id); }}
                    className="text-2xs text-text-muted hover:text-text-primary transition shrink-0"
                  >
                    open
                  </button>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => setPicked(new Set())}
          className="text-2xs text-text-muted hover:text-text-primary transition disabled:opacity-40"
        >
          Clear
        </button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={applying ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          disabled={picked.size === 0 || applying}
          onClick={applyNow}
        >
          {applying ? "Applying…" : `Apply to ${picked.size || "…"}`}
        </Button>
      </div>
    </GlassCard>
  );
}

