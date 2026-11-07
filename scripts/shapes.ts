// Every shape and icon form round-trips through merfolk's own Mermaid parser.
// Run with: node --experimental-strip-types scripts/shapes.ts
import { parseMermaid, toMermaid } from '../src/mermaid/io.ts';
import { SHAPES } from '../src/shapes.ts';
import type { Diagram, DiagramNode, NodeShape } from '../src/types.ts';

const fails: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) fails.push(msg);
};

const node = (id: string, shape: NodeShape, label: string, icon?: string): DiagramNode => ({
  id,
  label,
  shape,
  parentId: null,
  collapsed: false,
  position: { x: 0, y: 0 },
  ...(icon && { icon }),
});

// 1. every shape, plain and as an icon tile (icon tiles only keep their form)
const nodes: DiagramNode[] = SHAPES.map((d, i) => node(`s${i}`, d.shape, `${d.name} ${i}`));
nodes.push(
  node('i0', 'rect', 'GitHub', 'simple-icons:github'),
  node('i1', 'round', 'Database', 'lucide:database'),
  node('i2', 'circle', 'User', 'lucide:user'),
  node('i3', 'rect', 'AWS', 'logos:aws'), // not in our catalog: must survive
  node('i4', 'rect', '', 'lucide:cloud'),
  // freshly placed nodes start unlabelled
  ...SHAPES.map((d, i) => node(`b${i}`, d.shape, '')),
);
const d: Diagram = {
  nodes,
  edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i].id, target: n.id })),
};
const text = toMermaid(d);
const parsed = parseMermaid(text);
if (!parsed.ok) {
  fails.push(`strict parse of exported text failed: ${parsed.error}\n${text}`);
} else {
  for (const want of nodes) {
    const got = parsed.diagram.nodes.find((n) => n.id === want.id);
    check(!!got, `${want.id} missing`);
    if (!got) continue;
    check(got.label === want.label, `${want.id} label ${got.label} != ${want.label}`);
    check(got.shape === want.shape, `${want.id} shape ${got.shape} != ${want.shape}`);
    check(got.icon === want.icon, `${want.id} icon ${got.icon} != ${want.icon}`);
  }
  check(parsed.diagram.edges.length === d.edges.length, 'edges lost');
}

// 2. v11 `@{ shape: alias }` names import as the matching shape
for (const def of SHAPES) {
  for (const alias of def.aliases) {
    const r = parseMermaid(`flowchart TD\n  A@{ shape: ${alias}, label: "x" }`);
    const got = r.ok ? r.diagram.nodes[0] : null;
    check(got?.shape === def.shape && got.label === 'x', `alias ${alias} -> ${got?.shape}`);
  }
}
// unknown v11 shapes still import (as rectangles), label defaults to the id
{
  const r = parseMermaid('flowchart TD\n  A@{ shape: bolt }');
  check(r.ok && r.diagram.nodes[0].shape === 'rect' && r.diagram.nodes[0].label === 'A', 'unknown shape');
}

// 3. new brackets and @{} work as edge endpoints, and a later declaration
//    enriches an earlier bare reference
{
  const r = parseMermaid(
    [
      'flowchart LR',
      '  A[("Users DB")] -->|reads| B{{"Cache"}}',
      '  B --> C@{ icon: "simple-icons:redis", form: "rounded", label: "Redis" }',
      '  D --> E',
      '  D[\\"Upload"/]',
      '  E>"Done"]',
    ].join('\n'),
  );
  if (!r.ok) fails.push(`edge endpoints: ${r.error}`);
  else {
    const by = new Map(r.diagram.nodes.map((n) => [n.id, n]));
    check(by.get('A')?.shape === 'cylinder' && by.get('A')?.label === 'Users DB', 'A cylinder');
    check(by.get('B')?.shape === 'hexagon', 'B hexagon');
    check(by.get('C')?.icon === 'simple-icons:redis' && by.get('C')?.shape === 'round', 'C icon');
    check(by.get('D')?.shape === 'trap-t' && by.get('D')?.label === 'Upload', 'D trap-t');
    check(by.get('E')?.shape === 'flag', 'E flag');
    check(r.diagram.edges[0].label === 'reads', 'edge label');
  }
}

if (fails.length) {
  console.error('FAIL: shapes\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS: every shape + icon form round-trips; v11 aliases import');
