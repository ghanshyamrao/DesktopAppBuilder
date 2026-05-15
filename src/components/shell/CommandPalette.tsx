import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import {
  SEARCH_GROUP_ORDER,
  groupLabel,
  useDefaultSuggestions,
  useGlobalSearch,
  type SearchGroup,
  type SearchResult,
} from "@/lib/search";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  return (
    <AnimatePresence>
      {open && <PaletteModal onClose={onClose} />}
    </AnimatePresence>
  );
}

function PaletteModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const liveResults = useGlobalSearch(query);
  const defaults = useDefaultSuggestions(8);
  const results = query.trim() ? liveResults : defaults;

  // Reset highlight whenever the result set changes shape.
  useEffect(() => { setActive(0); }, [query]);

  // Focus the input on open. The autoFocus prop alone misses the case where
  // the dialog re-opens without unmounting.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keep the highlighted row in view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

  const grouped = useMemo(() => groupResults(results), [results]);

  function pick(r: SearchResult) {
    r.go();
    onClose();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); return; }
    if (e.key === "Enter")     { e.preventDefault(); pick(results[active]); return; }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[300] bg-black/55 backdrop-blur-sm flex items-start justify-center p-6 pt-[12vh]"
      onClick={onClose}
      onKeyDown={onKey}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <motion.div
        initial={{ scale: 0.97, y: -8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.98, y: -4, opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-strong rounded-2xl shadow-elev overflow-hidden border border-border-strong"
      >
        {/* search input */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps, themes, settings, actions…"
            className="flex-1 bg-transparent outline-none text-[14px] text-text-primary placeholder:text-text-muted"
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group} className="mb-1.5">
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {groupLabel(group)}
                </div>
                {items.map(({ result, index }) => (
                  <Row
                    key={result.id}
                    result={result}
                    active={index === active}
                    rowIndex={index}
                    onHover={() => setActive(index)}
                    onSelect={() => pick(result)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* footer */}
        <div className="px-4 h-9 border-t border-border bg-white/[0.02] flex items-center justify-between text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <Hint kbd={<><Kbd><ArrowUp size={9} /></Kbd><Kbd><ArrowDown size={9} /></Kbd></>} label="navigate" />
            <Hint kbd={<Kbd><CornerDownLeft size={9} /></Kbd>} label="open" />
            <Hint kbd={<Kbd>Esc</Kbd>} label="close" />
          </div>
          <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Row({
  result, active, rowIndex, onHover, onSelect,
}: {
  result: SearchResult;
  active: boolean;
  rowIndex: number;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      data-row={rowIndex}
      type="button"
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 mx-2 py-2 rounded-lg transition",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-sm font-medium text-white border border-white/10",
          "bg-gradient-to-br",
          result.gradient ?? "from-slate-500 to-zinc-500",
        )}
      >
        <span className="leading-none">{result.glyph ?? "•"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text-primary truncate">{result.title}</div>
        {result.subtitle && (
          <div className="text-[11px] text-text-secondary truncate">{result.subtitle}</div>
        )}
      </div>
      {result.badge && (
        <span className="text-[10px] uppercase tracking-wider text-text-muted bg-white/[0.04] border border-border rounded px-1.5 py-0.5 shrink-0">
          {result.badge}
        </span>
      )}
      {active && <CornerDownLeft size={12} className="text-text-muted shrink-0" />}
    </button>
  );
}

function Hint({ kbd, label }: { kbd: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="flex items-center gap-0.5">{kbd}</span>
      <span>{label}</span>
    </span>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-6 py-12 text-center text-text-secondary">
      <div className="text-[13px] text-text-primary mb-1">No matches</div>
      <div className="text-xs">
        {query
          ? <>Nothing in your workspace matches <span className="text-text-primary">"{query}"</span>.</>
          : <>Start typing to search apps, themes, settings, and more.</>}
      </div>
    </div>
  );
}

interface GroupedRow { result: SearchResult; index: number }
interface GroupedBlock { group: SearchGroup; items: GroupedRow[] }

/** Bucket results by group while preserving the global rank order, so the
 *  highlight index lines up 1:1 with the flat results array. */
function groupResults(results: SearchResult[]): GroupedBlock[] {
  const buckets = new Map<SearchGroup, GroupedRow[]>();
  results.forEach((result, index) => {
    const list = buckets.get(result.group) ?? [];
    list.push({ result, index });
    buckets.set(result.group, list);
  });
  return SEARCH_GROUP_ORDER
    .filter((g) => buckets.has(g))
    .map((group) => ({ group, items: buckets.get(group)! }));
}
