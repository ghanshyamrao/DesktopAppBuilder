import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import WizardStepper, { type WizardStepDef } from "@/components/WizardStepper";
import IconUploader from "@/components/IconUploader";
import CustomCodeEditor from "@/components/CustomCodeEditor";
import Checkbox from "@/components/Checkbox";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { isValidHttpUrl, platformLabel } from "@/lib/utils";
import { track, setProjectGroup, useFeatureFlagsLoadedTick } from "@/lib/analytics";
import { isBuildPlatformEnabled, type BuildPlatformKey } from "@/lib/features";
import type { Platform, SecuritySettings, WindowSettings } from "@/types";
import { AlertCircle, ChevronLeft, Loader2, ArrowRight, Sparkles } from "lucide-react";

const STEPS: WizardStepDef[] = [
  { id: "url", title: "Website URL", subtitle: "Source location" },
  { id: "details", title: "App Details", subtitle: "Name & Icon" },
  { id: "window", title: "Window Settings", subtitle: "Size & Display" },
  { id: "advanced", title: "Advanced", subtitle: "Security & Features" },
  { id: "build", title: "Build", subtitle: "Compile app" },
];

interface FormState {
  url: string;
  name: string;
  description: string;
  icon: { path: string; dataUrl: string } | null;
  window: WindowSettings;
  security: SecuritySettings;
  customCss: string;
  customJs: string;
  platforms: Platform[];
}

