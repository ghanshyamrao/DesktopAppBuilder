import { useEffect } from "react";
import Shell from "@/components/shell/Shell";
import AppTitleBar from "@/components/shell/AppTitleBar";
import AboutDialog from "@/components/info/AboutDialog";
import DocumentationDialog from "@/components/info/DocumentationDialog";
import Dashboard from "@/pages/Dashboard";
import CreateWizard from "@/pages/CreateWizard";
import BuildProgress from "@/pages/BuildProgress";
import Settings from "@/pages/Settings";
import AppStudio from "@/pages/AppStudio";
import ThemeBuilder from "@/pages/ThemeBuilder";
import ActionBuilder from "@/pages/ActionBuilder";
import PluginMarketplace from "@/pages/PluginMarketplace";
import AIAssistant from "@/pages/AIAssistant";
import Deploy from "@/pages/Deploy";
import Recipes from "@/pages/Recipes";
import StudioBuilder from "@/pages/StudioBuilder";
import BillingPage from "@/pages/BillingPage";
import SubscriptionGateProvider from "@/components/SubscriptionGateProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import FlagDebugOverlay from "@/components/FlagDebugOverlay";
import OfflineOverlay from "@/components/OfflineOverlay";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { DeveloperModePromptProvider } from "@/components/ui/DeveloperModePrompt";
import AuthGate from "@/components/auth/AuthGate";
import { useAppStore } from "@/store/appStore";
import { useShortcuts } from "@/lib/useShortcuts";
import { isRouteEnabled } from "@/lib/features";
import { applyTheme, cacheTheme } from "@/lib/theme";
import { track, useFeatureFlagsLoadedTick, reloadFeatureFlags } from "@/lib/analytics";

