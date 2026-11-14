import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkspace, applyChanges } from '../server/workspace.ts';
import { parseDiagram } from '../src/workspaceSchema.ts';

const node = { id: 'a', label: 'API', shape: 'rect' as const, parentId: null, collapsed: false, position: { x: 0, y: 0 } };
test('atomic edits, conflicts, locks, validation and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marmerlade-'));
  const file = join(dir, 'diagram.marmerlade.json');
  const workspace = await openWorkspace(file);
  try {
    await assert.rejects(openWorkspace(file), /lock/i);
    const saved = await workspace.commit(0, d => applyChanges(d, [
      { kind: 'put_node', node: { ...node, pageIds: ['p'] } },
      { kind: 'put_page', document: { id: 'p', title: 'API', body: '# Hello' } },
    ]));
    assert.equal(saved.revision, 1);
    assert.equal(saved.diagram.pages?.[0].body, '# Hello');
    await assert.rejects(workspace.commit(0, d => ({ ...d, nodes: [] })), /changed/);
    await assert.rejects(workspace.commit(1, d => ({ ...d, nodes: [{ ...node, parentId: 'a' }] })), /cycle/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).diagram.pages[0].body, '# Hello');
    const removed = await workspace.commit(1, d => applyChanges(d, [{ kind: 'delete_node', id: 'a' }]));
    assert.equal(removed.diagram.nodes.length, 0);
    assert.equal(removed.diagram.pages?.length, 1);
    // A rename failure must leave the committed in-memory revision unchanged.
    await rm(file); await mkdir(file);
    await assert.rejects(workspace.commit(2, d => ({ ...d, nodes: [node] })));
    assert.equal(workspace.snapshot().revision, 2);
    await rm(file, { recursive: true });
    await writeFile(file, JSON.stringify({ version: 3, diagram: removed.diagram }));
  } finally { await workspace.close(); }
  const reopened = await openWorkspace(file);
  try { assert.equal(reopened.snapshot().diagram.pages?.[0].body, '# Hello'); }
  finally { await reopened.close(); await rm(dir, { recursive: true }); }
});
test('rejects broken graph/document links and accepts the packaged example', async () => {
  assert.throws(() => parseDiagram({ nodes: [node, node], edges: [] }), /Duplicate/);
  assert.throws(() => parseDiagram({ nodes: [node], edges: [{ id: 'e', source: 'a', target: 'b' }] }), /endpoint/);
  assert.throws(() => parseDiagram({ nodes: [{ ...node, pageIds: ['missing'] }], edges: [] }), /linked/);
  const example = JSON.parse(await readFile(new URL('../server/example.json', import.meta.url), 'utf8'));
  assert.equal(parseDiagram(example.diagram).decks?.length, 1);
});
