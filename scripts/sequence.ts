import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decodeSequence, emitSequence, parseSequence, sampleSequence, walkEvents } from '../src/sequence/io.ts';
import { SEQUENCE_ARROWS } from '../src/sequence/types.ts';

const parse = (source: string) => {
  const result = parseSequence(source);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  if (!result.ok) throw new Error(result.error);
  return result;
};
const sample = sampleSequence();
assert.deepEqual(parse(emitSequence(sample).text).diagram, sample);

const repeated = parse('sequenceDiagram\nparticipant A as API\nactor B as Browser\nA->>B: Same\nA->>B: Same\nB->>B: Self\nNote over A,B: two participants\nNote right of B: side note');
const events = repeated.diagram.events;
assert.notEqual(events[0].id, events[1].id);
assert.deepEqual(parse(emitSequence(repeated.diagram).text).diagram, repeated.diagram);
assert.deepEqual([...repeated.lineRefs].map(([line, ref]) => [line, ref.kind]), [[1, 'participant'], [2, 'participant'], [3, 'message'], [4, 'message'], [5, 'message'], [6, 'note'], [7, 'note']]);

const nested = parse(`sequenceDiagram
participant A
participant B
activate A
loop Retry
  opt Cached
    A->>A: Read cache
  end
  alt Success
    A-->>B: Result
  else Retry
    par Logging
      A-)B: Log
    and Metrics
      A--)B: Count
    end
  end
end
deactivate A`);
assert.equal(walkEvents(nested.diagram.events).filter((event) => event.kind === 'fragment').length, 4);
assert.deepEqual(parse(emitSequence(nested.diagram).text).diagram, nested.diagram);
const fragment = nested.diagram.events[1];
assert.equal(fragment.kind, 'fragment');
if (fragment.kind === 'fragment') fragment.collapsed = true;
const decoded = decodeSequence(JSON.parse(JSON.stringify(nested.diagram)));
assert.deepEqual(decoded, nested.diagram);
assert.equal(emitSequence(nested.diagram).text.includes('A--)B: Count'), true);

const special = parse('sequenceDiagram\nparticipant A as 服务 #35;1#59;\nA->>A: one#59;two #35;tag<br/>next');
assert.deepEqual(parse(emitSequence(special.diagram).text).diagram, special.diagram);
const linked = parse('sequenceDiagram\nparticipant A\n%% merfolk-pages A ["p1","p2","p1"]');
assert.deepEqual(linked.diagram.participants[0].pageIds, ['p1', 'p2']);
assert.deepEqual(parse(emitSequence(linked.diagram).text).diagram, linked.diagram);

for (const source of [
  'flowchart TD\nA-->B',
  'sequenceDiagram\nA->>B: hi\nend',
  'sequenceDiagram\nalt ok\nA->>B: hi',
  'sequenceDiagram\nloop retry\nelse bad\nend',
  'sequenceDiagram\nA->>B: hi\nrect red\nend',
  'sequenceDiagram\nparticipant A\nparticipant A',
  'sequenceDiagram\n%% merfolk-id same\nA->>B: a\n%% merfolk-id same\nA->>B: b',
  'sequenceDiagram\n%% merfolk-pages A 42',
  'sequenceDiagram\nNote right of A,B: invalid',
  'sequenceDiagram\ndeactivate A',
]) assert.equal(parseSequence(source).ok, false, source);
assert.equal(parseSequence('sequenceDiagram').ok, true);
const compact = parse('sequenceDiagram\nA->>+B: request\nB-->>-A: reply');
assert.deepEqual(compact.diagram.events.filter((event) => event.kind === 'activation').map((event) => [event.participant, event.active]), [['B', true], ['B', false]]);
assert.equal(parseSequence('sequenceDiagram\nA->>+B: request\nB-->>A: reply\ndeactivate B').ok, true);

for (const bad of [null, {}, { ...sample, participants: [{ id: 'a', kind: 'database', label: 'a' }] }, { ...sample, events: [{ id: 'x', kind: 'message', from: 'missing', to: 'API', text: '', arrow: '->>' }] }, { ...sample, events: [{ id: 'x', kind: 'fragment', operator: 'loop', branches: [], collapsed: true }] }]) {
  assert.throws(() => decodeSequence(bad));
}

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false });
for (const diagram of [sample, repeated.diagram, nested.diagram, special.diagram, linked.diagram, compact.diagram]) await mermaid.parse(emitSequence(diagram).text);
for (const arrow of SEQUENCE_ARROWS) await mermaid.parse(emitSequence(parse(`sequenceDiagram\nA${arrow}B: message`).diagram).text);
console.log('PASS: sequence parsing, ordered identity, nesting, metadata, JSON validation and real Mermaid compatibility');
