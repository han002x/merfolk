// Feed merfolk's Mermaid export to the REAL mermaid parser and check that it
// reads every shape, icon form, edge and subgraph the way merfolk means it.
// Run with: node --experimental-strip-types scripts/mermaid-compat.ts
import { JSDOM } from 'jsdom';
import { toMermaid } from '../src/mermaid/io.ts';
import { SHAPES } from '../src/shapes.ts';
import type { Diagram, DiagramNode, NodeShape } from '../src/types.ts';

// mermaid sanitizes labels with DOMPurify, which needs a DOM even to parse
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import('mermaid');

/** mermaid's internal vertex type for each merfolk shape */
const MERMAID_TYPE: Record<NodeShape, string> = {
  rect: 'square',
  round: 'round',
  stadium: 'stadium',
  subroutine: 'subroutine',
  cylinder: 'cylinder',
  circle: 'circle',
  'dbl-circle': 'doublecircle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  'lean-r': 'lean_right',
  'lean-l': 'lean_left',
  'trap-b': 'trapezoid',
  'trap-t': 'inv_trapezoid',
  flag: 'odd',
};

const node = (id: string, shape: NodeShape, label: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  label,
  shape,
  parentId: null,
  collapsed: false,
  position: { x: 0, y: 0 },
  ...extra,
});

const nodes: DiagramNode[] = [
  node('grp', 'rect', 'Stack'),
  ...SHAPES.map((d, i) => node(`s${i}`, d.shape, `${d.name} (${i})`, { parentId: 'grp' })),
  node('i0', 'rect', 'GitHub', { icon: 'simple-icons:github', pageId: 'pg1' }),
  node('p0', 'diamond', 'Linked', { pageId: 'pg2' }),
  node('i1', 'round', 'Database', { icon: 'lucide:database' }),
  node('i2', 'circle', 'User', { icon: 'lucide:user' }),
  node('i3', 'rect', '', { icon: 'lucide:cloud' }),
  // freshly placed nodes start unlabelled
  node('b0', 'cylinder', ''),
  node('b1', 'hexagon', ''),
];
const leaves = nodes.slice(1);
const d: Diagram = {
  nodes,
  edges: leaves.slice(1).map((n, i) => ({
    id: `e${i}`,
    source: leaves[i].id,
    target: n.id,
    ...(i % 2 === 0 && { label: `step ${i}` }),
  })),
};

const text = toMermaid(d);
const fails: string[] = [];
try {
  await mermaid.parse(text);
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  const db = diagram.db as unknown as {
    getVertices(): Map<string, { type?: string; icon?: string; form?: string; text?: string }>;
    getEdges(): { start: string; end: string; text: string }[];
    getSubGraphs(): { id: string; nodes: string[] }[];
  };
  const vertices = db.getVertices();
  for (const n of leaves) {
    const v = vertices.get(n.id);
    if (!v) {
      fails.push(`${n.id}: missing in mermaid`);
      continue;
    }
    if (n.icon) {
      const form = n.shape === 'circle' ? 'circle' : n.shape === 'round' ? 'rounded' : 'square';
      if (v.icon !== n.icon || v.form !== form) fails.push(`${n.id}: icon ${v.icon}/${v.form}`);
    } else if (v.type !== MERMAID_TYPE[n.shape]) {
      fails.push(`${n.id} (${n.shape}): mermaid read it as ${v.type}`);
    }
    if (n.pageId && (v as { link?: string }).link !== `#/wiki/${n.pageId}`)
      fails.push(`${n.id}: wiki link ${(v as { link?: string }).link}`);
    if ((v.text ?? '') !== n.label) fails.push(`${n.id}: label ${JSON.stringify(v.text)}`);
  }
  const edges = db.getEdges();
  if (edges.length !== d.edges.length) fails.push(`edges: ${edges.length} != ${d.edges.length}`);
  for (const [i, e] of d.edges.entries()) {
    const got = edges[i];
    if (got?.start !== e.source || got.end !== e.target || (got.text || undefined) !== e.label)
      fails.push(`edge ${e.source}->${e.target}: got ${got?.start}->${got?.end} "${got?.text}"`);
  }
  const grp = db.getSubGraphs().find((g) => g.id === 'grp');
  if (!grp || grp.nodes.length !== SHAPES.length) fails.push(`subgraph: ${grp?.nodes.length} nodes`);
} catch (err) {
  fails.push(`mermaid rejected the export: ${(err as Error).message}`);
}

if (fails.length) {
  console.error(`FAIL: mermaid compatibility\n  ${fails.join('\n  ')}\n\n${text}`);
  process.exit(1);
}
console.log('PASS: real mermaid reads every shape, icon, edge and subgraph as exported');
