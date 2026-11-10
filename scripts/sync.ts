// Live-sync checks: validating parse, state-preserving merge.
// Run with: node --experimental-strip-types scripts/sync.ts
import { parseMermaid, mergeDiagram, toMermaid } from '../src/mermaid/io.ts';
import type { Diagram, DiagramNode } from '../src/types.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail ?? '');
  }
};

// ---- parseMermaid: clean parse vs. broken/empty ----
{
  const ok = parseMermaid('flowchart TD\n  A["Start"]\n  B("End")\n  A --> B');
  check('valid flowchart parses ok', ok.ok === true, ok);
  check('valid parse yields the nodes', ok.ok && ok.diagram.nodes.length === 2, ok);
  check('valid parse yields the edge', ok.ok && ok.diagram.edges.length === 1, ok);
}
{
  const r = parseMermaid('');
  check('empty string is rejected', r.ok === false, r);
}
{
  const r = parseMermaid('   \n  \n');
  check('blank-only string is rejected', r.ok === false, r);
}
{
  const r = parseMermaid('flowchart TD\n');
  check('header with no nodes is rejected', r.ok === false, r);
}
{
  const r = parseMermaid('flowchart TD\n  A["ok"]\n  !!! garbage !!!');
  check('a garbage line is rejected', r.ok === false, r);
  check('error names the garbage line', !r.ok && /line 3/.test(r.error), r);
}
{
  // a dangling edge: `A -->` has no right-hand endpoint, so EDGE_RE won't match
  // and it falls through to an unrecognized statement
  const r = parseMermaid('flowchart TD\n  A -->');
  check('a partial edge is rejected', r.ok === false, r);
}
{
  const r = parseMermaid('flowchart TD\n  subgraph G ["G"]\n  A["a"]');
  check('an unterminated subgraph is rejected', r.ok === false, r);
}
{
  const r = parseMermaid('flowchart TD\n  A["a"]\n  end');
  check('a stray end is rejected', r.ok === false, r);
}

// ---- mergeDiagram: preserve canvas state by id ----
const N = (
  id: string,
  label: string,
  x: number,
  y: number,
  extra: Partial<DiagramNode> = {},
): DiagramNode => ({
  id,
  label,
  shape: 'rect',
  parentId: null,
  collapsed: false,
  position: { x, y },
  ...extra,
});

const current: Diagram = {
  nodes: [
    N('A', 'Start', 100, 200, { style: { stroke: '#f00' } }),
    N('B', 'End', 300, 400, { collapsed: true }),
  ],
  edges: [{ id: 'eX', source: 'A', target: 'B', label: 'go', style: { stroke: '#0f0' } }],
};

{
  // edit A's label only; positions/styles/collapse must survive
  const parsed = parseMermaid(toMermaid(current).replace('Start', 'Begin'));
  check('edited text still parses', parsed.ok === true, parsed);
  const merged = parsed.ok ? mergeDiagram(parsed.diagram, current) : null;
  const a = merged?.nodes.find((n) => n.id === 'A');
  const b = merged?.nodes.find((n) => n.id === 'B');
  check('label follows the text', a?.label === 'Begin', a);
  check('position is preserved by id', a?.position.x === 100 && a?.position.y === 200, a);
  check('node style is preserved by id', a?.style?.stroke === '#f00', a);
  check('collapse is preserved by id', b?.collapsed === true, b);
  check('edge style is preserved by endpoints', merged?.edges[0]?.style?.stroke === '#0f0', merged?.edges);
  check('edge label follows the text', merged?.edges[0]?.label === 'go', merged?.edges);
}
{
  // add a new node C: existing nodes untouched, C keeps its parsed position
  const parsed = parseMermaid(toMermaid(current) + '\n  C["New"]');
  const merged = parsed.ok ? mergeDiagram(parsed.diagram, current) : null;
  const a = merged?.nodes.find((n) => n.id === 'A');
  const c = merged?.nodes.find((n) => n.id === 'C');
  check('adding a node leaves others put', a?.position.x === 100 && a?.position.y === 200, a);
  check('the new node is present', !!c, merged?.nodes);
  check('the new node is not pinned to an old position', c?.position.x !== 100 || c?.position.y !== 200, c);
}
{
  // delete B's line: B and the A->B edge drop out, A survives
  const parsed = parseMermaid('flowchart TD\n  A["Start"]');
  const merged = parsed.ok ? mergeDiagram(parsed.diagram, current) : null;
  check('deleting a line removes that node', !merged?.nodes.some((n) => n.id === 'B'), merged?.nodes);
  check('its touching edge is gone', (merged?.edges.length ?? -1) === 0, merged?.edges);
  check('the surviving node keeps its position', merged?.nodes[0]?.position.x === 100, merged?.nodes);
}

{
  // editing an image URL in the text reaches the node; position stays
  const pic: Diagram = {
    nodes: [
      { id: 'P', label: 'Pic', shape: 'rect', parentId: null, collapsed: false, position: { x: 7, y: 9 }, image: { src: 'https://a.example/1.png', w: 60, h: 60 } },
    ],
    edges: [],
  };
  const parsed = parseMermaid(toMermaid(pic).replace('1.png', '2.png'));
  const merged = parsed.ok ? mergeDiagram(parsed.diagram, pic) : null;
  const p = merged?.nodes[0];
  check('image src follows the text', p?.image?.src === 'https://a.example/2.png', p);
  check('image size survives the edit', p?.image?.w === 60 && p?.image?.h === 60, p);
  check('image node keeps its position', p?.position.x === 7 && p?.position.y === 9, p);
  const removed = parseMermaid('flowchart TD\n  P["Pic"]');
  const plain = removed.ok ? mergeDiagram(removed.diagram, pic).nodes[0] : null;
  check('dropping img: from the text makes it a plain node', plain != null && plain.image === undefined, plain);
}

if (failed) process.exit(1);
console.log('PASS: mermaid parse validation + state-preserving merge');
