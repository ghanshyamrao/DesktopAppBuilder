import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Outer wrapper class — gap, margins, etc. */
  className?: string;
  /** Class applied to the inner scroll container. Use this to control gap
   *  between items (defaults to gap-3). */
  trackClassName?: string;
  /** How far to scroll when the user clicks an arrow, as a fraction of
   *  the visible width. 0.85 ≈ "almost a full viewport, with a bit of
   *  overlap so the user keeps context". */
  scrollFraction?: number;
}

/**
 * Reusable horizontal slider with auto-hiding < > arrow buttons.
 *
 * Children should be flex items with a fixed (or at least intrinsic) width
 * — the slider doesn't size them. Wrap each item in
 * `<div className="w-[160px] shrink-0">…</div>` (or similar) so the track
 * actually overflows when there are more items than fit.
 *
 * Arrow visibility is computed from scrollLeft + scrollWidth/clientWidth:
 *   - Prev shows when scrolled past the start.
 *   - Next shows when there's content past the right edge.
 * Both hide when the entire content fits without scrolling.
 *
 * Resize-observed so the arrows update if the window or container changes
 * size (e.g. user resizes the LeftRail collapse).
 */
export function HorizontalSlider({
  children,
  className,
  trackClassName,
  scrollFraction = 0.85,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const update = () => {
      // Tolerance of 1px for sub-pixel rounding — without it, "at end" is
      // sometimes never reached and the next arrow stays visible forever.
      const max = el.scrollWidth - el.clientWidth;
      setCanPrev(el.scrollLeft > 0);
      setCanNext(el.scrollLeft < max - 1);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Also observe children so insertions/removals trigger a recompute.
    for (const child of Array.from(el.children)) ro.observe(child);

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  function scrollBy(direction: -1 | 1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * scrollFraction, behavior: "smooth" });
  }

  return (
    // Intentionally NOT a `group` wrapper. Adding `group` here would make
    // every nested `group-hover:*` class (e.g. TemplateCard's arrow icon,
    // its highlight ring) fire whenever ANY item in the slider was hovered.
    // The arrows below use plain `hover:` so they don't need it.
    <div className={cn("relative", className)}>
      <div
        ref={trackRef}
        className={cn(
          "flex gap-3 lg:gap-4 overflow-x-auto pb-2",
          // Hide the native scrollbar — arrows are the affordance.
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          trackClassName,
        )}
      >
        {children}
      </div>

      {/* Edge gradient masks — fade content under the arrow buttons so
          partially-visible cards look intentional rather than clipped. */}
      {canPrev && (
        <div className="absolute inset-y-0 left-0 w-12 pointer-events-none bg-gradient-to-r from-bg to-transparent" />
      )}
      {canNext && (
        <div className="absolute inset-y-0 right-0 w-12 pointer-events-none bg-gradient-to-l from-bg to-transparent" />
      )}

      {canPrev && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous"
          className={cn(
            "absolute left-1 top-1/2 -translate-y-1/2 z-10",
            "w-8 h-8 rounded-full bg-bg-card border border-border shadow-elev",
            "flex items-center justify-center text-text-secondary",
            "hover:text-text-primary hover:border-border-strong hover:bg-white/[0.04]",
            "transition opacity-80 hover:opacity-100",
          )}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {canNext && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next"
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 z-10",
            "w-8 h-8 rounded-full bg-bg-card border border-border shadow-elev",
            "flex items-center justify-center text-text-secondary",
            "hover:text-text-primary hover:border-border-strong hover:bg-white/[0.04]",
            "transition opacity-80 hover:opacity-100",
          )}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
