// Diagram persistence: autosave to localStorage, restore on load, and
// file-based export/import. Keeps the "open and build, come back later"
// promise — nothing is lost on refresh.

import type { Diagram } from './types';
import { useDiagram } from './store';

const KEY = 'merfolk.diagram';
const VERSION = 1;

interface Saved {
  version: number;
  diagram: Diagram;
}

export function readSaved(): Diagram | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (parsed.version !== VERSION || !parsed.diagram) return null;
    return parsed.diagram;
  } catch {
    return null;
  }
}

function write(diagram: Diagram) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, diagram }));
  } catch {
    // storage full or disabled — autosave is best-effort, never fatal
  }
}

/** Subscribe the store to localStorage with a debounce. Call once at startup. */
export function startAutosave(debounceMs = 400): () => void {
  let timer: number | undefined;
  return useDiagram.subscribe((state) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => write({ nodes: state.nodes, edges: state.edges }),
      debounceMs,
    );
  });
}

/** Restore the saved diagram into the store. Returns true if anything loaded. */
export function restore(): boolean {
  const saved = readSaved();
  if (!saved || saved.nodes.length === 0) return false;
  useDiagram.getState().load(saved);
  return true;
}

export function clearSaved() {
  localStorage.removeItem(KEY);
}

/** Download the current diagram as a .merfolk.json file. */
export function exportFile() {
  const { nodes, edges } = useDiagram.getState();
  const payload: Saved = { version: VERSION, diagram: { nodes, edges } };
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
  const parsed = JSON.parse(text) as Saved | Diagram;
  const diagram = 'diagram' in parsed ? parsed.diagram : parsed;
  if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    throw new Error('Not a merfolk diagram file');
  }
  useDiagram.getState().load(diagram);
}
