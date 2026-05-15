import { Search, Command, Terminal as TerminalIcon, Sparkles, ChevronRight } from "lucide-react";
import { useAppStore, type Route } from "@/store/appStore";
import { Kbd } from "@/components/ui/Kbd";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import NotificationsBell from "@/components/shell/NotificationsBell";
import { cn } from "@/lib/utils";
import { isTopBarFeatureEnabled } from "@/lib/features";

const ROUTE_LABEL: Record<Route["name"], string> = {
  dashboard: "Dashboard",
  wizard:    "New App",
  build:     "Build",
  settings:  "Settings",
  studio:    "App Studio",
  themes:    "Theme Builder",
  actions:   "Action Builder",
  plugins:   "Plugin Marketplace",
  ai:        "AI Assistant",
  deploy:    "Deploy",
  recipes:   "Recipes",
  builder:   "Builder",
  billing:   "Billing",
};

export default function GlobalTopBar() {
  const route = useAppStore((s) => s.route);
  const navigate = useAppStore((s) => s.navigate);
  const consoleOpen = useAppStore((s) => s.consoleOpen);
  const toggleConsole = useAppStore((s) => s.toggleConsole);
  const togglePalette = useAppStore((s) => s.togglePalette);

  const projects = useAppStore((s) => s.projects);
  const liveProgress = useAppStore((s) => s.liveProgress);
  const buildingCount = Object.values(liveProgress).filter((p) => p?.status === "building").length;

  const crumbs = buildCrumbs(route, projects);

  return (
    <header
      className="h-12 shrink-0 px-3 border-b border-border bg-bg-panel/85 backdrop-blur-xl flex items-center gap-3 app-drag relative z-20"
      style={{ paddingTop: "var(--titlebar-pad, 0px)" }}
    >
      {/* breadcrumb */}
      {isTopBarFeatureEnabled("breadcrumbs") && (
        <nav className="flex items-center gap-1.5 min-w-0 no-drag">
          {crumbs.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight size={12} className="text-text-muted shrink-0" />}
              {c.onClick ? (
                <button onClick={c.onClick} className="text-[12.5px] text-text-secondary hover:text-text-primary transition truncate">
                  {c.label}
                </button>
              ) : (
                <span className="text-[12.5px] font-medium text-text-primary truncate">{c.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* spacer that acts as drag region */}
      <div className="flex-1 h-full app-drag" />

      {/* command bar — center-ish, but flexes within */}
      {isTopBarFeatureEnabled("search") && (
        <button
          type="button"
          onClick={togglePalette}
          aria-label="Open global search"
          className="no-drag h-8 w-[280px] hidden md:flex items-center gap-2 px-3 rounded-lg bg-white/[0.04] border border-border text-text-secondary hover:bg-white/[0.06] hover:border-border-strong transition"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left text-xs truncate">Search apps, themes, actions…</span>
          <span className="flex items-center gap-0.5 shrink-0">
            <Kbd>⌘</Kbd><Kbd>K</Kbd>
          </span>
        </button>
      )}

      <div className="flex-1 h-full app-drag" />

      {/* status / actions cluster */}
      <div className="flex items-center gap-1 no-drag">
        {buildingCount > 0 && isTopBarFeatureEnabled("buildingBadge") && (
          <Badge tone="blue" dot>{buildingCount} building</Badge>
        )}

        {isTopBarFeatureEnabled("aiQuickButton") && (
          <Tooltip content="AI Assistant" shortcut="⌘J" side="bottom">
            <IconButton icon={<Sparkles size={15} />} tone="accent" onClick={() => navigate({ name: "ai" })} />
          </Tooltip>
        )}

        {isTopBarFeatureEnabled("consoleToggle") && (
          <Tooltip content={consoleOpen ? "Hide console" : "Show console"} shortcut="⌘`" side="bottom">
            <IconButton icon={<TerminalIcon size={15} />} active={consoleOpen} onClick={toggleConsole} />
          </Tooltip>
        )}

        {isTopBarFeatureEnabled("notifications") && <NotificationsBell />}

        {isTopBarFeatureEnabled("paletteButton") && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Tooltip content="Command Palette" shortcut="⌘K" side="bottom">
              <IconButton icon={<Command size={15} />} onClick={togglePalette} />
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}

function buildCrumbs(route: Route, projects: { id: string; name: string }[]): Array<{ label: string; onClick?: () => void }> {
  const navigate = useAppStore.getState().navigate;
  const home = { label: "WebToDesktop", onClick: () => navigate({ name: "dashboard" }) };

  if (route.name === "build") {
    const project = projects.find((p) => p.id === route.projectId);
    return [
      home,
      { label: "Apps", onClick: () => navigate({ name: "dashboard" }) },
      { label: project?.name ?? "Build" },
    ];
  }
  if (route.name === "wizard") {
    return [home, { label: "Apps", onClick: () => navigate({ name: "dashboard" }) }, { label: "New App" }];
  }
  return [home, { label: ROUTE_LABEL[route.name] }];
}
