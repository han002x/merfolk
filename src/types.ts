// Core data model for merfolk diagrams.
// A graph is a flat list of nodes + edges. Any node can be a "group" that
// owns children; collapsing a group hides its subtree (drill-down).

export type NodeShape = 'rect' | 'round' | 'diamond' | 'circle';

/** Stroke dash pattern for a node border or an edge line. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Hand-drawn jitter level. 0 = architect (clean), 1 = artist, 2 = cartoonist. */
export type Sloppiness = 0 | 1 | 2;

/** Corner treatment for node outlines. */
export type EdgeStyle = 'sharp' | 'round';

export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand';

/**
 * Motion presets. `none` is the static default. `pulse`, `fade` and `draw`
 * read best on node bodies; `flow` animates an edge's dashes travelling along
 * the line. The panel shows whichever subset fits the current selection.
 */
export type AnimationKind = 'none' | 'pulse' | 'fade' | 'draw' | 'flow';

/**
 * Visual overrides shared by nodes and edges. Every field is optional; a
 * missing field means "fall back to the theme default". This keeps older saved
 * diagrams (and mermaid imports) valid without a migration.
 */
export interface ElementStyle {
  /** border (node) / line (edge) color; any CSS color */
  stroke?: string;
  /** fill color for node bodies; 'transparent' is allowed */
  background?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  sloppiness?: Sloppiness;
  /** corner treatment for node outlines */
  edges?: EdgeStyle;
  fontFamily?: FontFamily;
  fontSize?: number;
  /** 0..1 */
  opacity?: number;
  /** motion preset applied to the element (missing => 'none') */
  animation?: AnimationKind;
  /** seconds for one animation cycle (missing => default) */
  animationSpeed?: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** id of the parent group node, or null for a top-level node */
  parentId: string | null;
  /** collapsed groups hide their descendants */
  collapsed: boolean;
  /** persisted canvas position (ignored for frames: see `frame`) */
  position: { x: number; y: number };
  /**
   * A frame group has no card of its own while unfolded: just the sheet around
   * its children, titled with `label` (may be empty). Folded, it shows a card
   * at the top-left of its contents. Groups made on the canvas are frames.
   */
  frame?: boolean;
  /** optional per-node visual overrides */
  style?: ElementStyle;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** optional per-edge visual overrides */
  style?: ElementStyle;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
