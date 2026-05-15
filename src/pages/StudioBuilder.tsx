import { useEffect, useMemo, useState } from "react";
import { Hammer, Loader2, Wand2, MousePointer2, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CategoryTabs } from "@/components/ui/CategoryTabs";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { STUDIO_SCENES, STUDIO_SCENES_BY_ID, type Scene, type Slot } from "@/lib/studioScenes";
import DesignerSurface from "@/components/designer/DesignerSurface";
import { DESIGNER_TEMPLATES, cloneTemplate } from "@/lib/designer/templates";
import { compileDesignerDoc } from "@/lib/designer/compile";
import type { DesignerDoc } from "@/lib/designer/types";
import { cn } from "@/lib/utils";
import { isBuildPlatformEnabled, type BuildPlatformKey } from "@/lib/features";

/**
 * Studio Builder — pick a scene, customize its slots, see a live preview,
 * create a real Electron project from it.
 *
 * The scene's compile() function turns slot values into a complete file
 * map (main.js, index.html, package.json, …). Those files are stored on
 * the project's `sceneFiles` field and the template generator writes them
 * straight to the workspace on every build.
 *
 * Today's slots are text / longText / color. Future iterations can add
 * components, drag-drop placement, data bindings — the data model stays
 * the same shape (slots → compile() → file map) so the editor surface
 * can grow without a schema change.
 */
