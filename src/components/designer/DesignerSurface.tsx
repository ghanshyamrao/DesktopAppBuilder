import { useMemo, useState, type DragEvent } from "react";
import { Trash2 } from "lucide-react";
import { COMPONENTS, LAYOUTS, PALETTE_ORDER, type ComponentDef, type PropField } from "@/lib/designer/registry";
import { genNodeId, type ComponentKind, type ComponentNode, type DesignerDoc, type LayoutKind } from "@/lib/designer/types";
import { cn } from "@/lib/utils";

/**
 * Three-pane drag-drop designer surface: palette · canvas · inspector.
 *
 * State model:
 *   - The doc lives in the parent (StudioBuilder) and is passed in via
 *     `doc` + `onChange`. This way the parent can persist, switch
 *     templates, swap to scene mode, etc.
 *   - `selectedId` is local — each surface mount tracks its own selection.
 *
 * Drag-drop uses the native HTML5 API. Two drag types:
 *   - "designer/new" + componentKind: dragging from the palette
 *   - "designer/move" + nodeId: reordering / cross-zone moves on canvas
 * `dataTransfer.setData(type, value)` is keyed by these strings.
 */
interface Props {
  doc: DesignerDoc;
  onChange: (next: DesignerDoc) => void;
}

const DRAG_NEW  = "application/x-designer-new";
const DRAG_MOVE = "application/x-designer-move";

