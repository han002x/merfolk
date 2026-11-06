// Dagre auto-layout for merfolk.
//
// Lays out the currently VISIBLE graph (collapsed subtrees are already hidden)
// so folding a group re-flows the remaining nodes sensibly. Returns new
// positions keyed by node id; the store applies them.

import Dagre from '@dagrejs/dagre';
import type { DiagramEdge, DiagramNode, NodeShape } from './types';

export type Direction = 'TB' | 'LR';

// Approximate rendered footprint per shape (see App.css / DiagramNode.tsx).
/** rendered size of the (rect) insertion ghost — matches `.mf-node`'s min box,
 *  so the canvas can centre it precisely between two nodes */
export const GHOST_SIZE = { width: 120, height: 48 };

// Dagre needs width/height to space nodes without overlap.
export function sizeFor(shape: NodeShape): { width: number; height: number } {
  switch (shape) {
    case 'circle':
      return { width: 96, height: 96 };
    case 'diamond':
      return { width: 110, height: 110 };
    case 'round':
      return { width: 140, height: 52 };
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
  // Each unfolded group becomes a cluster holding its card and its visible
  // children, so the paper sheet drawn around them never overlaps others.
  const open = compound
    ? new Set(
        nodes
          .filter((n) => !n.collapsed && nodes.some((c) => c.parentId === n.id && visible.has(c.id)))
          .map((n) => n.id),
      )
    : new Set<string>();

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

  // an unfolded frame has no card, only its sheet (cluster)
  const cardless = (n: DiagramNode) => n.frame === true && !n.collapsed;
  for (const n of nodes) if (!cardless(n)) g.setNode(n.id, sizeFor(n.shape));
  for (const id of open) g.setNode(sheetId(id), {});
  for (const n of nodes) {
    if (open.has(n.id)) {
      if (!cardless(n)) g.setParent(n.id, sheetId(n.id));
      if (n.parentId && open.has(n.parentId)) g.setParent(sheetId(n.id), sheetId(n.parentId));
    } else if (n.parentId && open.has(n.parentId)) {
      g.setParent(n.id, sheetId(n.parentId));
    }
  }

  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target) && visible.has(e.source) && visible.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // dagre gives node centers; React Flow positions are top-left
    const { width, height } = sizeFor(n.shape);
    positions[n.id] = { x: p.x - width / 2, y: p.y - height / 2 };
  }
  return positions;
}
