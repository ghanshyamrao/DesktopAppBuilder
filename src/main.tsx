import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, readCachedTheme } from "@/lib/theme";
import posthog from "posthog-js";

// PostHog: full product analytics stack. Skipped silently when no key is
// configured (CI, fresh checkouts without `.env`) so dev still works.
if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    person_profiles: "identified_only",
    // Auto-capture clicks/inputs so we don't have to wire every button.
    autocapture: true,
    // Capture pageviews from history changes; the app navigates via a
    // store rather than the URL bar, so we also emit explicit `route_viewed`
    // events from App.tsx for fine-grained funnels.
    capture_pageview: true,
    capture_pageleave: true,
    // Session replay — desktop apps are otherwise opaque, so replays are
    // the cheapest way to debug user-reported issues.
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true, email: false },
    },
    disable_session_recording: false,
    // Exception auto-capture — unhandled errors + promise rejections land
    // in PostHog → Error Tracking.
    capture_exceptions: true,
    // Surveys + heatmaps: configured in the PostHog UI, rendered by the SDK.
    enable_heatmaps: true,
    loaded: (ph) => {
      // Tag every event with the app version so we can split funnels by
      // build. The dist channel ("dev" vs packaged) helps separate noise.
      ph.register({
        app: "web2desktop",
        app_version: __APP_VERSION__,
        app_channel: import.meta.env.DEV ? "dev" : "prod",
      });
    },
  });

  // posthog-js caches flag values after `init`/`identify` and never polls
  // for changes. For a desktop app that stays open for hours, that means a
  // flag toggled in the PostHog UI is invisible until the user reloads.
  // Two listeners + an interval keep the local cache fresh:
  //   • Every 15s while the app is running.
  //   • Whenever the OS gives focus back to the window (user just toggled
  //     a flag in their browser and Alt-Tabbed back).
  //   • Whenever the window becomes visible again.
  const reloadFlags = () => {
    try { posthog.reloadFeatureFlags(); } catch { /* never crash the app */ }
  };
  setInterval(reloadFlags, 15_000);
  window.addEventListener("focus", reloadFlags);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadFlags();
  });
}

// Paint the correct theme before React mounts so users on light theme
// don't see a dark flash on each launch. The settings store fetched in
// App's first effect may overwrite this once it loads — but the visual
// will already match what the user picked last time.
{
  const { key, custom } = readCachedTheme();
  applyTheme(key, custom);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
