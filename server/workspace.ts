import { readFile, writeFile, rename, mkdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { Diagram } from '../src/types.ts';
import { parseDiagram, type Change } from '../src/workspaceSchema.ts';

export class Conflict extends Error {}
export async function openWorkspace(filename: string) {
  await mkdir(dirname(resolve(filename)), { recursive: true });
  const file = await realpath(filename).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await realpath(dirname(resolve(filename))), basename(filename));
  });
  const release = await lockfile.lock(file, { realpath: false });
  let diagram: Diagram;
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    const saved = typeof raw === 'object' && raw !== null && 'diagram' in raw ? raw : null;
    if (saved && 'version' in saved && ![1, 2, 3].includes(Number(saved.version))) throw new Error('Unsupported file version');
    diagram = parseDiagram(saved ? saved.diagram : raw);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { await release(); throw error; }
    diagram = { nodes: [], edges: [], pages: [], decks: [] };
  }
  let revision = 0;
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const snapshot = () => ({ revision, diagram: structuredClone(diagram) });
  function commit(expectedRevision: number, transform: (d: Diagram) => Diagram) {
    const result = queue.then(async () => {
      if (expectedRevision !== revision) throw new Conflict('Workspace changed. Read the latest revision before retrying.');
      const next = parseDiagram(transform(structuredClone(diagram)));
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify({ version: 3, diagram: next }, null, 2), { flag: 'wx' });
        await rename(temp, file);
      } finally { await unlink(temp).catch(() => {}); }
      diagram = next;
      revision++;
      listeners.forEach(listener => listener());
      return snapshot();
    });
    queue = result.then(() => {}, () => {});
    return result;
  }
  return {
    file, snapshot, commit,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async close() { await queue; await release(); },
  };
}
export type Workspace = Awaited<ReturnType<typeof openWorkspace>>;

export function applyChanges(d: Diagram, changes: Change[]): Diagram {
  const put = <T extends { id: string }>(list: T[], value: T) => [...list.filter(x => x.id !== value.id), value];
  for (const change of changes) {
    switch (change.kind) {
      case 'put_node': d.nodes = put(d.nodes, change.node); break;
      case 'put_edge': d.edges = put(d.edges, change.edge); break;
      case 'put_page': d.pages = put(d.pages ?? [], { ...change.document, updatedAt: Date.now() }); break;
      case 'put_deck': d.decks = put(d.decks ?? [], { ...change.document, updatedAt: Date.now() }); break;
      case 'delete_edge': d.edges = d.edges.filter(e => e.id !== change.id); break;
      case 'delete_node': {
        const removed = new Set([change.id]);
        let count;
        do { count = removed.size; d.nodes.forEach(n => { if (n.parentId && removed.has(n.parentId)) removed.add(n.id); }); } while (removed.size !== count);
        d.nodes = d.nodes.filter(n => !removed.has(n.id));
        d.edges = d.edges.filter(e => !removed.has(e.source) && !removed.has(e.target));
        break;
      }
      case 'delete_page':
        d.pages = (d.pages ?? []).filter(p => p.id !== change.id);
        d.nodes = d.nodes.map(n => ({ ...n, pageIds: n.pageIds?.filter(id => id !== change.id) })); break;
      case 'delete_deck':
        d.decks = (d.decks ?? []).filter(p => p.id !== change.id);
        d.nodes = d.nodes.map(n => ({ ...n, deckIds: n.deckIds?.filter(id => id !== change.id) })); break;
    }
  }
  return d;
}
