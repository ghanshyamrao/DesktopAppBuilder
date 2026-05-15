import { useEffect, useState } from "react";
import posthog from "posthog-js";
import {
  snapshotAllFlags,
  snapshotAllSettingsSectionFlags,
  snapshotAllAppStudioSectionFlags,
  snapshotAllDashboardSectionFlags,
  snapshotAllTopBarFeatureFlags,
  snapshotAllBuildConsoleFeatureFlags,
  snapshotAllBuildPlatformFlags,
} from "@/lib/features";
import { reloadFeatureFlags } from "@/lib/analytics";

/**
 * Floating debug overlay that shows the current PostHog flag state for
 * every feature. Only mounted in dev mode (gated in App.tsx).
 *
 * The overlay subscribes to `posthog.onFeatureFlags` so values update
 * the moment the SDK refetches. A "Reload" button forces an immediate
 * refresh — useful right after toggling a flag in the PostHog UI.
 */
interface SdkState {
  distinctId: string;
  rawFlags: string[];
  rawVariants: Record<string, string | boolean>;
  errorsLoading: boolean | undefined;
  projectApiKey: string;
  apiHost: string;
}

export default function FlagDebugOverlay() {
  const [snapshot, setSnapshot] = useState(() => snapshotAllFlags());
  const [settingsSnapshot, setSettingsSnapshot] = useState(() => snapshotAllSettingsSectionFlags());
  const [studioSnapshot, setStudioSnapshot] = useState(() => snapshotAllAppStudioSectionFlags());
  const [dashboardSnapshot, setDashboardSnapshot] = useState(() => snapshotAllDashboardSectionFlags());
  const [topBarSnapshot, setTopBarSnapshot] = useState(() => snapshotAllTopBarFeatureFlags());
  const [consoleSnapshot, setConsoleSnapshot] = useState(() => snapshotAllBuildConsoleFeatureFlags());
  const [platformsSnapshot, setPlatformsSnapshot] = useState(() => snapshotAllBuildPlatformFlags());
  const [open, setOpen] = useState(true);
  const [lastReloadAt, setLastReloadAt] = useState<string | null>(null);
  const [sdk, setSdk] = useState<SdkState>(() => readSdkState());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      const result = posthog.onFeatureFlags((flags, variants, options) => {
        setSnapshot(snapshotAllFlags());
        setSettingsSnapshot(snapshotAllSettingsSectionFlags());
        setStudioSnapshot(snapshotAllAppStudioSectionFlags());
        setDashboardSnapshot(snapshotAllDashboardSectionFlags());
        setTopBarSnapshot(snapshotAllTopBarFeatureFlags());
        setConsoleSnapshot(snapshotAllBuildConsoleFeatureFlags());
        setPlatformsSnapshot(snapshotAllBuildPlatformFlags());
        setLastReloadAt(new Date().toLocaleTimeString());
        setSdk({
          ...readSdkState(),
          rawFlags: flags ?? [],
          rawVariants: (variants ?? {}) as Record<string, string | boolean>,
          errorsLoading: options?.errorsLoading,
        });
      });
      if (typeof result === "function") unsub = result;
    } catch {
      // ignore — overlay just shows the static fallback
    }
    return () => unsub?.();
  }, []);

  function forceReload() {
    reloadFeatureFlags();
    setLastReloadAt("requesting…");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={fab}
        title="Show feature-flag debug overlay"
      >
        🚩
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={header}>
        <strong>PostHog flags</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={forceReload} style={btn}>Reload</button>
          <button onClick={() => setOpen(false)} style={btn}>✕</button>
        </div>
      </div>
      <div style={subhead}>
        {lastReloadAt ? `Last update: ${lastReloadAt}` : "Waiting for PostHog…"}
      </div>

      <div style={sdkBlock}>
        <div><strong>distinct_id</strong>: {sdk.distinctId || "—"}</div>
        <div><strong>project key</strong>: {sdk.projectApiKey ? sdk.projectApiKey.slice(0, 12) + "…" : "MISSING"}</div>
        <div><strong>host</strong>: {sdk.apiHost || "—"}</div>
        <div>
          <strong>errors loading</strong>:{" "}
          <span style={{ color: sdk.errorsLoading ? "#f87171" : "#4ade80" }}>
            {sdk.errorsLoading === undefined ? "—" : String(sdk.errorsLoading)}
          </span>
        </div>
        <div>
          <strong>flags returned by SDK</strong> ({sdk.rawFlags.length}):
        </div>
        <div style={{ maxHeight: 60, overflow: "auto", fontFamily: "ui-monospace, monospace", fontSize: 10, opacity: 0.8 }}>
          {sdk.rawFlags.length === 0 ? "(none — SDK got an empty flag set)" : sdk.rawFlags.join(", ")}
        </div>
      </div>

      <div style={sectionLabel}>Top-level features</div>
      <FlagTable rows={snapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>Settings sections</div>
      <FlagTable rows={settingsSnapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>App Studio sections</div>
      <FlagTable rows={studioSnapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>Dashboard sections</div>
      <FlagTable rows={dashboardSnapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>Top bar features</div>
      <FlagTable rows={topBarSnapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>Build console</div>
      <FlagTable rows={consoleSnapshot} />

      <div style={{ ...sectionLabel, marginTop: 10 }}>Build platforms</div>
      <FlagTable rows={platformsSnapshot} />
    </div>
  );
}

function FlagTable({ rows }: { rows: { key: string; flagKey: string; staticValue: boolean; remoteValue: boolean | undefined; effective: boolean }[] }) {
  return (
    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ opacity: 0.6 }}>
          <th style={cell}>Feature</th>
          <th style={cell}>Static</th>
          <th style={cell}>PostHog</th>
          <th style={cell}>Effective</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td style={cell}>
              <div>{row.key}</div>
              <div style={{ opacity: 0.5, fontSize: 9 }}>{row.flagKey}</div>
            </td>
            <td style={cell}>{badge(row.staticValue)}</td>
            <td style={cell}>{row.remoteValue === undefined ? "—" : badge(row.remoteValue)}</td>
            <td style={cell}>{badge(row.effective)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function readSdkState(): SdkState {
  let distinctId = "";
  try { distinctId = posthog.get_distinct_id?.() ?? ""; } catch { /* ignore */ }
  return {
    distinctId,
    rawFlags: [],
    rawVariants: {},
    errorsLoading: undefined,
    projectApiKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY ?? "",
    apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "",
  };
}

function badge(v: boolean): JSX.Element {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        background: v ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
        color: v ? "#4ade80" : "#f87171",
        fontWeight: 600,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {v ? "ON" : "OFF"}
    </span>
  );
}

const panel: React.CSSProperties = {
  position: "fixed",
  bottom: 12,
  right: 12,
  zIndex: 9999,
  width: 320,
  maxHeight: "70vh",
  overflow: "auto",
  padding: 10,
  borderRadius: 8,
  background: "rgba(15,15,20,0.95)",
  color: "white",
  fontFamily: "ui-sans-serif, system-ui",
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
};

const subhead: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.55,
  marginBottom: 8,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const sdkBlock: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.5,
  padding: 6,
  marginBottom: 8,
  borderRadius: 4,
  background: "rgba(255,255,255,0.04)",
};

const cell: React.CSSProperties = {
  textAlign: "left",
  padding: "3px 4px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const btn: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 4,
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.1)",
  cursor: "pointer",
};

const fab: React.CSSProperties = {
  position: "fixed",
  bottom: 12,
  right: 12,
  zIndex: 9999,
  width: 32,
  height: 32,
  borderRadius: 16,
  background: "rgba(15,15,20,0.95)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.1)",
  cursor: "pointer",
  fontSize: 16,
};
