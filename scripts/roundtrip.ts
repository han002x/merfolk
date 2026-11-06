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
