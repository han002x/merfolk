// Dagre auto-layout for merfolk.
//
// Lays out the currently VISIBLE graph (collapsed subtrees are already hidden)
// so folding a group re-flows the remaining nodes sensibly. Returns new
// positions keyed by node id; the store applies them.

import Dagre from '@dagrejs/dagre';
import { DEFAULT_IMAGE_SIZE, type DiagramEdge, type DiagramNode, type NodeImage, type NodeShape } from './types.ts';

export type Direction = 'TB' | 'LR';

// Approximate rendered footprint per shape (see App.css / DiagramNode.tsx).
/** rendered size of the (rect) insertion ghost — matches `.mf-node`'s min box,
 *  so the canvas can centre it precisely between two nodes */
export const GHOST_SIZE = { width: 120, height: 48 };

// Dagre needs width/height to space nodes without overlap.
/** label strip under (or over) an image node's picture, padding included */
export const IMAGE_LABEL_SPACE = 34;

export function sizeFor(
  shape: NodeShape,
  icon?: string,
  image?: NodeImage,
): { width: number; height: number } {
  if (image) {
    const w = image.w ?? DEFAULT_IMAGE_SIZE;
    const h = image.h ?? DEFAULT_IMAGE_SIZE;
    return { width: Math.max(w + 16, 96), height: h + IMAGE_LABEL_SPACE };
  }
  if (icon) return shape === 'circle' ? { width: 96, height: 96 } : { width: 96, height: 84 };
  switch (shape) {
    case 'circle':
    case 'dbl-circle':
      return { width: 96, height: 96 };
    case 'diamond':
      return { width: 110, height: 110 };
    case 'round':
      return { width: 140, height: 52 };
    case 'cylinder':
      return { width: 150, height: 64 };
    case 'hexagon':
    case 'lean-r':
    case 'lean-l':
    case 'trap-b':
    case 'trap-t':
    case 'flag':
      return { width: 170, height: 52 };
    default:
      return { width: 150, height: 52 };
  }
}

export function layout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: Direction = 'TB',
): Record<string, { x: number; y: number }> {
  try {
    return run(nodes, edges, direction, true);
  } catch {
    // dagre's compound mode is stricter; never let a layout failure block Tidy
    return run(nodes, edges, direction, false);
  }
}

const sheetId = (groupId: string) => `__sheet__${groupId}`;

function run(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: Direction,
  compound: boolean,
): Record<string, { x: number; y: number }> {
  const visible = new Set(nodes.map((n) => n.id));
  // Each unfolded group becomes a cluster holding its visible children, so the
  // paper sheet drawn around them never overlaps others.
  const unfolded = new Set(
    nodes
      .filter((n) => !n.collapsed && nodes.some((c) => c.parentId === n.id && visible.has(c.id)))
      .map((n) => n.id),
  );
  const open = compound ? unfolded : new Set<string>();

  const g = new Dagre.graphlib.Graph({ compound: open.size > 0 });
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    // clusters add border ranks; a third of ranksep keeps visible spacing flat
    ranksep: open.size > 0 ? 30 : 90,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // an unfolded group has no card, only its sheet (cluster)
  for (const n of nodes) if (!unfolded.has(n.id)) g.setNode(n.id, sizeFor(n.shape, n.icon, n.image));
  for (const id of open) g.setNode(sheetId(id), {});
  for (const n of nodes) {
    if (open.has(n.id)) {
      if (n.parentId && open.has(n.parentId)) g.setParent(sheetId(n.id), sheetId(n.parentId));
    } else if (n.parentId && open.has(n.parentId)) {
      g.setParent(n.id, sheetId(n.parentId));
    }
  }

  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // dagre gives node centers; React Flow positions are top-left
    const { width, height } = sizeFor(n.shape, n.icon, n.image);
    positions[n.id] = { x: p.x - width / 2, y: p.y - height / 2 };
  }
  return positions;
}
