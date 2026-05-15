/**
 * Designer data model — drag-drop visual builder.
 *
 * A `DesignerDoc` is a layout shell with one or more named zones; each zone
 * is an ordered list of `ComponentNode`s. The user drops palette components
 * into zones and reorders them via drag-drop. The compile step renders the
 * doc to a complete Electron project file map.
 *
 * Intentionally NOT supported (Figma-tier, separate initiative):
 *   - Free x/y positioning
 *   - Component nesting (containers within containers)
 *   - Multi-select / alignment guides
 *   - Component bindings to data sources
 *
 * If/when those land, ComponentNode can grow without a breaking change —
 * children/position/binding are just optional fields layered on top.
 */

export type ComponentKind =
  | "heading"
  | "paragraph"
  | "button"
  | "stat-card"
  | "list-item"
  | "divider"
  | "spacer"
  | "image"
  | "container"
  | "form"
  | "input"
  | "select";

export interface ComponentNode {
  /** Stable id within the doc — used as the React key + drag-drop handle. */
  id: string;
  kind: ComponentKind;
  /** Free-form prop map. Keys are component-specific and described by the
   *  registry's `fields` array. */
  props: Record<string, string>;
  /** Child nodes. Only populated for kinds that opt in — the registry
   *  declares which kinds accept children via `acceptsChildren`. */
  children?: ComponentNode[];
}

export type LayoutKind = "single" | "sidebar" | "dashboard";

export interface LayoutZone {
  /** Stable key used for the zones map (e.g. "main", "sidebar", "stats"). */
  key: string;
  /** Display label in the canvas + drop hints. */
  label: string;
}

export interface LayoutDef {
  kind: LayoutKind;
  label: string;
  /** Tailwind grid template that arranges zones. Each zone receives
   *  `data-zone="<key>"` so the render fn can address them. */
  zones: readonly LayoutZone[];
  /** CSS used by the COMPILED app. Defines the layout containers. */
  css: string;
  /** HTML wrapper applied around the rendered zone children in the
   *  compiled app. The placeholder `{{ZONES}}` gets replaced with the
   *  zones' rendered HTML, in order. */
  shell: string;
}

export interface DesignerDoc {
  layout: LayoutKind;
  zones: Record<string, ComponentNode[]>;
  tokens: {
    bg:      string;
    surface: string;
    accent:  string;
    text:    string;
    muted:   string;
    border:  string;
  };
  appName: string;
  appTagline: string;
}

/** Generate a short id for new component nodes. Doesn't need to be
 *  cryptographically unique — just unique within the doc, which limits
 *  collisions to tens of items. Math.random is fine here. */
export function genNodeId(): string {
  return `n_${Math.random().toString(36).slice(2, 9)}`;
}
