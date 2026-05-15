import type { ReactNode } from "react";
import LeftRail from "./LeftRail";
import GlobalTopBar from "./GlobalTopBar";
import BottomConsole from "./BottomConsole";
import CommandPalette from "./CommandPalette";
import { useAppStore } from "@/store/appStore";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShellProps {
  children: ReactNode;
  /** Optional right-hand inspector panel (settings, properties, theme controls, etc). */
  inspector?: ReactNode;
}

export default function Shell({ children, inspector }: ShellProps) {
  const paletteOpen = useAppStore((s) => s.paletteOpen);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  return (
    <div className="flex h-full w-full bg-bg overflow-hidden">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <LeftRail />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalTopBar />

        <div className="flex-1 flex min-h-0">
          {/* primary canvas */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-mesh-violet relative">
            <div className="absolute inset-0 pointer-events-none bg-stripe-soft" />
            <div className="relative">{children}</div>
          </main>

          {/* right inspector — animated reveal */}
          <AnimatePresence initial={false}>
            {inspector && (
              <motion.aside
                key="inspector"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={cn("shrink-0 border-l border-border bg-bg-panel/80 backdrop-blur-xl overflow-hidden")}
              >
                <div className="w-[320px] h-full overflow-y-auto">{inspector}</div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        <BottomConsole />
      </div>
    </div>
  );
}
