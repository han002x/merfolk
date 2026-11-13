// Round-trip check: edge labels (and node labels) survive toMermaid -> fromMermaid.
// Run with: node --experimental-strip-types scripts/roundtrip.ts
import { toMermaid, fromMermaid, setPageBase } from '../src/mermaid/io.ts';
import type { Diagram } from '../src/types.ts';
import assert from 'node:assert/strict';
import { parseMermaid, mergeDiagram } from '../src/mermaid/io.ts';

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
    { ...d.nodes[0], pageIds: ['pg1'] },
    { id: 'G', label: 'Group', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, pageIds: ['pg2'] },
    { ...d.nodes[1], parentId: 'G' },
  ],
  edges: d.edges,
};
const text = toMermaid(linked);
const again = fromMermaid(text);
const ids = Object.fromEntries(again.nodes.map((n) => [n.id, n.pageIds?.[0]]));
if (ids.A !== 'pg1' || ids.G !== 'pg2' || ids.B !== undefined || !text.includes('click A href "#/wiki/pg1"')) {
  console.error('FAIL: wiki links lost in round-trip');
  console.error(text, JSON.stringify(ids));
  process.exit(1);
}
console.log('PASS: wiki links round-trip as click lines');

{
  const multiple: Diagram = {
    nodes: [
      { ...d.nodes[0], pageIds: ['second', 'shared', 'first'] },
      { ...d.nodes[1], pageIds: ['shared', 'second'] },
    ], edges: [],
  };
  const out = toMermaid(multiple);
  assert.deepEqual(fromMermaid(out).nodes.map((n) => n.pageIds), [['second', 'shared', 'first'], ['shared', 'second']]);
  assert.equal(out.match(/click A href/g)?.length, 1);
  assert.ok(out.includes('click A href "#/wiki/second"'));
  const precedence = fromMermaid('flowchart TD\nA[A]\n%% marmerlade-pages A ["p2","p1","p2"]\nclick A href "#/wiki/ignored"');
  assert.deepEqual(precedence.nodes[0].pageIds, ['p2', 'p1']);
  for (const invalid of ['{', '[1]', '[""]', 'null']) {
    assert.equal(parseMermaid(`flowchart TD\nA[A]\n%% marmerlade-pages A ${invalid}`).ok, false);
  }
  const empty = fromMermaid('flowchart TD\nA[A]\nclick A href "#/wiki/ignored"\n%% marmerlade-pages A []');
  assert.deepEqual(mergeDiagram(empty, multiple).nodes[0].pageIds, []);
  const omitted = fromMermaid('flowchart TD\nA[A]');
  assert.deepEqual(mergeDiagram(omitted, multiple).nodes[0].pageIds, ['second', 'shared', 'first']);
  const encoded: Diagram = { nodes: [{ ...d.nodes[0], pageIds: ['a page/你好'] }], edges: [] };
  assert.deepEqual(fromMermaid(toMermaid(encoded)).nodes[0].pageIds, ['a page/你好']);
  assert.deepEqual(fromMermaid('flowchart TD\nA[A]\nclick A href "#/wiki/a%20page%2F%E4%BD%A0%E5%A5%BD"').nodes[0].pageIds, ['a page/你好']);
  console.log('PASS: multiple wiki links preserve order, sharing, metadata precedence, and explicit unlinking');
}
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

// page links take any base on the way out and any base on the way in
{
  const one: Diagram = { nodes: [{ ...d.nodes[0], pageIds: ['pg7'] }], edges: [] };
  const cases: [string, string][] = [
    ['', 'href "#/wiki/pg7"'],
    ['https://notes.example/app/', 'href "https://notes.example/app/#/wiki/pg7"'],
    ['  http://localhost:5173/#ignored ', 'href "http://localhost:5173/#/wiki/pg7"'],
  ];
  for (const [base, want] of cases) {
    setPageBase(base);
    const out = toMermaid(one);
    const got = fromMermaid(out).nodes[0].pageIds?.[0];
    if (!out.includes(want) || got !== 'pg7') {
      console.error(`FAIL: base ${JSON.stringify(base)}\n${out}\npageId=${got}`);
      process.exit(1);
    }
  }
  setPageBase('');
  const foreign = fromMermaid('flowchart TD\n  A["x"]\n  click A href "https://other.host/x/#/wiki/zz9"');
  if (foreign.nodes[0].pageIds?.[0] !== 'zz9') {
    console.error('FAIL: foreign-host link not read');
    process.exit(1);
  }
  console.log('PASS: page links export with a base URL and import from any base');
}
