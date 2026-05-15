import { useEffect, useMemo, useState } from "react";
import {
  AppWindow, Bell, Boxes, Compass, Keyboard, Lock, Power, Save, Loader2,
  Plus, Trash2, Zap, Pin,
} from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Switch } from "@/components/ui/Switch";
import { ProjectPicker } from "@/components/ProjectPicker";
import { SubSidebar, type SubNavEntry } from "@/components/ui/SubSidebar";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { useFeatureGuard } from "@/lib/useFeatureGuard";
import { DEFAULT_ACTIONS, isValidAccelerator, withDefaults } from "@/lib/actions";
import type { ActionsConfig, AppProject, GlobalShortcut } from "@/types";
import { cn } from "@/lib/utils";

type SectionKey = "capabilities" | "deeplink" | "shortcuts";

const SUB_NAV: readonly SubNavEntry<SectionKey>[] = [
  { key: "capabilities", label: "Capabilities",  icon: <Zap size={14} /> },
  { key: "deeplink",     label: "Deep linking",  icon: <Compass size={14} /> },
  { key: "shortcuts",    label: "Shortcuts",     icon: <Keyboard size={14} /> },
];

export default function ActionBuilder() {
  useFeatureGuard("action-builder");
  const projects = useAppStore((s) => s.projects);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null);
  useEffect(() => {
    if (!selectedId && projects[0]) setSelectedId(projects[0].id);
  }, [projects, selectedId]);

  const project: AppProject | undefined = projects.find((p) => p.id === selectedId);
  const [draft, setDraft] = useState<ActionsConfig>(DEFAULT_ACTIONS);
  useEffect(() => {
    setDraft(withDefaults(project?.actions));
  }, [project?.id]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(withDefaults(project?.actions)),
    [draft, project?.actions],
  );
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("capabilities");

  async function save() {
    if (!project) return;
    setSaving(true);
    try {
      await api.projects.update(project.id, { actions: draft });
      await refreshProjects();
      toast.success("Actions saved", "Rebuild this project to apply the changes.");
    } catch (err) {
      toast.error("Couldn't save actions", err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  function patch(p: Partial<ActionsConfig>) { setDraft((d) => ({ ...d, ...p })); }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Studio · Action Builder"
        title={
          <span className="flex items-center gap-3">
            <span>Native desktop powers</span>
            <Badge tone="blue" dot>Per project</Badge>
          </span>
        }
        description="Tray, global shortcuts, deep links, notifications, startup launch — toggle per app. Saved values bake into the generated app's config.json and the OS-level installer."
        actions={
          project && (
            <Button
              variant="primary"
              leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              disabled={!dirty || saving}
              onClick={save}
            >
              Save Actions
            </Button>
          )
        }
      />

      {/* < lg: stacks; lg+: 2-col [picker | content]. Picker tightens to
          220px at lg-xl so cards in the content area get more breathing
          room on 14" laptops. */}
      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* project picker */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-2">Projects</div>
          <ProjectPicker projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
        </aside>

        {/* canvas */}
        {!project ? (
          <EmptyState />
        ) : (
          <main className="min-w-0 grid gap-4 grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)]">
            <SubSidebar entries={SUB_NAV} active={activeSection} onChange={setActiveSection} />
            <div className="min-w-0 space-y-5">
            {activeSection === "capabilities" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CapabilityCard
                icon={<AppWindow size={16} />}
                title="System Tray"
                desc="Show a tray icon with a context menu (open, hide, reload, quit)."
                tone="blue"
                checked={draft.tray}
                onChange={(v) => patch({ tray: v })}
              />
              <CapabilityCard
                icon={<Power size={16} />}
                title="Minimize to tray"
                desc="Hide window on close instead of quitting. Requires tray."
                tone="blue"
                disabled={!draft.tray}
                checked={draft.minimizeToTray}
                onChange={(v) => patch({ minimizeToTray: v })}
              />
              <CapabilityCard
                icon={<Lock size={16} />}
                title="Single instance"
                desc="Second launch focuses the existing window — recommended."
                tone="green"
                checked={draft.singleInstance}
                onChange={(v) => patch({ singleInstance: v })}
              />
              <CapabilityCard
                icon={<Boxes size={16} />}
                title="Application menu"
                desc="Standard menu bar + accelerators (Ctrl+R reload, F11 fullscreen, etc)."
                tone="violet"
                checked={draft.applicationMenu}
                onChange={(v) => patch({ applicationMenu: v })}
              />
              <CapabilityCard
                icon={<Bell size={16} />}
                title="OS notifications"
                desc="Allow the wrapped page to fire native notifications via window.__w2a.notify(...)."
                tone="amber"
                checked={draft.notifications}
                onChange={(v) => patch({ notifications: v })}
              />
              <CapabilityCard
                icon={<Power size={16} />}
                title="Launch on startup"
                desc="Start the app automatically when the user signs in."
                tone="amber"
                checked={draft.startupLaunch}
                onChange={(v) => patch({ startupLaunch: v })}
              />
              <CapabilityCard
                icon={<Pin size={16} />}
                title="Always on top"
                desc="Pin the window above all others on launch. Toggle later from the tray."
                tone="violet"
                checked={!!draft.alwaysOnTop}
                onChange={(v) => patch({ alwaysOnTop: v })}
              />
            </div>
            )}

            {activeSection === "deeplink" && (
            <GlassCard className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-accent-violet/10 border border-accent-violet/25 text-accent-violet flex items-center justify-center shrink-0">
                  <Compass size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Deep linking</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Register a custom URL protocol so OS-wide links route to this app.
                  </div>
                </div>
              </div>
              <label className="block">
                <div className="text-2xs uppercase tracking-wider text-text-muted mb-1.5">Protocol scheme</div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm font-mono">myapp</span>
                  <input
                    placeholder="myapp"
                    value={draft.deepLinkProtocol ?? ""}
                    onChange={(e) =>
                      patch({ deepLinkProtocol: e.target.value.toLowerCase().replace(/[^a-z0-9+\-.]/g, "") })
                    }
                    className="input flex-1 max-w-xs font-mono"
                  />
                  <span className="text-text-muted text-sm font-mono">://…</span>
                </div>
                <p className="helper">
                  Leave empty to disable. Lowercase letters, digits, <code className="text-text-secondary">+</code>{" "}
                  <code className="text-text-secondary">-</code> <code className="text-text-secondary">.</code> only.
                </p>
              </label>

              <div className={cn(
                "mt-4 pt-4 border-t border-border/60",
                !draft.deepLinkProtocol && "opacity-50",
              )}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={!draft.deepLinkProtocol}
                    checked={!!draft.oauthExternal}
                    onChange={(e) => patch({ oauthExternal: e.target.checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Externalize OAuth + deep-link callback</div>
                    <p className="helper mt-1">
                      Routes Google / Microsoft / Apple / GitHub sign-in to the user's default
                      browser, then catches{" "}
                      <code className="text-text-secondary">
                        {draft.deepLinkProtocol || "myapp"}://callback
                      </code>{" "}
                      and continues sign-in inside the app. Only works when you control the OAuth
                      provider config — register{" "}
                      <code className="text-text-secondary">
                        {draft.deepLinkProtocol || "myapp"}://callback
                      </code>{" "}
                      as an allowed redirect URI. Single-instance lock recommended.
                    </p>
                  </div>
                </label>
              </div>
            </GlassCard>
            )}

            {activeSection === "shortcuts" && (
            <GlobalShortcutsEditor
              shortcuts={draft.globalShortcuts}
              onChange={(globalShortcuts) => patch({ globalShortcuts })}
            />
            )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function CapabilityCard({
  icon, title, desc, checked, onChange, disabled, tone,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tone: "blue" | "violet" | "green" | "amber";
}) {
  const toneClass = {
    blue:   "bg-accent-blue/10   text-accent-blue   border-accent-blue/25",
    violet: "bg-accent-violet/10 text-accent-violet border-accent-violet/25",
    green:  "bg-accent-green/10  text-accent-green  border-accent-green/25",
    amber:  "bg-accent-amber/10  text-accent-amber  border-accent-amber/25",
  }[tone];

  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "glass rounded-xl p-4 transition",
        checked && "shadow-glow border-accent-blue/30",
        disabled && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0", toneClass)}>
          {icon}
        </div>
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="text-xs text-text-secondary mt-1 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function GlobalShortcutsEditor({
  shortcuts, onChange,
}: {
  shortcuts: GlobalShortcut[];
  onChange: (v: GlobalShortcut[]) => void;
}) {
  function update(idx: number, patch: Partial<GlobalShortcut>) {
    onChange(shortcuts.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function remove(idx: number) {
    onChange(shortcuts.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...shortcuts, { accelerator: "CmdOrCtrl+Shift+Y", action: "toggle" }]);
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/25 text-accent-blue flex items-center justify-center shrink-0">
          <Keyboard size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Global shortcuts</div>
          <div className="text-xs text-text-secondary mt-0.5">
            System-wide keyboard accelerators that work even when the window is hidden.
          </div>
        </div>
        <Button size="sm" leftIcon={<Plus size={13} />} onClick={add}>Add</Button>
      </div>

      {shortcuts.length === 0 ? (
        <div className="text-2xs text-text-muted px-2 py-6 text-center">
          No shortcuts yet — add one above.
        </div>
      ) : (
        <div className="space-y-2">
          {shortcuts.map((sc, i) => {
            const valid = isValidAccelerator(sc.accelerator);
            return (
              <div key={i} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-lg border border-border">
                <Zap size={13} className="text-accent-amber shrink-0" />
                <input
                  value={sc.accelerator}
                  onChange={(e) => update(i, { accelerator: e.target.value })}
                  placeholder="CmdOrCtrl+Shift+Y"
                  className={cn(
                    "input h-8 font-mono text-xs flex-1",
                    !valid && "border-accent-red/40 focus:border-accent-red/60",
                  )}
                />
                <select
                  value={sc.action}
                  onChange={(e) => update(i, { action: e.target.value as GlobalShortcut["action"] })}
                  className="input h-8 text-xs w-32"
                >
                  <option value="toggle">Toggle window</option>
                  <option value="show">Show</option>
                  <option value="hide">Hide</option>
                  <option value="reload">Reload</option>
                  <option value="home">Go home</option>
                  <option value="togglePin">Toggle always-on-top</option>
                </select>
                <IconButton size="sm" tone="danger" icon={<Trash2 size={13} />} onClick={() => remove(i)} />
              </div>
            );
          })}
          <p className="helper">
            Modifiers: <code>CmdOrCtrl</code>, <code>Cmd</code>, <code>Ctrl</code>, <code>Alt</code>,{" "}
            <code>Shift</code>, <code>Super</code>. Combine with <code>+</code>. At least one modifier is required.
          </p>
        </div>
      )}
    </GlassCard>
  );
}

function EmptyState() {
  return (
    <GlassCard className="p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-accent-blue/10 text-accent-blue mx-auto flex items-center justify-center mb-4">
        <Zap size={20} />
      </div>
      <div className="text-sm font-semibold">Pick a project</div>
      <p className="text-xs text-text-secondary mt-1.5 max-w-md mx-auto">
        Choose a project on the left to configure its native capabilities. Create a project from the dashboard if you don't have one yet.
      </p>
    </GlassCard>
  );
}