export default function StudioBuilder() {
  const navigate = useAppStore((s) => s.navigate);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const toast = useToast();

  // Mode toggle: scenes (form-driven) vs designer (drag-drop). Each mode
  // has its own state — switching back keeps your edits.
  const [mode, setMode] = useState<"scenes" | "designer">("designer");

  const [sceneId, setSceneId] = useState<string>(STUDIO_SCENES[0]?.id ?? "");
  const scene: Scene | undefined = STUDIO_SCENES_BY_ID[sceneId];

  // Designer doc state — initialize from the first template.
  const [designerDoc, setDesignerDoc] = useState<DesignerDoc>(() => cloneTemplate(DESIGNER_TEMPLATES[0]));
  const [activeTemplateId, setActiveTemplateId] = useState<string>(DESIGNER_TEMPLATES[0]?.id ?? "");

  function loadDesignerTemplate(tid: string) {
    const t = DESIGNER_TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    setDesignerDoc(cloneTemplate(t));
    setActiveTemplateId(tid);
  }

  // Per-scene slot values. Stored under the scene's id so switching scenes
  // and back preserves the user's edits in each.
  const [slotsByScene, setSlotsByScene] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const s of STUDIO_SCENES) {
      init[s.id] = Object.fromEntries(s.slots.map((slot) => [slot.key, slot.default]));
    }
    return init;
  });

  const slots = scene ? slotsByScene[scene.id] : {};
  function setSlot(key: string, value: string) {
    if (!scene) return;
    setSlotsByScene((all) => ({
      ...all,
      [scene.id]: { ...(all[scene.id] ?? {}), [key]: value },
    }));
  }

  // Compile the scene every time slots change. The compile is pure and
  // cheap (string templating), so re-running on every keystroke is fine
  // and keeps the preview iframe in sync without debouncing.
  const compiled = useMemo(() => {
    if (!scene) return null;
    try { return scene.compile(slots); }
    catch (e) {
      console.error("scene compile failed", e);
      return null;
    }
  }, [scene, slots]);

  // Build a srcdoc string for the preview iframe. Only index.html runs
  // inside the iframe — main.js / preload.js / package.json are project
  // build artifacts and don't need to render here.
  const previewSrcdoc = compiled?.["index.html"] ?? "";

  const [creating, setCreating] = useState(false);

  /** Designer mode create: compile the doc, then create a project. */
  async function createDesignerProject() {
    setCreating(true);
    try {
      const files = compileDesignerDoc(designerDoc);
      const project = await api.projects.create({
        name: designerDoc.appName || "App",
        url: "app://local",
        description: designerDoc.appTagline || "Built with WebToDesktop Builder",
        kind: "starter",
        starterId: `designer:${activeTemplateId}`,
        sceneFiles: files,
        window: {
          width: 1280, height: 820,
          resizable: true, fullscreen: false,
          centerOnLaunch: true, rememberState: true,
        },
        security: {
          contextIsolation: true,
          nodeIntegration: false,
          disableContextMenu: false,
          enableDevToolsInProduction: false,
        },
        platforms: detectDefaultPlatforms(),
      });
      await refreshProjects();
      toast.success(`Created "${project.name}"`, "Open in App Studio to tune, or hit Build.");
      navigate({ name: "studio", projectId: project.id });
    } catch (e) {
      toast.error("Couldn't create project", e instanceof Error ? e.message : String(e));
    } finally { setCreating(false); }
  }

  async function createProject() {
    if (!scene || !compiled) return;
    setCreating(true);
    try {
      const project = await api.projects.create({
        name: slots["title"] || scene.name,
        url: "app://local",
        description: scene.tagline,
        kind: "starter",
        starterId: `scene:${scene.id}`,
        sceneFiles: compiled,
        // Reasonable defaults — the user can tune these in App Studio.
        window: {
          width: 1200, height: 800,
          resizable: true, fullscreen: false,
          centerOnLaunch: true, rememberState: true,
        },
        security: {
          contextIsolation: true,
          nodeIntegration: false,
          disableContextMenu: false,
          enableDevToolsInProduction: false,
        },
        platforms: detectDefaultPlatforms(),
      });
      await refreshProjects();
      toast.success(`Created "${project.name}"`, "Open in App Studio to tune, or hit Build.");
      navigate({ name: "studio", projectId: project.id });
    } catch (e) {
      toast.error("Couldn't create project", e instanceof Error ? e.message : String(e));
    } finally { setCreating(false); }
  }

  if (!scene) {
    return (
      <div className="pb-12">
        <PageHeader eyebrow="Studio · Builder" title="No scenes available" />
      </div>
    );
  }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Studio · Builder"
        title={
          <span className="flex items-center gap-3">
            <span>Visual builder</span>
            <Badge tone="violet" dot>Beta</Badge>
          </span>
        }
        description={
          mode === "designer"
            ? "Drag components from the palette onto the canvas. Pick a layout, drop in headings/buttons/stat cards, then create a real Electron project."
            : "Pick a scene, customize its slots, see a live preview, then export a real Electron project."
        }
        actions={
          <Button
            variant="primary"
            leftIcon={creating ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}
            disabled={creating}
            onClick={mode === "designer" ? createDesignerProject : createProject}
          >
            {creating ? "Creating…" : "Create project"}
          </Button>
        }
      />

      <div className="px-6 lg:px-8 mb-4">
        <CategoryTabs
          tabs={[
            { key: "designer" as const, label: "Designer",  icon: <MousePointer2 size={12} />, count: undefined },
            { key: "scenes"   as const, label: "Scenes",    icon: <FileText size={12} />,      count: STUDIO_SCENES.length },
          ]}
          active={mode}
          onChange={setMode}
        />
      </div>

      {mode === "designer" && (
        <div className="px-6 lg:px-8 space-y-4">
          {/* Template picker — quick-load a prebuilt design into the canvas. */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-2xs uppercase tracking-wider text-text-muted font-semibold shrink-0 mr-1">
              Templates
            </span>
            {DESIGNER_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => loadDesignerTemplate(t.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs transition",
                  activeTemplateId === t.id
                    ? "border-accent-blue bg-accent-blue/10 text-text-primary"
                    : "border-border bg-bg-card text-text-secondary hover:text-text-primary hover:border-border-strong",
                )}
                title={t.tagline}
              >
                <span
                  className="w-5 h-5 rounded inline-flex items-center justify-center text-2xs font-bold text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})` }}
                >
                  {t.glyph}
                </span>
                <span>{t.name}</span>
              </button>
            ))}
            <span className="text-2xs text-text-muted shrink-0 ml-2">
              · loading a template replaces the canvas
            </span>
          </div>
          <DesignerSurface doc={designerDoc} onChange={setDesignerDoc} />
        </div>
      )}

      {mode === "scenes" && (
      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* scene picker */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-2">
          <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-1 px-1">Scenes</div>
          {STUDIO_SCENES.map((s) => (
            <SceneCard
              key={s.id}
              scene={s}
              active={s.id === sceneId}
              onClick={() => setSceneId(s.id)}
            />
          ))}
        </aside>

        {/* live preview */}
        <main className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">Live preview</span>
            <span className="text-2xs text-text-muted">scene · {scene.name}</span>
          </div>
          <GlassCard className="overflow-hidden">
            <div className="aspect-[5/3] bg-bg-input/40 relative">
              <ScenePreview srcdoc={previewSrcdoc} />
            </div>
          </GlassCard>
          <p className="text-2xs text-text-muted mt-2 leading-relaxed">
            The preview is the same HTML/CSS/JS that ships in the generated app.
            <span className="ml-1">After Create project, hit Build to package as .exe / .dmg / .AppImage.</span>
          </p>
        </main>

        {/* slot editor */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 size={13} className="text-accent-violet" />
              <span className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">Customize</span>
            </div>
            {scene.slots.map((slot) => (
              <SlotInput
                key={slot.key}
                slot={slot}
                value={slots[slot.key] ?? slot.default}
                onChange={(v) => setSlot(slot.key, v)}
              />
            ))}
          </GlassCard>
        </aside>
      </div>
      )}
    </div>
  );
}

