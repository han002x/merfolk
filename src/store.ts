import { create } from 'zustand';
import type { Diagram, DiagramEdge, DiagramNode, NodeShape } from './types';
import { fromMermaid, toMermaid } from './mermaid/io';
import { layout, type Direction } from './layout';

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${idSeq++}`;

interface State {
  nodes: DiagramNode[];
  edges: DiagramEdge[];

  // derived helpers
  isGroup: (id: string) => boolean;
  hiddenNodeIds: () => Set<string>;

  // mutations
  addNode: (shape: NodeShape, position: { x: number; y: number }) => string;
  updateLabel: (id: string, label: string) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  connect: (source: string, target: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  toggleCollapse: (id: string) => void;
  nestInto: (childId: string, groupId: string | null) => void;
  autoLayout: (direction?: Direction) => void;

  // interop
  loadMermaid: (src: string) => void;
  exportMermaid: () => string;
  load: (d: Diagram) => void;
}

function computeHidden(nodes: DiagramNode[]): Set<string> {
  const byParent = new Map<string | null, DiagramNode[]>();
  for (const n of nodes) {
    const k = n.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  const hidden = new Set<string>();
  const collapsed = nodes.filter((n) => n.collapsed);
  const hideSubtree = (id: string) => {
    const kids = byParent.get(id) ?? [];
    for (const k of kids) {
      hidden.add(k.id);
      hideSubtree(k.id);
    }
  };
  for (const c of collapsed) hideSubtree(c.id);
  return hidden;
}

export const useDiagram = create<State>((set, get) => ({
  nodes: [],
  edges: [],

  isGroup: (id) => get().nodes.some((n) => n.parentId === id),

  hiddenNodeIds: () => computeHidden(get().nodes),

  addNode: (shape, position) => {
    const id = nextId('n');
    const node: DiagramNode = {
      id,
      label: 'New node',
      shape,
      parentId: null,
      collapsed: false,
      position,
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
    return id;
  },

  updateLabel: (id, label) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, label } : n)),
    })),

  moveNode: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),

  removeNode: (id) =>
    set((s) => {
      // remove node, its descendants, and touching edges
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of s.nodes) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id);
            changed = true;
          }
        }
      }
      return {
        nodes: s.nodes.filter((n) => !toRemove.has(n.id)),
        edges: s.edges.filter(
          (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
        ),
      };
    }),

  connect: (source, target) =>
    set((s) => {
      if (source === target) return s;
      const exists = s.edges.some(
        (e) => e.source === source && e.target === target,
      );
      if (exists) return s;
      return {
        edges: [...s.edges, { id: nextId('e'), source, target }],
      };
    }),

  updateEdgeLabel: (id, label) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, label: label.trim() || undefined } : e,
      ),
    })),

  toggleCollapse: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, collapsed: !n.collapsed } : n,
      ),
    })),

  nestInto: (childId, groupId) =>
    set((s) => {
      if (childId === groupId) return s;
      return {
        nodes: s.nodes.map((n) =>
          n.id === childId ? { ...n, parentId: groupId } : n,
        ),
      };
    }),

  autoLayout: (direction = 'TB') =>
    set((s) => {
      // only lay out what's currently on screen; hidden nodes keep positions
      const hidden = computeHidden(s.nodes);
      const visible = s.nodes.filter((n) => !hidden.has(n.id));
      if (visible.length === 0) return s;
      const positions = layout(visible, s.edges, direction);
      return {
        nodes: s.nodes.map((n) =>
          positions[n.id] ? { ...n, position: positions[n.id] } : n,
        ),
      };
    }),

  loadMermaid: (src) => {
    const d = fromMermaid(src);
    set({ nodes: d.nodes, edges: d.edges });
  },

  exportMermaid: () => toMermaid({ nodes: get().nodes, edges: get().edges }),

  load: (d) => set({ nodes: d.nodes, edges: d.edges }),
}));
