import { useEffect, useMemo, useState } from "react";
import {
  Save, Loader2, Globe, Image as ImageIcon, Hammer, Palette, Sparkles, Pin, X, AlertTriangle, Download, Upload, Github, ShieldCheck, Code2, AppWindow, Copy, FolderOutput,
} from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { ProjectPicker } from "@/components/ProjectPicker";
import { PreviewWindow } from "@/components/themeBuilder/PreviewWindow";
import IconUploader from "@/components/IconUploader";
import CustomCodeEditor from "@/components/CustomCodeEditor";
import BuildHistory from "@/components/BuildHistory";
import { SubSidebar, type SubNavEntry } from "@/components/ui/SubSidebar";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/store/appStore";
import { api, requireFeature } from "@/lib/api";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { DEFAULT_THEME, PRESETS_BY_ID } from "@/lib/themes/presets";
import { isAppStudioSectionEnabled, type AppStudioSectionKey } from "@/lib/features";
import { useFeatureFlagsLoadedTick } from "@/lib/analytics";
import type { AppProject } from "@/types";

/** Sub-sidebar section keys. Order in this list = order in the sub-rail. */
type SectionKey = AppStudioSectionKey;

const ALL_SUB_NAV: readonly SubNavEntry<SectionKey>[] = [
  { key: "identity",     label: "Identity",       icon: <Globe size={14} /> },
  { key: "icon",         label: "Icon",           icon: <ImageIcon size={14} /> },
  { key: "window",       label: "Window",         icon: <AppWindow size={14} /> },
  { key: "security",     label: "Security",       icon: <ShieldCheck size={14} /> },
  { key: "code",         label: "Page code",      icon: <Code2 size={14} /> },
  { key: "distribution", label: "Distribution",   icon: <Upload size={14} /> },
  { key: "history",      label: "Build history",  icon: <Hammer size={14} /> },
];