export default function App() {
  const route = useAppStore((s) => s.route);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const ingestLog = useAppStore((s) => s.ingestLog);
  const ingestProgress = useAppStore((s) => s.ingestProgress);
  const setConsoleOpen = useAppStore((s) => s.setConsoleOpen);
  const pushNotification = useAppStore((s) => s.pushNotification);
  const appearance = useAppStore((s) => s.settings?.appearance);

  useShortcuts();

  // Re-render the whole tree when PostHog reloads its flag set. Consumers
  // of `isEnabled` / `isRouteEnabled` further down call those synchronously
  // during render, so they need this nudge to pick up remote flag values
  // once they arrive after first paint.
  useFeatureFlagsLoadedTick();

  // Force a flag refresh on mount. main.tsx also polls every 15s and
  // refetches on focus, but this catches the user-toggled-flag-then-
  // launched-the-app case where the cached value would be stale.
  useEffect(() => { reloadFeatureFlags(); }, []);

  // Emit a `route_viewed` event on every navigation. PostHog auto-captures
  // pageviews from history, but the app navigates through a zustand store
  // rather than the URL bar, so we forward route changes explicitly.
  useEffect(() => {
    track({
      name: "route_viewed",
      props: {
        route: route.name,
        project_id: "projectId" in route ? route.projectId : undefined,
      },
    });
  }, [route.name, "projectId" in route ? route.projectId : undefined]);

  // Re-apply (and cache) the theme whenever the persisted appearance
  // changes. main.tsx already painted the cached theme before React
  // mounted so there's no flash; this reconciles with whatever the
  // backend returned after `loadSettings()`.
  useEffect(() => {
    if (!appearance) return;
    applyTheme(appearance.mode, { accent: appearance.customAccent });
    cacheTheme(appearance.mode, { accent: appearance.customAccent });
  }, [appearance]);

  useEffect(() => {
    void refreshProjects();
    void loadSettings();
    const offLog = window.w2a.events.onBuildLog(ingestLog);
    const offProgress = window.w2a.events.onBuildProgress((event) => {
      ingestProgress(event);
      // Auto-open the console when a build starts so the user sees output.
      if (event.status === "building") setConsoleOpen(true);
      if (event.status === "success" || event.status === "error" || event.status === "cancelled") {
        void refreshProjects();
      }

      // Bell notification on terminal build outcomes. Read the latest
      // project list from the store rather than closing over it so the
      // name lookup stays fresh across renders. dedupeKey collapses
      // re-runs of the same project into a single row.
      if (event.status === "success" || event.status === "error") {
        const project = useAppStore.getState().projects.find((p) => p.id === event.projectId);
        const name = project?.name ?? "App";
        if (event.status === "success") {
          track({ name: "build_succeeded", props: { project_id: event.projectId } });
        } else {
          track({ name: "build_failed", props: { project_id: event.projectId, reason: event.stepLabel } });
        }
        pushNotification(
          event.status === "success"
            ? {
                kind: "success",
                title: `${name} built successfully`,
                body: "Your installer is ready in the project's release folder.",
                route: { name: "build", projectId: event.projectId },
                dedupeKey: `build:success:${event.projectId}`,
              }
            : {
                kind: "error",
                title: `Build failed for ${name}`,
                body: event.stepLabel || "Open the build log to see what went wrong.",
                route: { name: "build", projectId: event.projectId },
                dedupeKey: `build:error:${event.projectId}`,
              }
        );
      }
    });
    return () => {
      offLog();
      offProgress();
    };
  }, [refreshProjects, loadSettings, ingestLog, ingestProgress, setConsoleOpen, pushNotification]);

  // Force disabled features to fall back to the first enabled route.
  // Dashboard is preferred when available, otherwise we walk the priority
  // list — never hard-pin to dashboard, because the operator can disable
  // its PostHog flag and we'd be stuck rendering a hidden surface.
  const effectiveRoute = isRouteEnabled(route.name) ? route : fallbackRoute();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppTitleBar />
      <div className="flex-1 min-h-0 relative">
        <ToastProvider>
          <ConfirmProvider>
            <DeveloperModePromptProvider>
            <AuthGate>
            <SubscriptionGateProvider>
            <Shell>
            <ErrorBoundary key={routeKey(effectiveRoute)}>
            {effectiveRoute.name === "dashboard" && <Dashboard />}
            {effectiveRoute.name === "wizard"    && <CreateWizard />}
            {effectiveRoute.name === "build"     && <BuildProgress projectId={effectiveRoute.projectId} />}
            {effectiveRoute.name === "settings"  && <Settings />}
            {effectiveRoute.name === "studio"    && <AppStudio />}
            {effectiveRoute.name === "themes"    && <ThemeBuilder />}
            {effectiveRoute.name === "actions"   && <ActionBuilder />}
            {effectiveRoute.name === "plugins"   && <PluginMarketplace />}
            {effectiveRoute.name === "ai"        && <AIAssistant />}
            {effectiveRoute.name === "deploy"    && <Deploy />}
            {effectiveRoute.name === "recipes"   && <Recipes />}
            {effectiveRoute.name === "builder"   && <StudioBuilder />}
            {effectiveRoute.name === "billing"   && <BillingPage />}
            </ErrorBoundary>
            </Shell>
            {import.meta.env.DEV && <FlagDebugOverlay />}
            </SubscriptionGateProvider>
            </AuthGate>
            </DeveloperModePromptProvider>
          </ConfirmProvider>
        </ToastProvider>

        {/* Global info surfaces — mounted outside AuthGate so the Help menu
            opens them even before sign-in. They paint on top of every
            route via z-index. */}
        <AboutDialog />
        <DocumentationDialog />

        {/* Connectivity guard — sits above every other surface (z-9000) and
            blocks interaction whenever the renderer goes offline. Mounted
            outside AuthGate so the prompt fires even on the login screen,
            which itself depends on Google for the OAuth round-trip. */}
        <OfflineOverlay />
      </div>
    </div>
  );
}

function routeKey(route: { name: string; projectId?: string }): string {
  return route.name === "build" ? `build:${route.projectId}` : route.name;
}

/**
 * Pick the first enabled route from the user-facing priority list. Used
 * when the current route's feature flag is off — we'd rather route the
 * user to *some* visible surface than render a hidden one. The order
 * matches the LeftRail's top-to-bottom layout so users land where they'd
 * expect to click first.
 */
const FALLBACK_PRIORITY = ["dashboard", "studio", "themes", "actions", "ai", "settings"] as const;
function fallbackRoute(): { name: "dashboard" } | { name: "studio" } | { name: "themes" } | { name: "actions" } | { name: "ai" } | { name: "settings" } {
  const first = FALLBACK_PRIORITY.find((name) => isRouteEnabled(name));
  return { name: (first ?? "dashboard") } as { name: "dashboard" };
}
