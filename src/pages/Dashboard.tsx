import { useEffect, useRef, useState } from "react";
import { Plus, Boxes, Activity, HardDrive, TrendingUp, Sparkles, Zap, Globe, ArrowRight, Upload, Hammer, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import AppCard from "@/components/AppCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/appStore";
import { useAuth } from "@/components/auth/AuthGate";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { APP_TEMPLATES, CATEGORY_LABEL, CATEGORY_ORDER, type AppTemplate, type TemplateCategory } from "@/lib/appTemplates";
import { CategoryTabs } from "@/components/ui/CategoryTabs";
import { HorizontalSlider } from "@/components/ui/HorizontalSlider";
import { isDashboardSectionEnabled, isEnabled } from "@/lib/features";

export default function Dashboard() {
  const projects = useAppStore((s) => s.projects);
  const navigate = useAppStore((s) => s.navigate);
  const liveProgress = useAppStore((s) => s.liveProgress);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const subscription = useAppStore((s) => s.subscription);
  const { user } = useAuth();
  const toast = useToast();

  // Gate the "New App" + bulk-build entry points. The build pipeline
  // itself has its own gate in api.builds.start, but bouncing here
  // before the user fills in the wizard avoids the worse UX of letting
  // them set up a project they can't actually build.
  //
  // When the PostHog `feature-billing` flag is off, we skip the gate
  // entirely so toggling the flag truly turns billing on/off globally.
  function requireSubscriptionOrRedirect(): boolean {
    if (!isEnabled("billing")) return true;
    if (subscription?.active) return true;
    navigate({ name: "billing" });
    toast.error(
      "Pick a plan to start building",
      subscription && subscription.tier !== "free"
        ? "Your plan has expired. Renew to keep going."
        : "Building apps needs an active subscription. Choose any plan to begin."
    );
    return false;
  }

  // Greeting uses the signed-in Google user's first name. Falls back to the
  // local-part of their email (everything before @), and finally to an
  // empty string so the JSX picks the neutral "Welcome back" branch.
  const firstName = (() => {
    const fromName = user.name?.trim().split(/\s+/)[0];
    if (fromName) return fromName;
    const local = user.email.split("@")[0];
    return local || "";
  })();

  // Templates filter — "all" or a single category. Persists in component
  // state only (not URL/store) so navigating away + back doesn't surprise
  // the user with a different filter.
  const [templateCat, setTemplateCat] = useState<"all" | TemplateCategory>("all");
  const visibleTemplates = templateCat === "all"
    ? APP_TEMPLATES
    : APP_TEMPLATES.filter((t) => t.category === templateCat);

  // Build per-category counts once for the tab badges.
  const templateCounts: Record<TemplateCategory, number> = {
    productivity: 0, communication: 0, media: 0, dev: 0, social: 0, tools: 0,
  };
  for (const t of APP_TEMPLATES) templateCounts[t.category] += 1;

  const buildingNow = Object.values(liveProgress).filter((p) => p?.status === "building").length;
  const successCount = projects.filter((p) => p.lastBuild?.status === "success").length;
  const errorCount   = projects.filter((p) => p.lastBuild?.status === "error").length;

  /**
   * "Stale" = the project's last build is older than its updatedAt, or there
   * was no successful build at all. Same definition App Studio uses for its
   * "needs rebuild" warning, kept in sync.
   */
  const staleProjects = projects.filter((p) => {
    if (!p.lastBuild || p.lastBuild.status !== "success") return true;
    return new Date(p.updatedAt).getTime() > new Date(p.lastBuild.startedAt).getTime();
  });

  // Bulk build queue. We run sequentially because concurrent npm install +
  // electron-builder spikes CPU and breaks Windows file locking. Pending
  // queue + currently-running id are kept in refs so a re-render doesn't
  // restart the loop.
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef<string | null>(null);

  /** Watch the live progress for the currently-running project. When it
   *  reaches a terminal state, advance the queue. */
  useEffect(() => {
    if (!bulkRunning) return;
    const id = runningRef.current;
    if (!id) return;
    const status = liveProgress[id]?.status;
    if (status === "success" || status === "error" || status === "cancelled") {
      void advanceQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveProgress, bulkRunning]);

  async function advanceQueue() {
    const next = queueRef.current.shift();
    if (!next) {
      // Queue drained — refresh + report.
      runningRef.current = null;
      setBulkRunning(false);
      const final = bulkProgress;
      setBulkProgress(null);
      await refreshProjects();
      if (final) toast.success(`Built ${final.total} project${final.total === 1 ? "" : "s"}`);
      return;
    }
    runningRef.current = next;
    setBulkProgress((p) => p ? { ...p, done: p.done + 1 } : null);
    try {
      await api.builds.start(next);
    }
    catch (e) {
      toast.error("Build failed to start", e instanceof Error ? e.message : String(e));
      // Continue to next regardless — one bad project shouldn't stall the queue.
      void advanceQueue();
    }
  }

  async function buildAllStale() {
    if (bulkRunning || staleProjects.length === 0) return;
    if (!requireSubscriptionOrRedirect()) return;
    queueRef.current = staleProjects.map((p) => p.id);
    setBulkProgress({ done: 0, total: queueRef.current.length });
    setBulkRunning(true);
    void advanceQueue();
  }

  async function importProject() {
    try {
      const result = await api.projects.import();
      if (result.cancelled || !result.project) return;
      await refreshProjects();
      toast.success(`Imported "${result.project.name}"`);
      navigate({ name: "studio", projectId: result.project.id });
    } catch (e) {
      toast.error("Import failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Workspace"
        title={
          firstName
            ? <>Welcome back, <span className="text-gradient">{firstName}</span></>
            : <>Welcome <span className="text-gradient">back</span></>
        }
        description="Your premium desktop apps, build pipeline, and analytics — all in one workspace."
        actions={
          <div className="flex items-center gap-2">
            {staleProjects.length > 0 && isDashboardSectionEnabled("bulkBuild") && (
              <Button
                leftIcon={bulkRunning ? <Loader2 size={15} className="animate-spin" /> : <Hammer size={15} />}
                onClick={buildAllStale}
                disabled={bulkRunning}
                title={bulkRunning && bulkProgress
                  ? `Building ${bulkProgress.done}/${bulkProgress.total}`
                  : `Rebuild ${staleProjects.length} stale project${staleProjects.length === 1 ? "" : "s"}`}
              >
                {bulkRunning && bulkProgress
                  ? `Building ${bulkProgress.done}/${bulkProgress.total}…`
                  : `Build all stale (${staleProjects.length})`}
              </Button>
            )}
            {isDashboardSectionEnabled("importButton") && (
              <Button leftIcon={<Upload size={15} />} onClick={importProject}>
                Import
              </Button>
            )}
            {isDashboardSectionEnabled("newAppButton") && (
              <Button
                variant="primary"
                leftIcon={<Plus size={15} />}
                onClick={() => { if (requireSubscriptionOrRedirect()) navigate({ name: "wizard" }); }}
              >
                New App
              </Button>
            )}
          </div>
        }
      />

      {/* stat strip */}
      {isDashboardSectionEnabled("stats") && (
        <div className="px-6 lg:px-8 grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4 mb-6 lg:mb-7">
          <StatTile label="Active projects"  value={projects.length} delta="+2 this week"      tone="blue"   icon={<Boxes size={16} />} />
          <StatTile label="Builds succeeded" value={successCount}    delta={`${errorCount} failed`} tone="green"  icon={<TrendingUp size={16} />} />
          <StatTile label="In progress"      value={buildingNow}     delta={buildingNow ? "Live" : "Idle"} tone="violet" icon={<Activity size={16} />} />
          <StatTile label="Storage"          value="3.2 GB"          delta="of 50 GB"          tone="amber"  icon={<HardDrive size={16} />} />
        </div>
      )}

      {/* templates gallery — tabbed by category. Each card ships a full
          theme/CSS/JS/actions config baked in, so clicking → wizard → build
          needs zero further configuration. */}
      {isDashboardSectionEnabled("templates") && (
        <div className="px-6 lg:px-8 mb-6 lg:mb-7 space-y-3">
          <SectionHeader title="Start from a template" hint={`${APP_TEMPLATES.length} ready-made`} />
          <CategoryTabs
            tabs={[
              { key: "all" as const, label: "All", count: APP_TEMPLATES.length },
              ...CATEGORY_ORDER.map((cat) => ({
                key: cat,
                label: CATEGORY_LABEL[cat],
                count: templateCounts[cat],
              })),
            ]}
            active={templateCat}
            onChange={setTemplateCat}
          />
          <HorizontalSlider className="pt-2">
            {visibleTemplates.map((t) => (
              <div key={t.id} className="w-[160px] shrink-0">
                <TemplateCard
                  template={t}
                  onPick={() => { if (requireSubscriptionOrRedirect()) navigate({ name: "wizard", draft: t.draft }); }}
                />
              </div>
            ))}
          </HorizontalSlider>
        </div>
      )}

      {/* projects */}
      {isDashboardSectionEnabled("recentProjects") && (
        <div className="px-6 lg:px-8">
          <SectionHeader title="Recent applications" hint={`${projects.length} project${projects.length === 1 ? "" : "s"}`} />
          {projects.length === 0 ? (
            <EmptyState onCreate={() => { if (requireSubscriptionOrRedirect()) navigate({ name: "wizard" }); }} />
          ) : (
            <HorizontalSlider>
              {projects.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[320px] shrink-0"
                >
                  <AppCard project={p} />
                </motion.div>
              ))}
            </HorizontalSlider>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label, value, delta, icon, tone,
}: {
  label: string;
  value: React.ReactNode;
  delta: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "violet" | "amber";
}) {
  const toneClass = {
    blue:   "from-accent-blue/15   to-transparent  text-accent-blue",
    green:  "from-accent-green/15  to-transparent  text-accent-green",
    violet: "from-accent-violet/15 to-transparent  text-accent-violet",
    amber:  "from-accent-amber/15  to-transparent  text-accent-amber",
  }[tone];

  return (
    <GlassCard className="p-4 relative overflow-hidden group">
      <div className={`absolute inset-x-0 top-0 h-12 bg-gradient-to-b ${toneClass} opacity-50 pointer-events-none`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-2xs uppercase tracking-wider text-text-secondary">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-1.5 font-display tabular-nums">{value}</div>
          <div className="text-2xs text-text-muted mt-1">{delta}</div>
        </div>
        <div className={`w-9 h-9 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center ${toneClass.split(" ").pop()}`}>
          {icon}
        </div>
      </div>
    </GlassCard>
  );
}

function TemplateCard({ template, onPick }: { template: AppTemplate; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-border hover:border-accent-blue/60 transition text-left"
      style={{ background: `linear-gradient(135deg, ${template.grad[0]} 0%, ${template.grad[1]} 100%)` }}
    >
      <div className="absolute inset-0 p-3 flex flex-col justify-between text-white">
        <div className="flex items-center justify-between">
          <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center text-base font-bold">
            {template.initials}
          </div>
          <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition" />
        </div>
        <div>
          <div className="text-sm font-semibold">{template.name}</div>
          <div className="text-[11px] opacity-80 mt-0.5">{template.tagline}</div>
        </div>
      </div>
    </button>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h2 className="text-sm font-semibold tracking-tight text-text-primary">{title}</h2>
      {hint && <span className="text-2xs uppercase tracking-wider text-text-muted">{hint}</span>}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-3xl mx-auto mt-6"
    >
      <GlassCard className="relative overflow-hidden">
        {/* ambient gradient backdrop inside the card */}
        <div className="absolute inset-0 pointer-events-none bg-mesh-violet opacity-60" />
        <div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(closest-side, rgba(91,157,255,0.18), transparent)" }}
        />
        <div
          className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.16), transparent)" }}
        />

        <div className="relative p-10 sm:p-12">
          {/* hero */}
          <div className="flex items-start gap-5 mb-7">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-violet text-white flex items-center justify-center shadow-glow shrink-0">
              <Sparkles size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-2xs uppercase tracking-[0.16em] text-accent-violet font-semibold mb-1.5">
                Get started
              </div>
              <h2 className="text-2xl font-semibold tracking-tight font-display">
                Ship a <span className="text-gradient">desktop app</span> in under a minute
              </h2>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-lg">
                Paste a URL, pick a theme, and WebToDesktop Builder generates a signed-ready installer for Windows,
                macOS and Linux. No native code required.
              </p>
            </div>
          </div>

          {/* primary action + meta */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <Button variant="primary" size="lg" leftIcon={<Plus size={16} />} onClick={onCreate}>
              Create your first app
            </Button>
            <span className="text-xs text-text-muted">No setup required · Builds in &lt; 60s</span>
          </div>

          {/* alternative starting points */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <StartCard
              icon={<Globe size={15} />}
              title="From a URL"
              body="The classic. Wrap any website."
              onClick={onCreate}
              tone="blue"
            />
            <StartCard
              icon={<Sparkles size={15} />}
              title="From a prompt"
              body="Describe it, AI drafts the project."
              onClick={() => navigate({ name: "ai" })}
              tone="violet"
            />
            <StartCard
              icon={<Zap size={15} />}
              title="From a theme"
              body="Start by picking a look first."
              onClick={() => navigate({ name: "themes" })}
              tone="green"
            />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function StartCard({
  icon, title, body, onClick, tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  tone: "blue" | "violet" | "green";
}) {
  const toneClass = {
    blue:   "text-accent-blue   bg-accent-blue/10   border-accent-blue/25",
    violet: "text-accent-violet bg-accent-violet/10 border-accent-violet/25",
    green:  "text-accent-green  bg-accent-green/10  border-accent-green/25",
  }[tone];

  return (
    <button
      onClick={onClick}
      className="group text-left p-3.5 rounded-xl bg-bg-card/40 border border-border hover:border-border-strong hover:bg-white/[0.04] transition"
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`w-7 h-7 rounded-md flex items-center justify-center border ${toneClass}`}>
          {icon}
        </span>
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      <div className="text-xs text-text-secondary leading-relaxed">{body}</div>
    </button>
  );
}
