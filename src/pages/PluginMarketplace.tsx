import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Star, Download, Check, Loader2, Tag, Verified } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { CATALOG, CATEGORIES, type Plugin, type PluginCategory } from "@/lib/plugins";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";

export default function PluginMarketplace() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const toast = useToast();

  // Pull fresh settings on mount — keeps install state in sync if changed elsewhere.
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const installed = settings?.installedPlugins ?? [];
  const installedSet = useMemo(() => new Set(installed), [installed]);

  const [activeCat, setActiveCat] = useState<PluginCategory | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATALOG.filter((p) => activeCat === "all" || p.category === activeCat)
      .filter((p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.tagline.toLowerCase().includes(needle) ||
        p.author.toLowerCase().includes(needle),
      );
  }, [activeCat, q]);

  async function toggleInstall(p: Plugin) {
    if (busy) return;
    const wasInstalled = installedSet.has(p.id);
    const next = wasInstalled
      ? installed.filter((id) => id !== p.id)
      : [...installed, p.id];
    setBusy(p.id);
    try {
      await updateSettings({ installedPlugins: next });
      toast.success(wasInstalled ? `Uninstalled ${p.name}` : `Installed ${p.name}`);
    } catch (err) {
      toast.error(
        wasInstalled ? `Couldn't uninstall ${p.name}` : `Couldn't install ${p.name}`,
        err instanceof Error ? err.message : String(err),
      );
    } finally { setBusy(null); }
  }

  const detail = openId ? CATALOG.find((p) => p.id === openId) : null;

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Marketplace"
        title={
          <span className="flex items-center gap-3">
            <span>Plugin Marketplace</span>
            <Badge tone="green" dot>{installed.length} installed</Badge>
          </span>
        }
        description="Extend WebToDesktop Builder with themes, build tools, integrations and AI helpers. Install state is persisted; the runtime ships in a future phase."
        actions={
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search plugins…"
              className="input h-9 pl-9 w-72"
            />
          </div>
        }
      />

      {/* category tabs */}
      <div className="px-8 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id as PluginCategory | "all")}
              className={cn(
                "h-8 px-3.5 rounded-lg text-xs font-medium border transition",
                activeCat === c.id
                  ? "bg-white/[0.06] border-accent-blue/40 text-text-primary shadow-glow"
                  : "bg-bg-card/40 border-border text-text-secondary hover:border-border-strong hover:text-text-primary",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="px-8 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {visible.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.025 }}
          >
            <PluginCard
              plugin={p}
              installed={installedSet.has(p.id)}
              busy={busy === p.id}
              onInstall={() => toggleInstall(p)}
              onOpen={() => setOpenId(p.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* detail dialog */}
      <AnimatePresence>
        {detail && (
          <PluginDetail
            key={detail.id}
            plugin={detail}
            installed={installedSet.has(detail.id)}
            busy={busy === detail.id}
            onInstall={() => toggleInstall(detail)}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PluginCard({
  plugin, installed, busy, onInstall, onOpen,
}: {
  plugin: Plugin;
  installed: boolean;
  busy: boolean;
  onInstall: () => void;
  onOpen: () => void;
}) {
  return (
    <GlassCard interactive onClick={onOpen} className="p-4 group">
      <div className="flex items-start gap-3">
        <div
          className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shadow-elev shrink-0 bg-gradient-to-br", plugin.iconGradient)}
        >
          {plugin.iconGlyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[13.5px] font-semibold truncate">{plugin.name}</div>
            {plugin.badges?.includes("official") && <Verified size={12} className="text-accent-blue shrink-0" />}
          </div>
          <div className="text-xs text-text-secondary truncate mt-0.5">{plugin.tagline}</div>
          <div className="flex items-center gap-3 mt-2 text-2xs text-text-muted">
            <span className="flex items-center gap-1">
              <Star size={11} className="text-accent-amber fill-accent-amber" />
              {plugin.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <Download size={11} />
              {formatInstalls(plugin.installs)}
            </span>
            <span className="font-mono">v{plugin.version}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {plugin.badges?.map((b) => (
            <Badge key={b} tone={b === "new" ? "violet" : b === "beta" ? "amber" : b === "official" ? "blue" : "green"}>
              {b}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          variant={installed ? "secondary" : "primary"}
          leftIcon={busy ? <Loader2 size={12} className="animate-spin" /> : installed ? <Check size={12} /> : <Download size={12} />}
          onClick={(e) => { e.stopPropagation(); onInstall(); }}
          disabled={busy}
        >
          {installed ? "Installed" : "Install"}
        </Button>
      </div>
    </GlassCard>
  );
}

function PluginDetail({
  plugin, installed, busy, onInstall, onClose,
}: {
  plugin: Plugin;
  installed: boolean;
  busy: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl glass-strong rounded-2xl p-6 shadow-elev"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-white shadow-elev shrink-0 bg-gradient-to-br", plugin.iconGradient)}>
            {plugin.iconGlyph}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold flex items-center gap-2">
              {plugin.name}
              {plugin.badges?.map((b) => (
                <Badge key={b} tone={b === "new" ? "violet" : b === "beta" ? "amber" : b === "official" ? "blue" : "green"}>{b}</Badge>
              ))}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">{plugin.tagline}</div>
            <div className="flex items-center gap-4 mt-2 text-2xs text-text-muted">
              <span className="flex items-center gap-1"><Star size={11} className="text-accent-amber fill-accent-amber" />{plugin.rating.toFixed(1)}</span>
              <span className="flex items-center gap-1"><Download size={11} />{formatInstalls(plugin.installs)}</span>
              <span className="font-mono">v{plugin.version}</span>
              <span className="flex items-center gap-1"><Tag size={11} />{plugin.category}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 text-sm text-text-secondary leading-relaxed">{plugin.description}</div>

        <div className="mt-5 flex items-center justify-between text-xs">
          <span className="text-text-muted">by <span className="text-text-secondary">{plugin.author}</span></span>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button
              variant={installed ? "secondary" : "primary"}
              leftIcon={busy ? <Loader2 size={13} className="animate-spin" /> : installed ? <Check size={13} /> : <Download size={13} />}
              onClick={onInstall}
              disabled={busy}
            >
              {installed ? "Uninstall" : "Install"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