export default function AppStudio() {
  const projects = useAppStore((s) => s.projects);
  const route = useAppStore((s) => s.route);
  const navigate = useAppStore((s) => s.navigate);
  const settings = useAppStore((s) => s.settings);
  const liveProgress = useAppStore((s) => s.liveProgress);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const toast = useToast();

  // Force-refresh settings + projects when this page mounts so a theme just
  // saved in Theme Builder, or actions just saved in Action Builder, are
  // immediately reflected here. Cheap (one IPC each) and removes a whole
  // class of "I changed it but it doesn't show" bugs.
  useEffect(() => {
    void loadSettings();
    void refreshProjects();
  }, [loadSettings, refreshProjects]);

  const initialId = route.name === "studio" ? route.projectId ?? projects[0]?.id ?? null : null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  useEffect(() => {
    if (!selectedId && projects[0]) setSelectedId(projects[0].id);
  }, [projects, selectedId]);

  const project: AppProject | undefined = projects.find((p) => p.id === selectedId);
  const [draft, setDraft] = useState<Partial<AppProject>>({});
  useEffect(() => { setDraft({}); }, [project?.id]);

  // Re-render when PostHog flags refresh so toggling a studio-section flag
  // updates the sub-rail without a reload.
  const flagsTick = useFeatureFlagsLoadedTick();

  // Filter the sub-nav through the AppStudio-section flags. Memoize on
  // `flagsTick` so we only re-walk the list when flag values change.
  const subNav = useMemo<readonly SubNavEntry<SectionKey>[]>(
    () => ALL_SUB_NAV.filter((e) => isAppStudioSectionEnabled(e.key)),
    [flagsTick],
  );
  const defaultSection: SectionKey = subNav[0]?.key ?? "identity";

  // Sub-sidebar state. Persisted in component state only (not URL/store) —
  // intentional: switching projects shouldn't bounce the user back to a
  // section they didn't have open. They land where they left off.
  const [activeSection, setActiveSection] = useState<SectionKey>(defaultSection);

  // If the active section just got hidden by a flag flip, snap the rail to
  // the first still-visible entry.
  useEffect(() => {
    if (!subNav.some((e) => e.key === activeSection)) {
      setActiveSection(defaultSection);
    }
  }, [subNav, activeSection, defaultSection]);

  const merged = useMemo(() => {
    if (!project) return null;
    return { ...project, ...draft, window: { ...project.window, ...(draft.window ?? {}) }, security: { ...project.security, ...(draft.security ?? {}) } };
  }, [project, draft]);

  const dirty = Object.keys(draft).length > 0;
  const [saving, setSaving] = useState(false);
  // Local "I just clicked the button" flag covers the moment between click
  // and the first progress event from the orchestrator. The store-derived
  // `isBuilding` below is the source of truth for the rest of the build.
  const [buildClicked, setBuildClicked] = useState(false);

  /** True while *this* project is queued or actively building, regardless
   *  of which page started the build. Driven by the live progress stream
   *  so the button stays disabled for the entire build duration. */
  const isBuilding = useMemo(() => {
    if (!project) return false;
    if (buildClicked) return true;
    const status = liveProgress[project.id]?.status;
    return status === "building" || status === "queued";
  }, [project, buildClicked, liveProgress]);

  const previewTheme = useMemo(() => {
    if (!merged) return DEFAULT_THEME;
    if (merged.theme) return merged.theme;
    if (settings?.defaultTheme) return settings.defaultTheme;
    return DEFAULT_THEME;
  }, [merged, settings?.defaultTheme]);

  /**
   * The installed app is "stale" when project settings (or global theme)
   * have changed since the last successful build. We compare timestamps:
   *   - project.updatedAt vs lastBuild.startedAt → catches edits in App Studio,
   *     Action Builder, or theme pinning.
   *   - settings.updatedAt is not tracked, so we conservatively also flag
   *     stale when there's a global theme but no project pin (the user might
   *     have changed the global theme since last build).
   */
  const needsRebuild = useMemo(() => {
    if (!project) return false;
    if (dirty) return true;                         // unsaved local edits
    if (!project.lastBuild) return true;            // never built
    if (project.lastBuild.status !== "success") return true;
    const built = new Date(project.lastBuild.startedAt).getTime();
    const updated = new Date(project.updatedAt).getTime();
    return updated > built;
  }, [project, dirty]);

  async function save() {
    if (!project) return;
    setSaving(true);
    try {
      await api.projects.update(project.id, draft);
      await refreshProjects();
      setDraft({});
      toast.success("Project saved");
    } catch (err) {
      toast.error("Couldn't save project", err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  async function saveAndBuild() {
    if (!project || isBuilding) return;
    setBuildClicked(true);
    try {
      if (dirty) await api.projects.update(project.id, draft);
      await api.builds.start(project.id);
      await refreshProjects();
      navigate({ name: "build", projectId: project.id });
    } catch (err) {
      toast.error("Couldn't start build", err instanceof Error ? err.message : String(err));
    } finally {
      // Release the local flag — the live progress stream now drives the
      // disabled state for the rest of the build.
      setBuildClicked(false);
    }
  }

  /** Pin the current global theme onto this project as an override. */
  async function pinThemeToProject() {
    if (!project || !settings?.defaultTheme) return;
    try {
      await api.projects.update(project.id, { theme: settings.defaultTheme });
      await refreshProjects();
      toast.success("Theme pinned to project", `${settings.defaultTheme.name} will be used for builds of ${project.name}.`);
    } catch (err) {
      toast.error("Couldn't pin theme", err instanceof Error ? err.message : String(err));
    }
  }

  /** Drop the project's theme override and fall back to the global default. */
  async function unpinTheme() {
    if (!project) return;
    try {
      await api.projects.update(project.id, { theme: null });
      await refreshProjects();
      toast.info("Theme override cleared", "This project will use the global default theme.");
    } catch (err) {
      toast.error("Couldn't clear theme", err instanceof Error ? err.message : String(err));
    }
  }

  function patch(p: Partial<AppProject>) { setDraft((d) => ({ ...d, ...p })); }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Studio · App Studio"
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <span>Edit and preview your apps</span>
            <Badge tone="violet" dot className="text-2xs whitespace-nowrap shrink-0">Live preview</Badge>
          </span>
        }
        description="Tune name, URL, icon, window behavior and security per project. The preview reflects the project's theme — change it in Theme Builder, applied here on save."
        actions={
          project && (
            <div className="flex items-center gap-2">
              <Button leftIcon={<Copy size={14} />} onClick={async () => {
                try {
                  const result = await api.projects.clone(project.id);
                  await refreshProjects();
                  setSelectedId(result.project.id);
                  toast.success(`Cloned as "${result.project.name}"`);
                } catch (e) {
                  toast.error("Clone failed", e instanceof Error ? e.message : String(e));
                }
              }}>
                Clone
              </Button>
              <Button leftIcon={<Download size={14} />} onClick={async () => {
                try {
                  const result = await api.projects.export(project.id);
                  if (!result.cancelled && result.filePath) toast.success("Project exported", result.filePath);
                } catch (e) {
                  toast.error("Export failed", e instanceof Error ? e.message : String(e));
                }
              }}>
                Export .w2d
              </Button>
              <Button leftIcon={<FolderOutput size={14} />} onClick={async () => {
                try {
                  const result = await api.projects.exportSource(project.id);
                  if (!result.cancelled && result.destDir) {
                    toast.success("Source exported", `${result.destDir}\nRun \`npm install && npm start\` there to launch it.`);
                  }
                } catch (e) {
                  toast.error("Source export failed", e instanceof Error ? e.message : String(e));
                }
              }}>
                Export source
              </Button>
              <Button leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} disabled={!dirty || saving} onClick={save}>
                Save
              </Button>
              <Button
                variant="primary"
                leftIcon={isBuilding ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}
                disabled={isBuilding}
                onClick={saveAndBuild}
                title={isBuilding ? "A build is already running for this app" : undefined}
              >
                {isBuilding ? "Building…" : "Save & Rebuild"}
              </Button>
            </div>
          )
        }
      />

      {/* Responsive grid:
            < lg (≤1023): single column — picker on top, then content, then preview.
            lg–2xl (1024–1535): 2 cols [picker | content]; preview stacks full width below.
            ≥ 2xl (1536+): 3 cols side-by-side.
          We DON'T enable 3-col at xl (1280-1535) because once the LeftRail
          (~248px), project picker, gaps, and padding are subtracted, the
          content column shrinks below ~350px and form inputs get truncated.
          1536+ has roughly 250px of extra horizontal space which is enough
          to comfortably show three columns. */}
      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_360px]">
        {/* project picker */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">Projects</span>
            <Button size="sm" variant="ghost" onClick={() => navigate({ name: "wizard" })}>+ New</Button>
          </div>
          <ProjectPicker projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
        </aside>

        {/* edit form */}
        {!merged ? (
          <main className="min-w-0">
            <EmptyState onCreate={() => navigate({ name: "wizard" })} />
          </main>
        ) : (
          <main className="min-w-0 space-y-4">
            {needsRebuild && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-accent-amber/10 border border-accent-amber/30 text-accent-amber">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-text-primary">
                  <div className="font-semibold">The installed app is out of date.</div>
                  <div className="text-text-secondary mt-0.5">
                    Theme, actions or settings have changed since the last successful build. Click <span className="text-accent-amber">Save & Rebuild</span> above to regenerate the .exe with the new look.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Hammer size={12} />}
                  onClick={saveAndBuild}
                  disabled={isBuilding}
                  title={isBuilding ? "A build is already running for this app" : undefined}
                >
                  {isBuilding ? "Building…" : "Rebuild now"}
                </Button>
              </div>
            )}

            {/* sub-sidebar + active section. 160px rail keeps the form
                 column wide enough for URLs and CSS at typical laptop
                 widths. Stacks below sm. */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)]">
              <SubSidebar entries={subNav} active={activeSection} onChange={setActiveSection} />
              <div className="min-w-0 space-y-4">
                {activeSection === "identity" && isAppStudioSectionEnabled("identity") && (
                  <Section icon={<Globe size={14} />} title="Identity">
              <Field label="App name">
                <input value={merged.name} onChange={(e) => patch({ name: e.target.value })} className="input" />
              </Field>
              <Field label="URL" helper={!isValidHttpUrl(merged.url) ? "Invalid http(s) URL" : undefined}>
                <input value={merged.url} onChange={(e) => patch({ url: e.target.value })} className="input" />
              </Field>
              <Field label="Description">
                <input value={merged.description ?? ""} onChange={(e) => patch({ description: e.target.value })} className="input" />
              </Field>
            </Section>
                )}
                {activeSection === "icon" && isAppStudioSectionEnabled("icon") && (
            <Section icon={<ImageIcon size={14} />} title="Icon">
              <IconUploader
                iconPath={merged.iconPath}
                iconDataUrl={undefined}
                appUrl={merged.url}
                appName={merged.name}
                onChange={(icon) => patch({ iconPath: icon?.path })}
              />
              <p className="helper mt-2">PNG below 256×256 will be auto-upscaled at build time. Use .ico for the sharpest Windows icon.</p>
            </Section>
                )}
                {activeSection === "window" && isAppStudioSectionEnabled("window") && (
            <Section icon={<AppWindow size={14} />} title="Window">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width">
                  <input type="number" min={320} value={merged.window.width}
                    onChange={(e) => patch({ window: { ...merged.window, width: Number(e.target.value) || 0 } })}
                    className="input" />
                </Field>
                <Field label="Height">
                  <input type="number" min={240} value={merged.window.height}
                    onChange={(e) => patch({ window: { ...merged.window, height: Number(e.target.value) || 0 } })}
                    className="input" />
                </Field>
              </div>
              <ToggleRow label="Resizable"
                hint="Allow users to drag the window edges."
                checked={merged.window.resizable}
                onChange={(v) => patch({ window: { ...merged.window, resizable: v } })} />
              <ToggleRow label="Launch fullscreen"
                hint="Start maximized to the full screen."
                checked={merged.window.fullscreen}
                onChange={(v) => patch({ window: { ...merged.window, fullscreen: v } })} />
              <ToggleRow label="Center on launch"
                hint="Open in the center of the primary display."
                checked={merged.window.centerOnLaunch}
                onChange={(v) => patch({ window: { ...merged.window, centerOnLaunch: v } })} />
              <ToggleRow label="Remember window state"
                hint="Restore size and position from previous session."
                checked={merged.window.rememberState}
                onChange={(v) => patch({ window: { ...merged.window, rememberState: v } })} />
            </Section>
                )}
                {activeSection === "security" && isAppStudioSectionEnabled("security") && (
            <Section icon={<ShieldCheck size={14} />} title="Security">
              <ToggleRow label="Context isolation (recommended)"
                hint="Isolate renderer JS from preload and Electron internals."
                checked={merged.security.contextIsolation}
                onChange={(v) => patch({ security: { ...merged.security, contextIsolation: v } })} />
              <ToggleRow label="Node integration"
                hint="Expose Node APIs in the renderer. Disable for remote URLs."
                checked={merged.security.nodeIntegration}
                onChange={(v) => patch({ security: { ...merged.security, nodeIntegration: v } })} />
              <ToggleRow label="Disable right-click"
                hint="Prevent the context menu in the wrapped page."
                checked={merged.security.disableContextMenu}
                onChange={(v) => patch({ security: { ...merged.security, disableContextMenu: v } })} />
              <ToggleRow label="DevTools in production"
                hint="Allow F12 in built apps."
                checked={merged.security.enableDevToolsInProduction}
                onChange={(v) => patch({ security: { ...merged.security, enableDevToolsInProduction: v } })} />
            </Section>
                )}
                {activeSection === "code" && isAppStudioSectionEnabled("code") && (
            <Section icon={<Code2 size={14} />} title="Page customization">
              <CustomCodeEditor
                customCss={merged.customCss}
                customJs={merged.customJs}
                onChange={({ customCss, customJs }) => patch({
                  ...(customCss !== undefined ? { customCss } : {}),
                  ...(customJs !== undefined ? { customJs } : {}),
                })}
              />
              <p className="helper mt-2">
                Inject CSS / JS into the wrapped page after dom-ready — dark-mode any site, hide ads, or
                add keyboard shortcuts. Re-applied on every navigation.
              </p>
            </Section>
                )}
                {activeSection === "distribution" && isAppStudioSectionEnabled("distribution") && (
            <Section icon={<Upload size={14} />} title="Distribution">
              <Field label="Auto-update feed URL" helper="Directory hosting latest.yml + installer artifacts. Generated app polls every 4h. Leave empty to disable.">
                <input
                  type="url"
                  placeholder="https://updates.example.com/myapp/"
                  value={merged.updateFeedUrl ?? ""}
                  onChange={(e) => patch({ updateFeedUrl: e.target.value })}
                  className="input font-mono"
                />
              </Field>
              <Field label="GitHub repository" helper="owner/repo. Used by the “Publish to GitHub” button on the build screen. Token lives in Settings.">
                <div className="flex items-center gap-2">
                  <Github size={14} className="text-text-secondary shrink-0" />
                  <input
                    placeholder="acme/my-app"
                    value={merged.githubRepo ?? ""}
                    onChange={(e) => patch({ githubRepo: e.target.value })}
                    className="input font-mono flex-1"
                  />
                </div>
              </Field>
            </Section>
                )}
                {activeSection === "history" && isAppStudioSectionEnabled("history") && (
            <Section icon={<Hammer size={14} />} title="Build history">
              <BuildHistory
                builds={merged.builds ?? (merged.lastBuild ? [merged.lastBuild] : [])}
                onRevealOutput={() => api.builds.revealOutput(merged.id).catch(() => {})}
              />
            </Section>
                )}
              </div>
            </div>

            {/* Action Builder shortcut — outside the section switch so it's
                always reachable, regardless of which sub-section is open. */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-border">
              <div className="text-xs text-text-secondary flex items-center gap-2">
                <Sparkles size={13} className="text-accent-violet" />
                Configure native capabilities (tray, shortcuts, deep links)
              </div>
              <Button
                size="sm"
                variant="neon"
                onClick={() => {
                  if (!requireFeature("action-builder")) return;
                  navigate({ name: "actions" });
                }}
              >
                Open Action Builder
              </Button>
            </div>
          </main>
        )}

        {/* live preview — at lg-xl the grid is 2-col so we span both cols
            and stack below the form. At 2xl+, the grid has a dedicated 3rd
            column and we sit there, sticky. */}
        <aside className="lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-4 2xl:self-start space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">Live preview</span>
            <Badge tone={merged?.theme ? "violet" : "muted"}>
              <Palette size={9} className="mr-1" />
              {previewTheme.id === "custom" ? "Custom" : PRESETS_BY_ID[previewTheme.id]?.name ?? previewTheme.name}
            </Badge>
          </div>

          {merged ? (
            <motion.div
              // include the theme identity in the key so changing the global
              // theme or pinning a project theme forces a full remount of the
              // preview — no stale CSS variables can hang around.
              key={`${merged.id}:${previewTheme.id}:${previewTheme.colors.accent}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <PreviewWindow theme={previewTheme} />
            </motion.div>
          ) : (
            <GlassCard className="aspect-[16/10]" />
          )}

          {/* theme source controls */}
          {merged && (
            <GlassCard className="p-3 text-xs">
              {merged.theme ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-accent-violet">
                    <Pin size={11} />
                    <span className="font-semibold">Pinned theme</span>
                  </div>
                  <p className="text-text-secondary leading-relaxed">
                    This project always builds with <span className="text-text-primary">{merged.theme.name}</span> — independent of the global default.
                  </p>
                  <Button size="sm" variant="ghost" leftIcon={<X size={11} />} onClick={unpinTheme}>
                    Clear override
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <Palette size={11} />
                    <span className="font-semibold text-text-primary">Using global theme</span>
                  </div>
                  <p className="text-text-secondary leading-relaxed">
                    Builds use the global default ({settings?.defaultTheme?.name ?? "macOS"}). Theme changes only apply to the installed app after a rebuild — pin it now to lock this project in case you change the global default later.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="neon" leftIcon={<Pin size={11} />} onClick={pinThemeToProject} disabled={!settings?.defaultTheme}>
                      Pin to project
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate({ name: "themes" })}>
                      Edit theme
                    </Button>
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          <div className="text-2xs text-text-muted px-1">
            {merged && `${merged.window.width}×${merged.window.height} · ${merged.security.contextIsolation ? "isolated" : "no-isolation"}`}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-border text-text-secondary flex items-center justify-center">{icon}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </GlassCard>
  );
}

function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {helper && <p className="helper text-accent-red">{helper}</p>}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[12.5px]">{label}</div>
        <div className="text-[11px] text-text-secondary mt-0.5">{hint}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <GlassCard className="p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-accent-blue/10 text-accent-blue mx-auto flex items-center justify-center mb-4">
        <Sparkles size={20} />
      </div>
      <div className="text-sm font-semibold">Pick a project to edit</div>
      <p className="text-xs text-text-secondary mt-1.5 max-w-md mx-auto mb-5">
        App Studio lets you tweak any existing project with a live preview. Or create a new one from the wizard.
      </p>
      <Button variant="primary" onClick={onCreate}>Create new app</Button>
    </GlassCard>
  );
}
