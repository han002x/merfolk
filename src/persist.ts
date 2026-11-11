import { equivalent } from './equivalent.ts';
// FlowchartDiagram persistence: autosave to localStorage, restore on load, and
// file-based export/import. Keeps the "open and build, come back later"
// promise — nothing is lost on refresh.

import type { FlowchartDiagram, WorkspaceDocument } from './types';
import { useDiagram } from './store.ts';
import { normalizeDiagram, mergePages } from './pages.ts';
import { decodeStructural } from './structural/io.ts';
import { decodeSequence } from './sequence/io.ts';

const KEY = 'merfolk.diagram';
const VERSION = 3;

export function currentDocument(): WorkspaceDocument {
  const state = useDiagram.getState();
  return { diagram: state.diagram, pages: state.pages };
}

export function decodeDocument(value: unknown): WorkspaceDocument {
  if (!value || typeof value !== 'object') throw new Error('Not a merfolk document');
  if ('version' in value && value.version !== 1 && value.version !== 2 && value.version !== 3) throw new Error('Unsupported document version');
  const raw = 'document' in value ? value.document : value;
  if (!raw || typeof raw !== 'object') throw new Error('Not a merfolk document');
  const diagram = 'diagram' in raw ? raw.diagram : raw;
  if (!diagram || typeof diagram !== 'object') throw new Error('Missing diagram');
  const pageData = 'pages' in raw ? raw.pages : 'pages' in diagram ? diagram.pages : [];
  const isPage = (p: unknown): p is import('./types').Page => p !== null && typeof p === 'object'
    && 'id' in p && typeof p.id === 'string' && 'title' in p && typeof p.title === 'string'
    && 'body' in p && typeof p.body === 'string' && 'updatedAt' in p && typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt);
  if (!Array.isArray(pageData) || !pageData.every(isPage)) throw new Error('Invalid wiki pages');
  const pages = pageData;
  if ('kind' in diagram && diagram.kind !== 'flowchart' && diagram.kind !== 'sequence' && diagram.kind !== 'er' && diagram.kind !== 'class') throw new Error('Unsupported diagram kind');
  if ('kind' in diagram && (diagram.kind === 'er' || diagram.kind === 'class')) return { diagram: decodeStructural(diagram), pages };
  if ('kind' in diagram && diagram.kind === 'sequence') return { diagram: decodeSequence(diagram), pages };
  if (!('nodes' in diagram) || !Array.isArray(diagram.nodes) || !('edges' in diagram) || !Array.isArray(diagram.edges)) throw new Error('Not a merfolk diagram file');
  // Legacy flowchart normalization also migrates the old single-page field.
  const graph = normalizeDiagram({ nodes: diagram.nodes, edges: diagram.edges, pages });
  return { diagram: { kind: 'flowchart', nodes: graph.nodes, edges: graph.edges }, pages: graph.pages ?? [] };
}

export function readDocument(): WorkspaceDocument | null {
  try { const raw = localStorage.getItem(KEY); return raw ? decodeDocument(JSON.parse(raw)) : null; }
  catch { return null; }
}

// Existing graph-only callers receive only flowchart documents.
export function readSaved(): FlowchartDiagram | null {
  const document = readDocument();
  if (!document || document.diagram.kind !== 'flowchart') return null;
  return { nodes: document.diagram.nodes, edges: document.diagram.edges, pages: document.pages };
}

export function write(document: FlowchartDiagram | WorkspaceDocument) {
  try {
    const normalized = 'diagram' in document ? document : decodeDocument(document);
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, document: normalized }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function loadDocument(document: WorkspaceDocument, remote = false) {
  const state = useDiagram.getState();
  const pages = remote ? mergePages(state.pages, document.pages) : document.pages;
  if (remote && equivalent(currentDocument().diagram, document.diagram)) {
    if (pages !== state.pages) useDiagram.setState({ pages });
    return;
  }
  useDiagram.setState({ diagram: document.diagram, pages,
    history: remote && state.diagram.kind === document.diagram.kind ? state.history : [],
    selectedNodeIds: [], selectedEdgeIds: [], highlight: null, insertion: null });
}

/** Subscribe the store to localStorage with a debounce. Call once at startup. */
export function startAutosave(debounceMs = 400): () => void {
  let timer: number | undefined;
  const unsubscribe = useDiagram.subscribe((state) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => write({ diagram: state.diagram, pages: state.pages }),
      debounceMs,
    );
  });
  const flush = () => write(currentDocument());
  window.addEventListener('pagehide', flush);
  return () => { unsubscribe(); window.clearTimeout(timer); window.removeEventListener('pagehide', flush); };
}

/** Follow the other window's saves. Call once at startup. */
export function startSync(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    const saved = readDocument();
    if (saved) loadDocument(saved, true);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Restore the saved diagram into the store. Returns true if anything loaded. */
export function restore(): boolean {
  const saved = readDocument();
  if (!saved) return false;
  loadDocument(saved);
  return true;
}

export function clearSaved() {
  localStorage.removeItem(KEY);
}

/** Download the current diagram as a .merfolk.json file. */
export function exportFile() {
  const payload = { version: VERSION, document: currentDocument() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diagram.merfolk.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a .merfolk.json file and load it onto the canvas. */
export async function importFile(file: File): Promise<void> {
  const text = await file.text();
  loadDocument(decodeDocument(JSON.parse(text)));
}