export default function DesignerSurface({ doc, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = LAYOUTS[doc.layout];

  /**
   * Walk all zones recursively, returning every node. We need this for
   * "find selected node" + the move/update/delete helpers below — none
   * of which would otherwise know to descend into container.children.
   */
  function walkAllNodes(): ComponentNode[] {
    const out: ComponentNode[] = [];
    function visit(n: ComponentNode) {
      out.push(n);
      if (n.children) for (const c of n.children) visit(c);
    }
    for (const z of layout.zones) for (const n of doc.zones[z.key] ?? []) visit(n);
    return out;
  }
  const selectedNode = useMemo(() => walkAllNodes().find((n) => n.id === selectedId) ?? null, [doc, selectedId]);

  /**
   * Drop targets are addressed by (parentId | null, index). When parentId
   * is null the target is a top-level zone; when set, it's that container
   * node's children list. Helpers below deep-clone the doc and operate on
   * the right list — keeps everything immutable for React.
   */
  type Target = { zoneKey: string; parentId: string | null; index: number };

  function makeNewNode(kind: ComponentKind): ComponentNode {
    const def = COMPONENTS[kind];
    const node: ComponentNode = { id: genNodeId(), kind, props: { ...def.defaults } };
    if (def.acceptsChildren) node.children = [];
    return node;
  }

  /** Recursive helper: walk the tree mutating in place; the caller is
   *  responsible for shallow-cloning before calling. */
  function findAndRemove(arr: ComponentNode[], nodeId: string): ComponentNode | null {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === nodeId) return arr.splice(i, 1)[0];
      if (arr[i].children) {
        const removed = findAndRemove(arr[i].children!, nodeId);
        if (removed) return removed;
      }
    }
    return null;
  }

  function insertAt(arr: ComponentNode[], parentId: string | null, index: number, node: ComponentNode): boolean {
    if (parentId === null) {
      arr.splice(index, 0, node);
      return true;
    }
    for (const item of arr) {
      if (item.id === parentId) {
        if (!item.children) item.children = [];
        item.children.splice(index, 0, node);
        return true;
      }
      if (item.children && insertAt(item.children, parentId, index, node)) return true;
    }
    return false;
  }

  function findAndUpdate(arr: ComponentNode[], nodeId: string, mut: (n: ComponentNode) => ComponentNode): boolean {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === nodeId) { arr[i] = mut(arr[i]); return true; }
      if (arr[i].children && findAndUpdate(arr[i].children!, nodeId, mut)) return true;
    }
    return false;
  }

  /** Deep-clone the zone map so mutations stay local to this update. */
  function cloneZones(): Record<string, ComponentNode[]> {
    return JSON.parse(JSON.stringify(doc.zones));
  }

  function insertNew(target: Target, kind: ComponentKind) {
    const node = makeNewNode(kind);
    const zones = cloneZones();
    const zoneArr = zones[target.zoneKey] ?? [];
    insertAt(zoneArr, target.parentId, target.index, node);
    zones[target.zoneKey] = zoneArr;
    onChange({ ...doc, zones });
    setSelectedId(node.id);
  }

  function moveNode(nodeId: string, target: Target) {
    // Don't allow dropping a node into its own subtree (would create a cycle).
    if (isAncestor(nodeId, target.parentId)) return;

    const zones = cloneZones();
    // Find which top-level zone holds the node, remove from there.
    let removed: ComponentNode | null = null;
    for (const k of Object.keys(zones)) {
      const out = findAndRemove(zones[k], nodeId);
      if (out) { removed = out; break; }
    }
    if (!removed) return;

    const targetArr = zones[target.zoneKey] ?? [];
    insertAt(targetArr, target.parentId, target.index, removed);
    zones[target.zoneKey] = targetArr;
    onChange({ ...doc, zones });
  }

  function isAncestor(ancestorId: string, descendantParentId: string | null): boolean {
    if (descendantParentId === null) return false;
    if (ancestorId === descendantParentId) return true;
    // Walk: from descendantParentId, find its node, check if its tree
    // contains ancestorId.
    function search(arr: ComponentNode[]): ComponentNode | null {
      for (const n of arr) {
        if (n.id === descendantParentId) return n;
        if (n.children) {
          const r = search(n.children); if (r) return r;
        }
      }
      return null;
    }
    let parent: ComponentNode | null = null;
    for (const k of Object.keys(doc.zones)) {
      const r = search(doc.zones[k]); if (r) { parent = r; break; }
    }
    if (!parent) return false;
    function contains(n: ComponentNode): boolean {
      if (n.id === ancestorId) return true;
      return !!n.children && n.children.some(contains);
    }
    return contains(parent);
  }

  function updateNode(nodeId: string, propKey: string, value: string) {
    const zones = cloneZones();
    for (const k of Object.keys(zones)) {
      if (findAndUpdate(zones[k], nodeId, (n) => ({ ...n, props: { ...n.props, [propKey]: value } }))) {
        onChange({ ...doc, zones });
        return;
      }
    }
  }

  function deleteNode(nodeId: string) {
    const zones = cloneZones();
    for (const k of Object.keys(zones)) {
      const removed = findAndRemove(zones[k], nodeId);
      if (removed) {
        onChange({ ...doc, zones });
        if (selectedId === nodeId) setSelectedId(null);
        return;
      }
    }
  }

  function changeLayout(next: LayoutKind) {
    if (next === doc.layout) return;
    // Fold all existing nodes into the new layout's first zone so users
    // don't lose their work when switching layouts. They can drag them
    // to the right zones afterwards.
    const allExisting: ComponentNode[] = [];
    for (const k of Object.keys(doc.zones)) allExisting.push(...doc.zones[k]);

    const newLayout = LAYOUTS[next];
    const firstZoneKey = newLayout.zones[0].key;
    const newZones: Record<string, ComponentNode[]> = {};
    for (const z of newLayout.zones) newZones[z.key] = [];
    newZones[firstZoneKey] = allExisting;
    onChange({ ...doc, layout: next, zones: newZones });
    setSelectedId(null);
  }

  function updateMeta(field: "appName" | "appTagline", value: string) {
    onChange({ ...doc, [field]: value });
  }

  function updateToken(key: keyof DesignerDoc["tokens"], value: string) {
    onChange({ ...doc, tokens: { ...doc.tokens, [key]: value } });
  }

  return (
    <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
      <Palette />
      <Canvas
        doc={doc}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onInsertNew={(t, k) => insertNew(t, k)}
        onMove={(id, t) => moveNode(id, t)}
        onDelete={deleteNode}
      />
      <Inspector
        doc={doc}
        node={selectedNode}
        onChangeNodeProp={updateNode}
        onDelete={deleteNode}
        onChangeLayout={changeLayout}
        onChangeMeta={updateMeta}
        onChangeToken={updateToken}
      />
    </div>
  );
}

/** Target for drop operations — addressed as (zoneKey, parentId, index). */
export type DropTarget = { zoneKey: string; parentId: string | null; index: number };

/* ─────────── Palette ─────────── */

