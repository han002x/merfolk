import { useDiagram } from './store.ts';
import type { Diagram } from './types.ts';

export type WorkspaceStatus = { kind: 'saved' | 'saving' | 'offline' | 'conflict' | 'error'; message: string };
let status: WorkspaceStatus = { kind: 'saved', message: '' };
const listeners = new Set<() => void>();
export const workspaceStatus = () => status;
export function subscribeWorkspaceStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function report(kind: WorkspaceStatus['kind'], message = '') { status = { kind, message }; listeners.forEach(fn => fn()); }
let live = false;
export const isLiveWorkspace = () => live;
const current = (): Diagram => { const { nodes, edges, pages, decks } = useDiagram.getState(); return { nodes, edges, pages, decks }; };
let reload = async () => {};
export const reloadWorkspace = () => reload();
export function downloadWorkspaceDraft() {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, diagram: current() }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'draft.marmerlade.json'; link.click(); URL.revokeObjectURL(url);
}

interface Snapshot { revision: number; diagram: Diagram }
interface Bootstrap extends Snapshot { token: string }
export async function initializeWorkspace() {
  if (!document.querySelector('meta[name="marmerlade-workspace"]')) return;
  live = true;
  const { snapshotSchema, bootstrapSchema } = await import('./workspaceSchema.ts');
  let revision = 0;
  let token = '';
  let accepted = '';
  let applying = false;
  let saving = false;
  let pending: Snapshot | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const dirty = () => JSON.stringify(current()) !== accepted;
  function receive(snapshot: Snapshot) {
    if (snapshot.revision <= revision) return;
    if (saving) { pending = snapshot; return; }
    if (dirty()) { report('conflict', 'The workspace changed while you were editing. Download your draft before reloading.'); return; }
    apply(snapshot);
  }
  function apply(snapshot: Snapshot) {
    applying = true;
    useDiagram.setState({ ...snapshot.diagram, pages: snapshot.diagram.pages ?? [], decks: snapshot.diagram.decks ?? [], history: [] });
    revision = snapshot.revision; accepted = JSON.stringify(current()); applying = false; report('saved');
  }
  async function bootstrap(): Promise<Bootstrap> {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot connect to the workspace');
    return bootstrapSchema.parse(await response.json());
  }
  async function save() {
    if (saving || !dirty() || status.kind === 'conflict') return;
    saving = true; report('saving');
    const diagram = current();
    try {
      const response = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Marmerlade-Token': token }, body: JSON.stringify({ revision, diagram }) });
      if (response.status === 409) { report('conflict', 'The workspace changed while you were editing. Download your draft before reloading.'); return; }
      if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? 'Save failed'); }
      const snapshot = snapshotSchema.parse(await response.json());
      revision = snapshot.revision; accepted = JSON.stringify(diagram); report('saved');
    } catch (error) { report('error', error instanceof Error ? error.message : 'Save failed. Your draft is still in this window.'); }
    finally {
      saving = false;
      if (pending) { const next = pending; pending = undefined; receive(next); }
      if (dirty() && (status.kind === 'saved' || status.kind === 'error')) {
        timer = setTimeout(() => { void save(); }, status.kind === 'error' ? 2000 : 400);
      }
    }
  }
  const initial = await bootstrap(); token = initial.token; apply(initial);
  useDiagram.subscribe(() => {
    if (applying || !dirty()) return;
    clearTimeout(timer); timer = setTimeout(() => { void save(); }, 400);
  });
  reload = async () => {
    if (saving) return;
    try { const next = await bootstrap(); token = next.token; apply(next); }
    catch { report('offline', 'Workspace disconnected. Your draft is still in this window.'); }
  };
  function connect() {
    const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/events?token=${encodeURIComponent(token)}`);
    socket.onmessage = event => { try { receive(snapshotSchema.parse(JSON.parse(event.data))); } catch { report('error', 'Invalid workspace update. Reload to reconnect.'); } };
    socket.onclose = () => {
      if (status.kind !== 'conflict') report('offline', 'Workspace disconnected. Your draft is still in this window.');
      setTimeout(() => { void reconnect(); }, 2000);
    };
  }
  async function reconnect() {
    try {
      const next = await bootstrap(); token = next.token;
      // A new process starts its revision counter again. Treat this as a conflict if a draft exists.
      if (dirty() && (next.revision !== revision || JSON.stringify(next.diagram) !== accepted)) report('conflict', 'The workspace changed. Download your draft before reloading.');
      else if (!dirty()) apply(next);
      else { report('saved'); void save(); }
      connect();
    } catch { setTimeout(() => { void reconnect(); }, 2000); }
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  connect();
}
