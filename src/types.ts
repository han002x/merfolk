// Core data model for merfolk diagrams.
// A graph is a flat list of nodes + edges. Any node can be a "group" that
// owns children; collapsing a group hides its subtree (drill-down).

export type NodeShape = 'rect' | 'round' | 'diamond' | 'circle';

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** id of the parent group node, or null for a top-level node */
  parentId: string | null;
  /** collapsed groups hide their descendants */
  collapsed: boolean;
  /** persisted canvas position */
  position: { x: number; y: number };
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
