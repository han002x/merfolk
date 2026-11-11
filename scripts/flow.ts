// Sequenced flow check: traversal order, parallel branches, cycles, manual
// override, fold creases, and the loop length.
// Run with: node --experimental-strip-types scripts/flow.ts
import assert from 'node:assert/strict';
import { flowCycle, flowSchedule, flowSeconds, HOP_SECONDS } from '../src/flow.ts';
import { mergeDiagram, toMermaid } from '../src/mermaid/io.ts';
import { foldEdges, hiddenIds } from '../src/fold.ts';
import type { DiagramEdge, DiagramNode } from '../src/types.ts';

const E = (id: string, source: string, target: string, order?: number) => ({ id, source, target, order });
const steps = (s: ReturnType<typeof flowSchedule>) => Object.fromEntries(s.edgeStep);
const at = (s: ReturnType<typeof flowSchedule>) => Object.fromEntries(s.nodeAt);

// a chain plays one edge per step; the start node lights at once
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'b', 'c')]);
  assert.deepEqual(steps(s), { 1: 0, 2: 1 });
  assert.deepEqual(at(s), { a: 0, b: 1, c: 2 });
  assert.equal(s.steps, 2);
}

// branches fan out together; a join lights on the first arrival
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'a', 'c'), E('3', 'b', 'd'), E('4', 'c', 'd')]);
  assert.deepEqual(steps(s), { 1: 0, 2: 0, 3: 1, 4: 1 });
  assert.equal(at(s).d, 2);
}

// a pure cycle starts at its first node and plays each edge once
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'b', 'c'), E('3', 'c', 'a')]);
  assert.deepEqual(steps(s), { 1: 0, 2: 1, 3: 2 });
  assert.equal(s.steps, 3);
}

// a loop hanging off a start node still plays every edge
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'b', 'c'), E('3', 'c', 'b')]);
  assert.deepEqual(steps(s), { 1: 0, 2: 1, 3: 2 });
}

// separate components start together
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'x', 'y')]);
  assert.deepEqual(steps(s), { 1: 0, 2: 0 });
}

// a manual order overrides traversal; the rest keep theirs
{
  const s = flowSchedule([E('1', 'a', 'b'), E('2', 'b', 'c', 1)]);
  assert.deepEqual(steps(s), { 1: 0, 2: 0 });
  const t = flowSchedule([E('1', 'a', 'b', 3), E('2', 'b', 'c')]);
  assert.deepEqual(steps(t), { 1: 2, 2: 1 });
  assert.equal(t.steps, 3);
}

// no edges, no sequence
{
  const s = flowSchedule([]);
  assert.equal(s.steps, 0);
  assert.equal(flowSeconds(0, 1), 0);
}

// the signature moves with the schedule
assert.notEqual(
  flowSchedule([E('1', 'a', 'b')]).sig,
  flowSchedule([E('1', 'a', 'b', 2)]).sig,
);

// a fold keeps the sequence: the crease edge stands in for the hidden hop
{
  const N = (id: string, parentId: string | null = null, collapsed = false): DiagramNode => ({
    id, label: id, shape: 'rect', parentId, collapsed, position: { x: 0, y: 0 },
  });
  const nodes = [N('a'), N('g', null, true), N('b', 'g'), N('c')];
  const edges: DiagramEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];
  const { direct, folded } = foldEdges(nodes, edges, hiddenIds(nodes));
  const s = flowSchedule([...direct, ...folded]);
  assert.equal(s.steps, 2);
  assert.equal(s.edgeStep.get('fold:a->g'), 0);
  assert.equal(s.edgeStep.get('fold:g->c'), 1);
  assert.equal(s.nodeAt.get('g'), 1);
}

// loop length: lit hold + clear lead on top of the steps, scaled by speed
assert.equal(flowCycle(3), 4.5);
assert.equal(flowSeconds(3, 1), 4.5 * HOP_SECONDS);
assert.equal(flowSeconds(3, 2), 2.25 * HOP_SECONDS);

// a manual step is for merfolk only: Mermaid text ignores it, and a live
// Mermaid sync keeps it
{
  const node = (id: string): DiagramNode => ({
    id, label: id, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 },
  });
  const nodes = [node('a'), node('b')];
  const plain = { nodes, edges: [{ id: 'e', source: 'a', target: 'b' }] };
  const ordered = { nodes, edges: [{ id: 'e', source: 'a', target: 'b', order: 2 }] };
  assert.equal(toMermaid(ordered), toMermaid(plain));
  assert.equal(mergeDiagram(plain, ordered).edges[0].order, 2);
}

console.log('PASS: flow order, branches, cycles, manual override, folds, loop length');