export default function CreateWizard() {
  const navigate = useAppStore((s) => s.navigate);
  const settings = useAppStore((s) => s.settings);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const route = useAppStore((s) => s.route);
  const aiDraft = route.name === "wizard" ? route.draft : undefined;
  // When the user picked a starter on the Dashboard, the route carries
  // the starter id. We use this to (a) skip the URL step entirely, (b)
  // pass `kind: "starter"` + `starterId` to projects.create so the
  // template generator picks the right starter directory.
  const starterId = route.name === "wizard" ? route.starterId : undefined;
  const isStarter = !!starterId;

  // Step 0 is "Website URL" — irrelevant for starter projects, so we open
  // the wizard at step 1 (App Details) when starterId is set.
  const [step, setStep] = useState(isStarter ? 1 : 0);

  useEffect(() => {
    track({ name: "wizard_started", props: { starter_id: starterId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(() => ({
    url: aiDraft?.url ?? "",
    name: aiDraft?.name ?? "",
    description: aiDraft?.description ?? "",
    icon: null,
    window: {
      width: aiDraft?.window?.width ?? 1280,
      height: aiDraft?.window?.height ?? 800,
      resizable: aiDraft?.window?.resizable ?? true,
      fullscreen: aiDraft?.window?.fullscreen ?? false,
      centerOnLaunch: aiDraft?.window?.centerOnLaunch ?? true,
      rememberState: aiDraft?.window?.rememberState ?? true,
    },
    security: {
      contextIsolation: aiDraft?.security?.contextIsolation ?? true,
      nodeIntegration: aiDraft?.security?.nodeIntegration ?? false,
      disableContextMenu: aiDraft?.security?.disableContextMenu ?? false,
      enableDevToolsInProduction: aiDraft?.security?.enableDevToolsInProduction ?? false,
      customUserAgent: aiDraft?.security?.customUserAgent ?? "",
    },
    customCss: aiDraft?.customCss ?? "",
    customJs: aiDraft?.customJs ?? "",
    platforms: detectDefaultPlatforms(),
  }));

  // hydrate defaults from settings once available
  useEffect(() => {
    if (!settings) return;
    setForm((f) => ({
      ...f,
      window: { ...settings.defaultWindow, ...f.window },
      security: { ...settings.defaultSecurity, ...f.security },
    }));
  }, [settings]);

  // Auto-grab a favicon when the URL changes — but only if the user hasn't
  // picked an icon themselves. Debounced 700ms so we don't fire on every
  // keystroke, and silently no-op on failure (Library / Upload still work).
  useEffect(() => {
    if (form.icon) return;
    const url = form.url.trim();
    if (!url || !isValidHttpUrl(url)) return;
    const handle = setTimeout(async () => {
      try {
        const result = await api.dialog.fetchFavicon(url);
        if (result) {
          // Re-check inside the timeout — the user may have set an icon
          // while we were debouncing.
          setForm((f) => f.icon ? f : { ...f, icon: result });
        }
      } catch { /* silent — auto-fetch is opportunistic */ }
    }, 700);
    return () => clearTimeout(handle);
  }, [form.url, form.icon]);

  const canAdvance = useMemo(() => validate(form, step, isStarter), [form, step]);

  const next = () => {
    setError(null);
    const v = validate(form, step, isStarter);
    if (!v.ok) {
      setError(v.error ?? "Please fix the errors above");
      return;
    }
    track({ name: "wizard_step_completed", props: { step: STEPS[step].id } });
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  // For starter projects, step 0 (URL) is hidden — clamp Previous so users
  // can't navigate into it via the back button.
  const prev = () => setStep((s) => Math.max(s - 1, isStarter ? 1 : 0));

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const project = await api.projects.create({
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim() || undefined,
        iconPath: form.icon?.path,
        window: form.window,
        security: form.security,
        customCss: form.customCss.trim() ? form.customCss : undefined,
        customJs: form.customJs.trim() ? form.customJs : undefined,
        platforms: form.platforms,
        ...(isStarter ? { kind: "starter" as const, starterId } : {}),
      });
      await refreshProjects();
      clearLogs(project.id);
      setProjectGroup(project.id, project.name);
      track({
        name: "project_created",
        props: {
          project_id: project.id,
          from: isStarter ? "starter" : aiDraft ? "ai" : "wizard",
        },
      });
      track({ name: "wizard_completed", props: { project_id: project.id } });
      await api.builds.start(project.id);
      navigate({ name: "build", projectId: project.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={
          <button onClick={() => navigate({ name: "dashboard" })} className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition">
            <ChevronLeft size={11} /> All apps
          </button>
        }
        title={
          isStarter
            ? <>Start a new <span className="text-gradient">desktop project</span></>
            : <>Create a new <span className="text-gradient">desktop app</span></>
        }
        description={isStarter
          ? "Configure your starter project — name, icon, window. Build to .exe or export the source folder."
          : "Five quick steps. Web URL in, native installer out."}
      />

      <div className="px-8 grid gap-6" style={{ gridTemplateColumns: "260px minmax(0, 1fr)" }}>
        <div className="sticky top-4 self-start">
          <WizardStepper
            // For starter projects we hide the URL step (idx 0) entirely
            // so the stepper visually matches what the user can navigate
            // to. The step indices passed to onJump still reference the
            // original STEPS array — we just slice the visible list.
            steps={isStarter ? STEPS.slice(1) : STEPS}
            current={isStarter ? Math.max(0, step - 1) : step}
            onJump={(i) => setStep(isStarter ? i + 1 : i)}
          />
        </div>

        <div className="max-w-3xl">
          {step === 0 && <UrlStep form={form} setForm={setForm} />}
          {step === 1 && <DetailsStep form={form} setForm={setForm} />}
          {step === 2 && <WindowStep form={form} setForm={setForm} />}
          {step === 3 && <AdvancedStep form={form} setForm={setForm} />}
          {step === 4 && <BuildStep form={form} setForm={setForm} />}

          {error && (
            <div className="mt-5 flex items-start gap-2.5 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-8">
            <Button onClick={prev} disabled={step === 0 || submitting}>Previous</Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" rightIcon={<ArrowRight size={14} />} onClick={next} disabled={!canAdvance.ok}>
                Continue to {STEPS[step + 1].title}
              </Button>
            ) : (
              <Button variant="primary" leftIcon={submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} onClick={submit} disabled={submitting || !canAdvance.ok}>
                {submitting ? "Generating…" : "Generate App"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function detectDefaultPlatforms(): Platform[] {
  const ua = navigator.userAgent.toLowerCase();
  // Pick the host-matching platform first, but drop it if its flag is off
  // so a remotely-disabled platform never starts pre-selected.
  let picks: Platform[];
  if (ua.includes("mac")) picks = ["mac"];
  else if (ua.includes("linux")) picks = ["linux"];
  else picks = ["win"];
  picks = picks.filter((p) => isBuildPlatformEnabled(p as BuildPlatformKey));
  if (picks.length) return picks;
  // Host platform is disabled — fall back to whichever remaining platform
  // is still on, in the canonical order, so the wizard is never stuck with
  // an empty default selection.
  const fallback = (["win", "mac", "linux"] as Platform[]).filter(
    (p) => isBuildPlatformEnabled(p as BuildPlatformKey),
  );
  return fallback;
}

interface ValidationResult {
  ok: boolean;
  error?: string;
}

function validate(form: FormState, step: number, isStarter = false): ValidationResult {
  if (step === 0 && !isStarter) {
    if (!form.url.trim()) return { ok: false, error: "URL is required" };
    if (!isValidHttpUrl(form.url.trim())) return { ok: false, error: "Enter a valid http(s) URL" };
  }
  if (step === 1) {
    if (!form.name.trim()) return { ok: false, error: "App name is required" };
    if (form.name.trim().length < 2) return { ok: false, error: "App name is too short" };
  }
  if (step === 2) {
    if (form.window.width < 320 || form.window.height < 240) {
      return { ok: false, error: "Window size must be at least 320×240" };
    }
  }
  if (step === 4) {
    if (form.platforms.length === 0) return { ok: false, error: "Select at least one platform" };
  }
  return { ok: true };
}

interface StepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}

function UrlStep({ form, setForm }: StepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1.5">Website URL</h2>
      <p className="text-text-secondary mb-7 text-sm">
        Enter the address of the website you want to package as a desktop app.
      </p>
      <div className="panel p-6">
        <label className="label">URL</label>
        <input
          type="url"
          autoFocus
          placeholder="https://linear.app"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          className="input"
        />
        <p className="helper">Must use http or https protocol.</p>
      </div>
    </div>
  );
}

function DetailsStep({ form, setForm }: StepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1.5">App Details</h2>
      <p className="text-text-secondary mb-7 text-sm">Configure how your app appears on the user's machine.</p>
      <div className="panel p-6 space-y-5">
        <div>
          <label className="label">App Name</label>
          <input
            placeholder="Linear Clone"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            placeholder="The best issue tracker"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="label">App Icon</label>
          <IconUploader
            iconPath={form.icon?.path}
            iconDataUrl={form.icon?.dataUrl}
            appUrl={form.url}
            appName={form.name}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
          />
        </div>
      </div>
    </div>
  );
}

function WindowStep({ form, setForm }: StepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1.5">Window Settings</h2>
      <p className="text-text-secondary mb-7 text-sm">Default size and display behavior for the launched app.</p>
      <div className="panel p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default Width (px)</label>
            <input
              type="number"
              min={320}
              value={form.window.width}
              onChange={(e) =>
                setForm((f) => ({ ...f, window: { ...f.window, width: Number(e.target.value) || 0 } }))
              }
              className="input"
            />
          </div>
          <div>
            <label className="label">Default Height (px)</label>
            <input
              type="number"
              min={240}
              value={form.window.height}
              onChange={(e) =>
                setForm((f) => ({ ...f, window: { ...f.window, height: Number(e.target.value) || 0 } }))
              }
              className="input"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-1">
          <Checkbox
            checked={form.window.centerOnLaunch}
            onChange={(v) => setForm((f) => ({ ...f, window: { ...f.window, centerOnLaunch: v } }))}
            label="Center window on launch"
            description="Always open new apps in the center of the primary display."
          />
          <Checkbox
            checked={form.window.rememberState}
            onChange={(v) => setForm((f) => ({ ...f, window: { ...f.window, rememberState: v } }))}
            label="Remember window state"
            description="Restore size and position from previous session."
          />
          <Checkbox
            checked={form.window.resizable}
            onChange={(v) => setForm((f) => ({ ...f, window: { ...f.window, resizable: v } }))}
            label="Allow resizing"
            description="Let users drag the window edges to resize."
          />
          <Checkbox
            checked={form.window.fullscreen}
            onChange={(v) => setForm((f) => ({ ...f, window: { ...f.window, fullscreen: v } }))}
            label="Launch fullscreen"
            description="Open the app maximized to the full screen."
          />
        </div>
      </div>
    </div>
  );
}

function AdvancedStep({ form, setForm }: StepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1.5">Advanced</h2>
      <p className="text-text-secondary mb-7 text-sm">Security model and developer features.</p>
      <div className="panel p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold mb-3">Security</h3>
          <div className="space-y-1">
            <Checkbox
              checked={form.security.contextIsolation}
              onChange={(v) => setForm((f) => ({ ...f, security: { ...f.security, contextIsolation: v } }))}
              label="Context isolation (recommended)"
              description="Isolates renderer JavaScript from preload and Electron internals."
            />
            <Checkbox
              checked={form.security.nodeIntegration}
              onChange={(v) => setForm((f) => ({ ...f, security: { ...f.security, nodeIntegration: v } }))}
              label="Node integration"
              description="Exposes Node.js APIs in the renderer. Disabled by default for security."
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-3">Features</h3>
          <div className="space-y-1">
            <Checkbox
              checked={form.security.disableContextMenu}
              onChange={(v) => setForm((f) => ({ ...f, security: { ...f.security, disableContextMenu: v } }))}
              label="Disable Right Click (Context Menu)"
              description="Prevents users from inspecting elements or copying text easily."
            />
            <Checkbox
              checked={form.security.enableDevToolsInProduction}
              onChange={(v) =>
                setForm((f) => ({ ...f, security: { ...f.security, enableDevToolsInProduction: v } }))
              }
              label="Enable Developer Tools in Production"
              description="Allow F12 to open devtools in built apps."
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label className="label">Custom User Agent</label>
          <input
            placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X...)"
            value={form.security.customUserAgent ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, security: { ...f.security, customUserAgent: e.target.value } }))
            }
            className="input"
          />
          <p className="helper">Override the default user agent string for all web views.</p>
        </div>

        <div className="border-t border-border pt-4">
          <label className="label">Page customization</label>
          <CustomCodeEditor
            customCss={form.customCss}
            customJs={form.customJs}
            onChange={({ customCss, customJs }) =>
              setForm((f) => ({ ...f, customCss: customCss ?? f.customCss, customJs: customJs ?? f.customJs }))
            }
          />
        </div>
      </div>
    </div>
  );
}

function BuildStep({ form, setForm }: StepProps) {
  // Re-render when PostHog reloads flags so toggling a platform flag adds /
  // removes its tile without a reload.
  useFeatureFlagsLoadedTick();

  // Only show tiles for platforms with their flag on. If an existing
  // form.platforms selection contains a flag-disabled platform (e.g. the
  // operator turned a target off mid-session), strip it on next render
  // so the persisted draft doesn't ship a target the user can't see.
  const visiblePlatforms = useMemo<Platform[]>(
    () => (["win", "mac", "linux"] as Platform[]).filter(
      (p) => isBuildPlatformEnabled(p as BuildPlatformKey),
    ),
    // Re-evaluate when flags refresh — useFeatureFlagsLoadedTick re-renders us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    const allowed = new Set(visiblePlatforms);
    if (form.platforms.some((p) => !allowed.has(p))) {
      setForm((f) => ({ ...f, platforms: f.platforms.filter((p) => allowed.has(p)) }));
    }
  }, [visiblePlatforms, form.platforms, setForm]);

  const togglePlatform = (p: Platform) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1.5">Build</h2>
      <p className="text-text-secondary mb-7 text-sm">Choose your output targets and start the build.</p>
      <div className="panel p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold mb-3">Target Platforms</h3>
          {visiblePlatforms.length === 0 ? (
            <p className="text-xs text-accent-red">
              No build platforms are enabled. Ask an operator to turn one on in PostHog.
            </p>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${visiblePlatforms.length}, minmax(0, 1fr))` }}
            >
              {visiblePlatforms.map((p) => {
                const selected = form.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={
                      "panel p-4 text-center transition " +
                      (selected ? "border-accent-blue/60 bg-accent-blue/5" : "hover:border-border-strong")
                    }
                  >
                    <div className="text-sm font-medium">{platformLabel(p)}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {p === "win" ? ".exe" : p === "mac" ? ".dmg" : "AppImage"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="helper mt-2">
            Note: cross-platform builds may require platform-specific tooling (e.g. macOS for .dmg).
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-3">Summary</h3>
          <dl className="text-sm grid grid-cols-[140px_1fr] gap-y-2 text-text-secondary">
            <dt>Name</dt><dd className="text-text-primary">{form.name || "—"}</dd>
            <dt>URL</dt><dd className="text-text-primary truncate">{form.url || "—"}</dd>
            <dt>Window</dt><dd className="text-text-primary">{form.window.width}×{form.window.height}</dd>
            <dt>Context isolation</dt><dd className="text-text-primary">{form.security.contextIsolation ? "On" : "Off"}</dd>
            <dt>Targets</dt><dd className="text-text-primary">{form.platforms.map(platformLabel).join(", ") || "None"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
