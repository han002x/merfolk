// Core data model for merfolk diagrams.
// A graph is a flat list of nodes + edges. Any node can be a "group" that
// owns children; collapsing a group hides its subtree (drill-down). A group
// has no card of its own until it is folded: unfolded, it is a titled sheet.

/**
 * Node outlines. Every shape has a classic Mermaid bracket form (see
 * src/mermaid/io.ts), so all of them render in any Mermaid version.
 */
export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'dbl-circle'
  | 'diamond'
  | 'hexagon'
  | 'lean-r'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'flag';

/** Stroke dash pattern for a node border or an edge line. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Hand-drawn ink level. 0 = ink (clean), 1 = sketch, 2 = scribble. */
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

/** An image node's picture: a remote http(s) URL or an embedded data: URI. */
export interface NodeImage {
  src: string;
  /** label position: 't' above the image, 'b' (default) below */
  pos?: 't' | 'b';
  /** image width / height in px (missing => DEFAULT_IMAGE_SIZE) */
  w?: number;
  h?: number;
  /** keep the image's aspect ratio inside w x h (Mermaid `constraint: "on"`) */
  constraint?: boolean;
}

export const DEFAULT_IMAGE_SIZE = 80;

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** id of the parent group node, or null for a top-level node */
  parentId: string | null;
  /** collapsed groups hide their descendants */
  collapsed: boolean;
  /**
   * persisted canvas position. Ignored for groups: an unfolded group is only a
   * sheet titled with its `label`, and a folded one shows its card at the
   * top-left of its contents
   */
  position: { x: number; y: number };
  /**
   * full Iconify name (`lucide:database`, `simple-icons:github`). Set, the node
   * is an icon tile and exports as Mermaid's `@{ icon: ... }` form; its shape
   * then only picks the tile's corners (round => rounded, circle => circle)
   */
  icon?: string;
  /**
   * Mermaid's `@{ img: ... }` image node. Set, the node shows the picture with
   * its label above (`pos: 't'`) or below (default) it; wins over `icon`
   */
  image?: NodeImage;
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
