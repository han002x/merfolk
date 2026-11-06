// Dagre auto-layout for merfolk.
//
// Lays out the currently VISIBLE graph (collapsed subtrees are already hidden)
// so folding a group re-flows the remaining nodes sensibly. Returns new
// positions keyed by node id; the store applies them.

import Dagre from '@dagrejs/dagre';
import type { DiagramEdge, DiagramNode, NodeShape } from './types';

export type Direction = 'TB' | 'LR';

// Approximate rendered footprint per shape (see App.css / DiagramNode.tsx).
// Dagre needs width/height to space nodes without overlap.
function sizeFor(shape: NodeShape): { width: number; height: number } {
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
  const g = new Dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const visible = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    g.setNode(n.id, sizeFor(n.shape));
  }
  for (const e of edges) {
    if (visible.has(e.source) && visible.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    if (!p) continue;
    // dagre gives node centers; React Flow positions are top-left
    const { width, height } = sizeFor(n.shape);
    positions[n.id] = { x: p.x - width / 2, y: p.y - height / 2 };
  }
  return positions;
}