function Palette() {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start space-y-2">
      <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-1 px-1">
        Components
      </div>
      <div className="text-2xs text-text-muted mb-2 px-1 leading-relaxed">
        Drag onto a zone or between existing components.
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {PALETTE_ORDER.map((kind) => (
          <PaletteTile key={kind} def={COMPONENTS[kind]} />
        ))}
      </div>
    </aside>
  );
}

function PaletteTile({ def }: { def: ComponentDef }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_NEW, def.kind);
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={def.description}
      className="p-2.5 rounded-lg border border-border bg-bg-card hover:border-border-strong hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition select-none"
    >
      <div className="text-base font-mono font-bold text-text-primary leading-none mb-1.5">{def.glyph}</div>
      <div className="text-2xs font-medium">{def.label}</div>
    </div>
  );
}

/* ─────────── Canvas ─────────── */

interface CanvasProps {
  doc: DesignerDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onInsertNew: (target: DropTarget, kind: ComponentKind) => void;
  onMove: (nodeId: string, target: DropTarget) => void;
  onDelete: (id: string) => void;
}

function Canvas({ doc, selectedId, onSelect, onInsertNew, onMove, onDelete }: CanvasProps) {
  const layout = LAYOUTS[doc.layout];
  return (
    <div
      className="rounded-xl border border-border bg-bg-input/40 p-4 space-y-3 min-h-[420px]"
      onClick={() => onSelect(null)}
    >
      <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold flex items-center justify-between">
        <span>Canvas · {layout.label}</span>
        <span className="text-text-muted">click anywhere to deselect</span>
      </div>
      <div
        className={cn(
          "grid gap-3",
          doc.layout === "single"   && "grid-cols-1",
          doc.layout === "sidebar"  && "grid-cols-[180px_1fr]",
          doc.layout === "dashboard" && "grid-cols-1",
        )}
      >
        {layout.zones.map((zone) => (
          <NodeList
            key={zone.key}
            mode="zone"
            zoneKey={zone.key}
            label={zone.label}
            parentId={null}
            nodes={doc.zones[zone.key] ?? []}
            selectedId={selectedId}
            onSelect={onSelect}
            onInsertNew={onInsertNew}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Recursive list of nodes — used both for top-level zones and for the
 * children inside a Container/Form. Each list has drop slots above and
 * between every node so users can insert at any position.
 */
interface NodeListProps {
  mode: "zone" | "children";
  zoneKey: string;
  /** Zone label (zone mode) or container hint (children mode). */
  label?: string;
  parentId: string | null;
  nodes: ComponentNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onInsertNew: (target: DropTarget, kind: ComponentKind) => void;
  onMove: (nodeId: string, target: DropTarget) => void;
  onDelete: (id: string) => void;
}

function NodeList({ mode, zoneKey, label, parentId, nodes, selectedId, onSelect, onInsertNew, onMove, onDelete }: NodeListProps) {
  function handleDropAt(e: DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const newKind = e.dataTransfer.getData(DRAG_NEW);
    const moveId  = e.dataTransfer.getData(DRAG_MOVE);
    const target: DropTarget = { zoneKey, parentId, index };
    if (newKind && newKind in COMPONENTS) onInsertNew(target, newKind as ComponentKind);
    else if (moveId) onMove(moveId, target);
  }

  function handleDragOver(e: DragEvent) {
    if (e.dataTransfer.types.includes(DRAG_NEW) || e.dataTransfer.types.includes(DRAG_MOVE)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (mode === "zone") {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border border-dashed border-border transition"
      >
        <div className="flex items-center justify-between px-3 py-2 text-2xs uppercase tracking-wider text-text-muted font-semibold">
          <span>{label}</span>
          <span className="text-text-muted/60">{nodes.length}</span>
        </div>
        <div className="p-2 space-y-1.5 min-h-[120px]">
          <DropSlot onDrop={(e) => handleDropAt(e, 0)} onDragOver={handleDragOver} />
          {nodes.map((node, i) => (
            <div key={node.id}>
              <NodeRow
                node={node}
                selected={node.id === selectedId}
                selectedId={selectedId}
                onSelect={() => onSelect(node.id)}
                onSelectAny={onSelect}
                onDelete={onDelete}
                zoneKey={zoneKey}
                onInsertNew={onInsertNew}
                onMove={onMove}
              />
              <DropSlot onDrop={(e) => handleDropAt(e, i + 1)} onDragOver={handleDragOver} />
            </div>
          ))}
          {nodes.length === 0 && (
            <div className="text-2xs text-text-muted text-center py-4">Drag a component here</div>
          )}
        </div>
      </div>
    );
  }

  // children mode — sits inside a container; rendered without the
  // "zone label" header but still has drop slots and an empty hint.
  return (
    <div className="space-y-1 mt-1" onClick={(e) => e.stopPropagation()}>
      <DropSlot onDrop={(e) => handleDropAt(e, 0)} onDragOver={handleDragOver} />
      {nodes.map((node, i) => (
        <div key={node.id}>
          <NodeRow
            node={node}
            selected={node.id === selectedId}
            selectedId={selectedId}
            onSelect={() => onSelect(node.id)}
            onSelectAny={onSelect}
            onDelete={() => onDelete(node.id)}
            zoneKey={zoneKey}
            onInsertNew={onInsertNew}
            onMove={onMove}
          />
          <DropSlot onDrop={(e) => handleDropAt(e, i + 1)} onDragOver={handleDragOver} />
        </div>
      ))}
      {nodes.length === 0 && (
        <div className="text-2xs text-text-muted text-center py-2 italic">Drop components inside</div>
      )}
    </div>
  );
}

function DropSlot({ onDrop, onDragOver }: { onDrop: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void }) {
  const [active, setActive] = useState(false);
  return (
    <div
      onDragEnter={(e) => { onDragOver(e); setActive(true); }}
      onDragOver={onDragOver}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => { setActive(false); onDrop(e); }}
      className={cn(
        "h-1 rounded-full transition",
        active ? "h-2 bg-accent-blue" : "bg-transparent",
      )}
    />
  );
}

interface NodeRowProps {
  node: ComponentNode;
  selected: boolean;
  selectedId: string | null;
  onSelect: () => void;
  onSelectAny: (id: string | null) => void;
  onDelete: (id: string) => void;
  zoneKey: string;
  onInsertNew: (target: DropTarget, kind: ComponentKind) => void;
  onMove: (nodeId: string, target: DropTarget) => void;
}

function NodeRow({ node, selected, selectedId, onSelect, onSelectAny, onDelete, zoneKey, onInsertNew, onMove }: NodeRowProps) {
  const def = COMPONENTS[node.kind];
  const summary = node.props.text || node.props.label || node.props.title || node.props.value || def.label;
  const accepts = !!def.acceptsChildren;

  // For zones nested inside this node — pass our id as the parent.
  // Build a sub-NodeList for children when the def opts in.
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MOVE, node.id);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={cn(
        "group rounded-md border transition",
        selected
          ? "border-accent-blue bg-accent-blue/10"
          : "border-border bg-bg-card hover:border-border-strong",
      )}
    >
      <div className={cn(
        "flex items-center gap-2 px-2.5 py-2 cursor-grab active:cursor-grabbing",
        accepts && "border-b border-border/60",
      )}>
        <div className="w-6 h-6 rounded bg-bg-input border border-border flex items-center justify-center text-2xs font-mono font-bold shrink-0">
          {def.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xs uppercase tracking-wider text-text-muted">{def.label}</div>
          <div className="text-xs truncate">{summary}</div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          className="opacity-0 group-hover:opacity-100 transition text-text-muted hover:text-accent-red"
          title="Delete component"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {accepts && (
        <div className="px-2.5 pb-2">
          <NodeList
            mode="children"
            zoneKey={zoneKey}
            parentId={node.id}
            nodes={node.children ?? []}
            selectedId={selectedId}
            onSelect={onSelectAny}
            onInsertNew={onInsertNew}
            onMove={onMove}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────── Inspector ─────────── */

interface InspectorProps {
  doc: DesignerDoc;
  node: ComponentNode | null;
  onChangeNodeProp: (id: string, propKey: string, value: string) => void;
  onDelete: (id: string) => void;
  onChangeLayout: (next: LayoutKind) => void;
  onChangeMeta: (field: "appName" | "appTagline", value: string) => void;
  onChangeToken: (key: keyof DesignerDoc["tokens"], value: string) => void;
}

function Inspector({ doc, node, onChangeNodeProp, onDelete, onChangeLayout, onChangeMeta, onChangeToken }: InspectorProps) {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
      <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-1 px-1">
        {node ? "Component" : "App"}
      </div>
      {node ? (
        <NodeInspector node={node} onChangeProp={onChangeNodeProp} onDelete={() => onDelete(node.id)} />
      ) : (
        <DocInspector doc={doc} onChangeLayout={onChangeLayout} onChangeMeta={onChangeMeta} onChangeToken={onChangeToken} />
      )}
    </aside>
  );
}

function NodeInspector({ node, onChangeProp, onDelete }: { node: ComponentNode; onChangeProp: (id: string, k: string, v: string) => void; onDelete: () => void }) {
  const def = COMPONENTS[node.kind];
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{def.label}</div>
          <div className="text-2xs text-text-muted mt-0.5">{def.description}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-text-muted hover:text-accent-red transition"
          title="Delete component"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {def.fields.length === 0 && (
        <div className="text-2xs text-text-muted">No editable fields.</div>
      )}
      {def.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={node.props[field.key] ?? ""}
          onChange={(v) => onChangeProp(node.id, field.key, v)}
        />
      ))}
    </div>
  );
}

function DocInspector({ doc, onChangeLayout, onChangeMeta, onChangeToken }: {
  doc: DesignerDoc;
  onChangeLayout: (k: LayoutKind) => void;
  onChangeMeta: (f: "appName" | "appTagline", v: string) => void;
  onChangeToken: (k: keyof DesignerDoc["tokens"], v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
      <div className="text-2xs text-text-muted">Click any component on the canvas to edit it. Or tweak app-wide settings below.</div>

      <FieldInput
        field={{ key: "appName", label: "App name", kind: "text" }}
        value={doc.appName}
        onChange={(v) => onChangeMeta("appName", v)}
      />
      <FieldInput
        field={{ key: "appTagline", label: "Tagline", kind: "text" }}
        value={doc.appTagline}
        onChange={(v) => onChangeMeta("appTagline", v)}
      />

      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">Layout</label>
        <select
          value={doc.layout}
          onChange={(e) => onChangeLayout(e.target.value as LayoutKind)}
          className="input mt-1 h-9 text-xs w-full"
        >
          {Object.values(LAYOUTS).map((l) => (
            <option key={l.kind} value={l.kind}>{l.label}</option>
          ))}
        </select>
        <p className="helper mt-1">Switching layout folds existing components into the first zone.</p>
      </div>

      <div className="border-t border-border pt-3 space-y-2">
        <div className="text-2xs uppercase tracking-wider text-text-muted font-semibold">Theme</div>
        {(Object.keys(doc.tokens) as Array<keyof DesignerDoc["tokens"]>).map((key) => (
          <FieldInput
            key={key}
            field={{ key, label: key, kind: "color" }}
            value={doc.tokens[key]}
            onChange={(v) => onChangeToken(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: PropField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "color") {
    return (
      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{field.label}</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={parseSafeColor(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded-md border border-border bg-bg-input cursor-default shrink-0"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="input h-8 font-mono text-2xs flex-1"
          />
        </div>
        {field.helper && <p className="helper mt-1">{field.helper}</p>}
      </div>
    );
  }
  if (field.kind === "longText") {
    return (
      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{field.label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="input mt-1 text-xs resize-y"
        />
        {field.helper && <p className="helper mt-1">{field.helper}</p>}
      </div>
    );
  }
  if (field.kind === "select" && field.options) {
    return (
      <div>
        <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{field.label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input mt-1 h-9 text-xs w-full"
        >
          {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {field.helper && <p className="helper mt-1">{field.helper}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="text-2xs uppercase tracking-wider text-text-muted font-semibold">{field.label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1 h-9 text-xs"
      />
      {field.helper && <p className="helper mt-1">{field.helper}</p>}
    </div>
  );
}

/** Browsers reject color inputs that aren't `#rrggbb`; coerce gracefully. */
function parseSafeColor(s: string): string {
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return "#" + s.slice(1).split("").map((c) => c + c).join("");
  return "#000000";
}
