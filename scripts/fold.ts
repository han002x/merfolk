// Fold logic check: creases reroute edges onto folded cards, fold levels step
// from the leaves inward, and sheets wrap their unfolded subtrees.
// Run with: node --experimental-strip-types scripts/fold.ts
import { SHEET_PAD, SHEET_TITLE, foldEdges, groupOrigin, groupPlan, hiddenIds, nextFoldLevel, nextUnfoldLevel, sheets } from '../src/fold.ts';
import { fromMermaid, toMermaid } from '../src/mermaid/io.ts';
import type { DiagramEdge, DiagramNode } from '../src/types.ts';

const N = (id: string, parentId: string | null, collapsed = false, x = 0, y = 0): DiagramNode => ({
  id, label: id, shape: 'rect', parentId, collapsed, position: { x, y },
});
const E = (id: string, source: string, target: string, label?: string): DiagramEdge => ({ id, source, target, label });

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail ?? '');
  }
};

// A -> x, A -> y (x, y inside G), y -> B, G contains H contains z
const tree = (gFolded: boolean, hFolded = false) => [
  N('A', null), N('B', null), N('G', null, gFolded), N('x', 'G'), N('y', 'G'),
  N('H', 'G', hFolded), N('z', 'H'),
];
const edges = [E('1', 'A', 'x', 'calls'), E('2', 'A', 'y'), E('3', 'y', 'B', 'writes'), E('4', 'x', 'y'), E('5', 'z', 'B')];

{
  const nodes = tree(true);
  const { direct, folded } = foldEdges(nodes, edges, hiddenIds(nodes));
  check('no direct edges touch a hidden node', direct.length === 0, direct);
  const aG = folded.find((f) => f.source === 'A' && f.target === 'G');
  check('A->x and A->y merge into one A->G crease', aG?.count === 2 && aG.label === undefined, aG);
  const gB = folded.find((f) => f.source === 'G' && f.target === 'B');
  check('y->B and z->B merge into G->B', gB?.count === 2, gB);
  check('x->y (inside the card) disappears', folded.length === 2, folded);
}
{
  const nodes = tree(false, true);
  const { folded } = foldEdges(nodes, edges, hiddenIds(nodes));
  const hB = folded.find((f) => f.source === 'H' && f.target === 'B');
  check('nested fold reroutes to the nearest visible card', hB?.count === 1, folded);
}
{
  check('fold level folds innermost first', JSON.stringify(nextFoldLevel(tree(false))) === '["H"]');
  check('then the next level out', JSON.stringify(nextFoldLevel(tree(false, true))) === '["G"]');
  check('nothing left to fold', nextFoldLevel(tree(true, true)).length === 0);
  check('unfold level opens visible cards only', JSON.stringify(nextUnfoldLevel(tree(true, true))) === '["G"]');
}
{
  const nodes = [N('G', null, false, 100, 100), N('a', 'G', false, 100, 200), N('b', 'G', false, 300, 200)];
  const sh = sheets(nodes, hiddenIds(nodes), (n) => n.position, () => ({ width: 100, height: 50 }));
  const r = sh[0]?.rect;
  check('one sheet per unfolded group', sh.length === 1, sh);
  // children span x 100..400, y 200..250; the group's own card plays no part
  check('sheet wraps only the children, with padding and a title band', r && r.x === 100 - SHEET_PAD && r.y === 200 - SHEET_PAD - SHEET_TITLE && r.width === 300 + 2 * SHEET_PAD && r.height === 50 + 2 * SHEET_PAD + SHEET_TITLE, r);
  const none = sheets([{ ...nodes[0], collapsed: true }, nodes[1], nodes[2]], hiddenIds([{ ...nodes[0], collapsed: true }, nodes[1], nodes[2]]), (n) => n.position, () => ({ width: 100, height: 50 }));
  check('a folded group has no sheet', none.length === 0, none);
}
{
  // tree(): A, B, G at top level; x, y, H inside G; z inside H
  const t = tree(false);
  const top = groupPlan(t, ['A', 'B']);
  check('top-level siblings make a new group at top level', top?.kind === 'new' && top.parentId === null && top.members.join() === 'A,B', top);
  const inG = groupPlan(t, ['x', 'y']);
  check('some siblings in a sheet make a sub-group inside it', inG?.kind === 'new' && inG.parentId === 'G', inG);
  const solo = [N('S', null), N('p', 'S'), N('q', 'S'), N('r', null)];
  check("all of a group's children are already grouped", groupPlan(solo, ['p', 'q']) === null);
  check('all children of a group plus an outside node still group', groupPlan(solo, ['p', 'q', 'r'])?.kind === 'new');
  const mixed = groupPlan(t, ['x', 'z']);
  check('members from different depths nest under the deepest shared group', mixed?.kind === 'new' && mixed.parentId === 'G', mixed);
  const across = groupPlan(t, ['A', 'z']);
  check('no shared group means top level', across?.kind === 'new' && across.parentId === null, across);

  // a selected group is never wrapped in a new card: the rest join it
  const join = groupPlan(t, ['G', 'x', 'A', 'B']);
  check('a selected group takes in the others, not its own child', join?.kind === 'join' && join.groupId === 'G' && join.members.join() === 'A,B', join);
  const nested = groupPlan(t, ['H', 'A']);
  check('a nested group can take in an outside node', nested?.kind === 'join' && nested.groupId === 'H' && nested.members.join() === 'A', nested);
  check('a group with only its own contents selected is no plan', groupPlan(t, ['G', 'x', 'y', 'H', 'z']) === null);
  const two = [...t, N('K', null), N('k', 'K')];
  check('two groups selected is no plan', groupPlan(two, ['G', 'K']) === null && groupPlan(two, ['G', 'K', 'A']) === null);

  check('fewer than 2 members is no plan', groupPlan(t, ['A']) === null);
  check('unknown ids are ignored', groupPlan(t, ['A', 'nope']) === null);
}
{
  // a group sits at the top-left of its contents, whatever its own position
  const nodes = [{ ...N('F', null, false, 999, 999), label: '' }, N('a', 'F', false, 100, 200), N('b', 'F', false, 300, 260), N('H', 'F', false, -50, -50), N('c', 'H', false, 150, 180)];
  const o = groupOrigin('F', nodes);
  check('a group sits at the top-left of its contents, nested groups ignored', o?.x === 100 && o.y === 180, o);
  check('a plain node has no group origin', groupOrigin('a', nodes) === null);

  // Mermaid: an untitled group survives a round trip
  const mm = toMermaid({ nodes, edges: [] });
  check('untitled group exports a blank title', mm.includes('subgraph F [" "]'), mm);
  const back = fromMermaid(mm).nodes.find((n) => n.id === 'F');
  check('blank subgraph title imports as an untitled group', back?.label === '', back);
}

if (failed) process.exit(1);
console.log('PASS: fold creases, levels, sheets and grouping');
