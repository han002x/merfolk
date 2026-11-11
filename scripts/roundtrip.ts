// Round-trip check: edge labels (and node labels) survive toMermaid -> fromMermaid.
// Run with: node --experimental-strip-types scripts/roundtrip.ts
import { toMermaid, fromMermaid } from '../src/mermaid/io.ts';
import type { Diagram } from '../src/types.ts';

const d: Diagram = {
  nodes: [
    { id: 'A', label: 'Start', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
    { id: 'B', label: 'End', shape: 'round', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'e0', source: 'A', target: 'B', label: 'go now' }],
};

const mm = toMermaid(d);
const back = fromMermaid(mm);
const e = back.edges[0];

const ok = e && e.label === 'go now' && back.nodes.find((n) => n.id === 'A')?.label === 'Start';
if (!ok) {
  console.error('FAIL: round-trip lost data');
  console.error(mm);
  console.error(JSON.stringify(back.edges));
  process.exit(1);
}
console.log('PASS: edge + node labels round-trip');

// wiki links survive as `click` lines, on plain nodes and on groups
const linked: Diagram = {
  nodes: [
    { ...d.nodes[0], pageId: 'pg1' },
    { id: 'G', label: 'Group', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, pageId: 'pg2' },
    { ...d.nodes[1], parentId: 'G' },
  ],
  edges: d.edges,
};
const text = toMermaid(linked);
const again = fromMermaid(text);
const ids = Object.fromEntries(again.nodes.map((n) => [n.id, n.pageId]));
if (ids.A !== 'pg1' || ids.G !== 'pg2' || ids.B !== undefined || !text.includes('click A href "#/wiki/pg1"')) {
  console.error('FAIL: wiki links lost in round-trip');
  console.error(text, JSON.stringify(ids));
  process.exit(1);
}
console.log('PASS: wiki links round-trip as click lines');
