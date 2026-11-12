// Which view the right-hand panel shows, shared so a node's page button or the
// W key can bring up its page from anywhere on the canvas.

import { create } from 'zustand';
import { useDiagram } from './store.ts';

export type View = 'mermaid' | 'tree' | 'page';

interface Dock {
  open: boolean;
  view: View;
  /** page tab: rich text, reading, or Markdown source; kept across pages */
  mode: 'edit' | 'read' | 'source';
  page: { selection: string | undefined; id: string } | null;
  setPage: (id: string | null) => void;
  setMode: (mode: 'edit' | 'read' | 'source') => void;
  setOpen: (open: boolean) => void;
  setView: (view: View) => void;
}

export const useDock = create<Dock>((set) => ({
  open: true,
  view: 'mermaid',
  mode: 'edit',
  page: null,
  setPage: (id) => set({ page: id ? { selection: useDiagram.getState().selectedNodeIds[0], id } : null }),
  setMode: (mode) => set({ mode }),
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
}));

useDiagram.subscribe((state, previous) => {
  if (state.selectedNodeIds[0] !== previous.selectedNodeIds[0]) useDock.setState({ page: null });
});

/** Select a node and show its page in the panel, creating the page first. */
export function showPage(nodeId: string, pageId?: string) {
  const st = useDiagram.getState();
  const id = st.openPage(nodeId, pageId);
  if (!id) return;
  st.setSelection([nodeId], []);
  useDock.setState({ open: true, view: 'page', page: { selection: nodeId, id } });
}
