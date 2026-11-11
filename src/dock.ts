// Which view the right-hand panel shows, shared so a node's page button or the
// W key can bring up its page from anywhere on the canvas.

import { create } from 'zustand';
import { useDiagram } from './store';

export type View = 'mermaid' | 'tree' | 'page';

interface Dock {
  open: boolean;
  view: View;
  setOpen: (open: boolean) => void;
  setView: (view: View) => void;
}

export const useDock = create<Dock>((set) => ({
  open: true,
  view: 'mermaid',
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
}));

/** Select a node and show its page in the panel, creating the page first. */
export function showPage(nodeId: string) {
  const st = useDiagram.getState();
  if (!st.openPage(nodeId)) return;
  st.setSelection([nodeId], []);
  useDock.setState({ open: true, view: 'page' });
}