/* ─────────── pieces ─────────── */

function SceneCard({ scene, active, onClick }: { scene: Scene; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition flex items-start gap-3",
        active
          ? "border-accent-blue/60 ring-2 ring-accent-blue/30 bg-bg-card"
          : "border-border hover:border-border-strong hover:bg-white/[0.03]",
      )}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${scene.grad[0]}, ${scene.grad[1]})` }}
      >
        {scene.glyph}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{scene.name}</div>
        <div className="text-[11px] text-text-secondary mt-0.5 leading-snug line-clamp-2">{scene.tagline}</div>
      </div>
    </button>
  );
}

function SlotInput({ slot, value, onChange }: { slot: Slot; value: string; onChange: (v: string) => void }) {
  if (slot.kind === "color") {
    return (
      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{slot.label}</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-9 h-9 rounded-md border border-border bg-bg-input cursor-default"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="input h-9 font-mono text-xs flex-1"
            placeholder="#5b9dff"
          />
        </div>
        {slot.helper && <p className="helper mt-1">{slot.helper}</p>}
      </div>
    );
  }
  if (slot.kind === "longText") {
    return (
      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{slot.label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="input mt-1 text-xs resize-y"
        />
        {slot.helper && <p className="helper mt-1">{slot.helper}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{slot.label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1 h-9 text-xs"
      />
      {slot.helper && <p className="helper mt-1">{slot.helper}</p>}
    </div>
  );
}

/**
 * Sandbox the preview HTML inside an iframe. `sandbox` strips third-party
 * privileges, then `allow-scripts` re-enables JS so scenes that have
 * interactive bits (like the note-editor's localStorage) actually run.
 *
 * We omit `allow-same-origin` so the iframe is treated as a unique origin
 * (its localStorage is per-iframe, so the preview doesn't pollute the
 * builder's localStorage).
 */
function ScenePreview({ srcdoc }: { srcdoc: string }) {
  // Re-mount the iframe when srcdoc changes so it cleanly re-runs scripts.
  // React updates srcdoc by attribute change which sometimes leaves stale
  // listeners; key-based re-mount is the simplest fix.
  const [k, setK] = useState(0);
  useEffect(() => { setK((n) => n + 1); }, [srcdoc]);
  return (
    <iframe
      key={k}
      title="Scene preview"
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      className="w-full h-full bg-white"
      style={{ border: 0 }}
    />
  );
}

function detectDefaultPlatforms(): ("win" | "mac" | "linux")[] {
  const ua = navigator.userAgent.toLowerCase();
  let picks: ("win" | "mac" | "linux")[];
  if (ua.includes("mac")) picks = ["mac"];
  else if (ua.includes("linux")) picks = ["linux"];
  else picks = ["win"];
  // Drop the host pick if its platform flag is off, falling back to any
  // remaining enabled platform so we never auto-create a project with zero
  // build targets.
  picks = picks.filter((p) => isBuildPlatformEnabled(p as BuildPlatformKey));
  if (picks.length) return picks;
  return (["win", "mac", "linux"] as const).filter(
    (p) => isBuildPlatformEnabled(p as BuildPlatformKey),
  );
}
