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
// image nodes: URL, embedded data: URI (commas!), every option, and a bare one
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const node = (id: string, label: string, image: NonNullable<Diagram['nodes'][0]['image']>) =>
  ({ id, label, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, image }) as const;
const imgs: Diagram = {
  nodes: [
    node('U', 'Logo', { src: 'https://example.com/logo.png?a=1,2' }),
    node('E', 'Upload', { src: PIXEL }),
    node('O', 'All', { src: 'https://example.com/x.svg', pos: 't', w: 60, h: 40, constraint: true }),
    node('Q', '', { src: 'https://example.com/"q".png' }),
  ],
  edges: [{ id: 'e0', source: 'U', target: 'E' }],
};
const imgText = toMermaid(imgs);
const imgBack = fromMermaid(imgText);
const fails: string[] = [];
for (const n of imgs.nodes) {
  const got = imgBack.nodes.find((b) => b.id === n.id);
  const want = n.id === 'Q' ? { ...n.image, src: 'https://example.com/%22q%22.png' } : n.image;
  if (JSON.stringify(got?.image) !== JSON.stringify(want)) fails.push(`${n.id}: image ${JSON.stringify(got?.image)}`);
  if (got?.label !== n.label) fails.push(`${n.id}: label ${JSON.stringify(got?.label)}`);
  if (got?.shape !== 'rect') fails.push(`${n.id}: shape ${got?.shape}`);
}
// hand-written mermaid: no label means no text (like mermaid), bad sizes are dropped
const bare = fromMermaid('flowchart TD\n  A@{ img: "https://example.com/a.png", w: nope }\n  A --> B');
const a = bare.nodes.find((n) => n.id === 'A');
if (a?.label !== '' || JSON.stringify(a?.image) !== '{"src":"https://example.com/a.png"}')
  fails.push(`bare img: ${JSON.stringify(a)}`);
// a bare reference before the declaration still picks the image up
const late = fromMermaid('flowchart TD\n  A --> B\n  B@{ img: "https://example.com/b.png", label: "B pic" }');
const b = late.nodes.find((n) => n.id === 'B');
if (b?.image?.src !== 'https://example.com/b.png' || b.label !== 'B pic') fails.push(`late img: ${JSON.stringify(b)}`);
if (fails.length) {
  console.error(`FAIL: image round-trip\n  ${fails.join('\n  ')}\n\n${imgText}`);
  process.exit(1);
}
console.log('PASS: image nodes round-trip (URL, data: URI, pos/w/h/constraint)');
