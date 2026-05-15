import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";

/**
 * Global keyboard shortcuts for the shell:
 *   ⌘K            — open / close global search palette
 *   ⌘`            — toggle bottom console
 *   ⌘\            — toggle left rail
 *   ⌘1..⌘6        — jump to primary sections
 *   ⌘J            — jump to AI Assistant
 */
export function useShortcuts() {
  const navigate = useAppStore((s) => s.navigate);
  const toggleConsole = useAppStore((s) => s.toggleConsole);
  const toggleRail = useAppStore((s) => s.toggleRail);
  const togglePalette = useAppStore((s) => s.togglePalette);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ignore shortcuts while typing — except the "global" ones (⌘K).
      const t = e.target as HTMLElement | null;
      const inTextField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (inTextField && e.key.toLowerCase() !== "k") return;

      switch (e.key.toLowerCase()) {
        case "k": e.preventDefault(); togglePalette();  return;
        case "`": e.preventDefault(); toggleConsole();  return;
        case "\\": e.preventDefault(); toggleRail();    return;
        case "1": e.preventDefault(); navigate({ name: "dashboard" }); return;
        case "2": e.preventDefault(); navigate({ name: "studio" });    return;
        case "3": e.preventDefault(); navigate({ name: "themes" });    return;
        case "4": e.preventDefault(); navigate({ name: "actions" });   return;
        case "5": e.preventDefault(); navigate({ name: "plugins" });   return;
        case "6":
        case "j": e.preventDefault(); navigate({ name: "ai" });        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggleConsole, toggleRail, togglePalette]);
}
