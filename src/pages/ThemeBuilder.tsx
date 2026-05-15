import { useEffect, useMemo, useRef, useState } from "react";
import { Save, RotateCcw, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PRESETS, PRESETS_BY_ID, DEFAULT_THEME } from "@/lib/themes/presets";
import type { Theme, AnimationStyle, BackgroundStyle, Density, SidebarStyle, WindowFrameStyle } from "@/lib/themes/types";
import { PresetCard } from "@/components/themeBuilder/PresetCard";
import { PreviewWindow } from "@/components/themeBuilder/PreviewWindow";
import { Section, Row, Segmented, Slider, ColorInput } from "@/components/themeBuilder/inspector";
import { useAppStore } from "@/store/appStore";
import { track } from "@/lib/analytics";
import { useFeatureGuard } from "@/lib/useFeatureGuard";

export default function ThemeBuilder() {
  useFeatureGuard("theme-builder");
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const toast = useToast();

  // Working theme — starts from saved default, falls back to macOS preset.
  const saved = settings?.defaultTheme ?? DEFAULT_THEME;
  const [theme, setTheme] = useState<Theme>(saved);
  const [saving, setSaving] = useState(false);
  const lastSavedKeyRef = useRef<string>("");

  // Force-refresh from disk on mount so a theme saved in another window or
  // session is reflected immediately.
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Hydrate from store whenever the persisted theme changes (load, post-save, etc).
  useEffect(() => {
    if (settings?.defaultTheme) setTheme(settings.defaultTheme);
  }, [settings?.defaultTheme]);

  // Use a stable serialization for dirty detection.
  const themeKey = useMemo(() => JSON.stringify(theme), [theme]);
  const savedKey = useMemo(() => JSON.stringify(saved), [saved]);
  const dirty = themeKey !== savedKey;


  /** Persist a theme value. Used by both the explicit Save button and the
   *  preset-card click (which auto-applies — that was the source of the
   *  "I picked a theme but it didn't apply" UX bug). */
  async function persist(next: Theme, reason: "preset" | "manual") {
    setSaving(true);
    try {
      await updateSettings({ defaultTheme: next });
      lastSavedKeyRef.current = JSON.stringify(next);
      if (reason === "preset") toast.success(`Applied: ${next.name}`);
      else                     toast.success("Theme saved");
    } catch (err) {
      toast.error("Couldn't save theme", err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  // Inspector tweaks PRESERVE the preset id so the preset card stays
  // highlighted. We track "edited" separately by comparing against the
  // pristine preset definition.
  function patch(p: Partial<Theme>) {
    setTheme((t) => ({ ...t, ...p }));
  }
  function patchColors(p: Partial<Theme["colors"]>) {
    setTheme((t) => ({ ...t, colors: { ...t.colors, ...p } }));
  }
  function applyPreset(p: Theme) {
    const next = { ...p };
    setTheme(next);
    track({ name: "theme_applied", props: { theme_id: p.id } });
    void persist(next, "preset");   // auto-save preset selection
  }
  function reset() { setTheme(saved); }
  function save() { void persist(theme, "manual"); }
  /** Restore the current theme's pristine preset values (undoes inspector tweaks). */
  function revertToPreset() {
    const pristine = PRESETS_BY_ID[theme.id];
    if (!pristine) return;
    setTheme({ ...pristine });
    void persist({ ...pristine }, "preset");
  }
  const justSaved = lastSavedKeyRef.current === savedKey && !dirty;

  // True when the current theme was started from a preset but the user has
  // modified inspector values away from pristine.
  const presetSource = PRESETS_BY_ID[theme.id];
  const isEdited = useMemo(
    () => Boolean(presetSource) && JSON.stringify(theme) !== JSON.stringify(presetSource),
    [theme, presetSource],
  );

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Studio · Theme Builder"
        title={
          <span className="flex items-center gap-3">
            <span>Design every generated app</span>
            {/* Reads straight from the persisted store — not local edit state.
                If save failed, this won't change, which is the signal you need. */}
            <Badge tone="green" dot>
              Saved: {settings?.defaultTheme?.name ?? "macOS (default)"}
            </Badge>
          </span>
        }
        description="Pick a preset or build your own. Saved themes apply to every new app you generate; the build pipeline writes the theme to chrome.html as CSS variables."
        actions={
          <div className="flex items-center gap-2">
            {justSaved && <Badge tone="green">Saved</Badge>}
            <Button leftIcon={<RotateCcw size={14} />} disabled={!dirty} onClick={reset}>Reset</Button>
            <Button variant="primary" leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    disabled={!dirty || saving} onClick={save}>
              Save Tweaks
            </Button>
          </div>
        }
      />

      {/* 3-col workspace: presets · preview · inspector. Only goes 3-col at
          2xl (1536+) — at xl the LeftRail + sticky sides squeeze the
          preview column too tight. Below 2xl the inspector stacks below. */}
      <div className="px-6 lg:px-8 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* preset gallery */}
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-accent-violet" />
              <span className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">Presets</span>
            </div>
            <span className="text-2xs text-text-muted">click to apply</span>
          </div>
          <div className="space-y-2">
            {PRESETS.map((p) => (
              <PresetCard
                key={p.id}
                theme={p}
                active={theme.id === p.id}
                edited={theme.id === p.id && isEdited}
                onClick={() => applyPreset(p)}
              />
            ))}
          </div>
          <p className="text-2xs text-text-muted px-1 pt-2 leading-relaxed">
            Presets save instantly. Slider or color tweaks need <kbd className="text-[10px] font-mono bg-white/[0.06] border border-border rounded px-1">Save Tweaks</kbd>.
          </p>
        </aside>

        {/* live preview */}
        <main className="min-w-0">
          <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-2">Live preview</div>
          <PreviewWindow theme={theme} />

          <div className="mt-4 flex items-center justify-between text-2xs text-text-muted">
            <span className="flex items-center gap-2">
              <span>
                {presetSource ? `Preset · ${presetSource.name}` : "Custom theme"}
              </span>
              {isEdited && (
                <>
                  <Badge tone="amber">edited</Badge>
                  <button onClick={revertToPreset} className="text-accent-blue hover:underline">
                    revert to preset
                  </button>
                </>
              )}
            </span>
            <span className="font-mono">{theme.windowFrame} · {theme.sidebar} · r{theme.radius} · g{theme.glass}</span>
          </div>
        </main>

        {/* inspector — at lg-xl the grid is 2-col, so we span both columns
            and stack below the preview. 2xl+ gets a dedicated 3rd column. */}
        <aside className="lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-4 2xl:self-start">
          <GlassCard className="overflow-hidden">
            <Section title="Layout">
              <Row label="Window frame">
                <Segmented<WindowFrameStyle>
                  value={theme.windowFrame}
                  options={[
                    { value: "macos", label: "macOS" },
                    { value: "windows11", label: "Win 11" },
                    { value: "unified", label: "Unified" },
                    { value: "frameless", label: "Frame-less" },
                  ]}
                  onChange={(v) => patch({ windowFrame: v })}
                />
              </Row>
              <Row label="Sidebar">
                <Segmented<SidebarStyle>
                  value={theme.sidebar}
                  options={[
                    { value: "rail", label: "Rail" },
                    { value: "wide", label: "Wide" },
                    { value: "floating", label: "Float" },
                    { value: "hidden", label: "Off" },
                  ]}
                  onChange={(v) => patch({ sidebar: v })}
                />
              </Row>
              <Row label="Background">
                <Segmented<BackgroundStyle>
                  value={theme.background}
                  options={[
                    { value: "solid", label: "Solid" },
                    { value: "gradient", label: "Gradient" },
                    { value: "mesh", label: "Mesh" },
                  ]}
                  onChange={(v) => patch({ background: v })}
                />
              </Row>
              <Row label="Density">
                <Segmented<Density>
                  value={theme.density}
                  options={[
                    { value: "compact", label: "Compact" },
                    { value: "comfortable", label: "Default" },
                    { value: "spacious", label: "Spacious" },
                  ]}
                  onChange={(v) => patch({ density: v })}
                />
              </Row>
            </Section>

            <Section title="Style">
              <Row label="Border radius" hint={`${theme.radius}px`}>
                <Slider value={theme.radius} min={0} max={20} onChange={(v) => patch({ radius: v })} />
              </Row>
              <Row label="Glass intensity" hint={`${theme.glass}`}>
                <Slider value={theme.glass} min={0} max={100} onChange={(v) => patch({ glass: v })} />
              </Row>
              <Row label="Shadow depth" hint={String(theme.shadow)}>
                <Slider value={theme.shadow} min={0} max={3} onChange={(v) => patch({ shadow: v })} />
              </Row>
              <Row label="Title bar height" hint={`${theme.titleBarHeight}px`}>
                <Slider value={theme.titleBarHeight} min={28} max={56} onChange={(v) => patch({ titleBarHeight: v })} />
              </Row>
              <Row label="Animation">
                <Segmented<AnimationStyle>
                  value={theme.animation}
                  options={[
                    { value: "smooth", label: "Smooth" },
                    { value: "snappy", label: "Snappy" },
                    { value: "bouncy", label: "Bouncy" },
                    { value: "none", label: "None" },
                  ]}
                  onChange={(v) => patch({ animation: v })}
                />
              </Row>
            </Section>

            <Section title="Colors">
              <ColorInput label="Background"   value={theme.colors.bg}        onChange={(v) => patchColors({ bg: v })} />
              <ColorInput label="Surface"      value={theme.colors.surface}   onChange={(v) => patchColors({ surface: v })} />
              <ColorInput label="Accent"       value={theme.colors.accent}    onChange={(v) => patchColors({ accent: v })} />
              <ColorInput label="Accent 2"     value={theme.colors.accent2}   onChange={(v) => patchColors({ accent2: v })} />
              <ColorInput label="Text"         value={theme.colors.text}      onChange={(v) => patchColors({ text: v })} />
              <ColorInput label="Border"       value={theme.colors.border}    onChange={(v) => patchColors({ border: v })} />
            </Section>

            <Section title="Window controls">
              <ColorInput label="Close light" value={theme.colors.lights.close}
                onChange={(v) => patchColors({ lights: { ...theme.colors.lights, close: v } })} />
              <ColorInput label="Min light" value={theme.colors.lights.min}
                onChange={(v) => patchColors({ lights: { ...theme.colors.lights, min: v } })} />
              <ColorInput label="Max light" value={theme.colors.lights.max}
                onChange={(v) => patchColors({ lights: { ...theme.colors.lights, max: v } })} />
            </Section>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
