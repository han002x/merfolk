import { create } from 'zustand';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  ElementStyle,
  NodeImage,
  NodeShape,
  Deck,
  Page,
} from './types';
import { fromMermaid, mergeDiagram, parseMermaid, toMermaid } from './mermaid/io.ts';
import { layout, type Direction } from './layout.ts';
import { createPageFor, mergePages, newPageId, normalizeDiagram, type LinkKey } from './pages.ts';
import {
  childrenOf,
  descendants,
  groupOrigin,
  groupPlan,
  hiddenIds as computeHidden,
} from './fold.ts';

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${idSeq++}`;

function nextNodeId(nodes: DiagramNode[]): string {
  let id: string;
  do {
    id = `node${Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0')}`;
  } while (nodes.some((node) => node.id === id));
  return id;
}

/**
 * Whether two diagrams are equivalent for live-sync purposes: same nodes
 * (id, label, shape, icon, image, parentId, position) and same edges (source, target,
 * label), in the same order. Lets `syncMermaid` skip no-op edits so moving the
 * caret or re-typing identical text neither re-renders nor grows undo history.
 */
const imageKey = (i?: NodeImage) =>
  i ? `${i.src}\u0000${i.pos ?? ''}\u0000${i.w ?? ''}\u0000${i.h ?? ''}\u0000${i.constraint ? 1 : 0}` : '';

function unchanged(a: Diagram, b: Diagram): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  for (let i = 0; i < a.nodes.length; i++) {
    const x = a.nodes[i];
    const y = b.nodes[i];
    if (
      x.id !== y.id ||
      x.label !== y.label ||
      x.shape !== y.shape ||
      x.icon !== y.icon ||
      JSON.stringify(x.pageIds ?? []) !== JSON.stringify(y.pageIds ?? []) ||
      JSON.stringify(x.deckIds ?? []) !== JSON.stringify(y.deckIds ?? []) ||
      imageKey(x.image) !== imageKey(y.image) ||
      x.parentId !== y.parentId ||
      x.position.x !== y.position.x ||
      x.position.y !== y.position.y
    )
      return false;
  }
  for (let i = 0; i < a.edges.length; i++) {
    const x = a.edges[i];
    const y = b.edges[i];
    if (x.source !== y.source || x.target !== y.target || x.label !== y.label) return false;
  }
  return true;
}

export interface Highlight {
  /** 'node' or 'edge' — what kind of element is highlighted */
  kind: 'node' | 'edge';
  /** the node/edge id */
  id: string;
}

/**
 * A pending insertion point, surfaced when the user hovers the gap *between*
 * two lines of the Mermaid editor. It is a preview only (nothing is inserted
 * until committed): the editor paints a caret at the gap and the canvas paints
 * a ghost node between `afterNodeId` and `beforeNodeId`.
 */
export interface Insertion {
  /**
   * id of the node the insertion follows, or null to insert at the very top
   * (before every node). Used by the canvas to anchor the ghost.
   */
  afterNodeId: string | null;
  /**
   * id of the first node declared after the gap, or null when the gap follows
   * every node. Together with `afterNodeId` it places the ghost *between* the
   * two neighbours instead of just below one of them.
   */
  beforeNodeId: string | null;
  /** the subgraph (group node) the gap sits inside, or null at top level */
  parentId: string | null;
  /** the edge to split, when the insertion was started from that edge on the
   *  canvas; otherwise the edge between the two neighbours (if any) */
  edgeId?: string;
}

/**
 * The edge an insertion splits: one running directly between the two nodes
 * that neighbour the gap (in either direction). Inserting turns `A → B` into
 * `A → new → B`; with no such edge the new node is left unconnected.
 */
export function splitEdgeFor(
  edges: DiagramEdge[],
  insertion: Insertion | null,
): DiagramEdge | undefined {
  if (!insertion) return undefined;
  if (insertion.edgeId) return edges.find((e) => e.id === insertion.edgeId);
  const { afterNodeId: a, beforeNodeId: b } = insertion;
  if (a == null || b == null) return undefined;
  return edges.find(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
}

interface Snapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface State {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** wiki pages; not part of undo history */
  pages: Page[];
  /** slide decks; not part of undo history */
  decks: Deck[];

  /** element currently hovered/focused anywhere (canvas or mermaid editor) */
  highlight: Highlight | null;

  /** pending insertion point previewed while hovering between editor lines */
  insertion: Insertion | null;
  /** where the canvas is drawing the insertion ghost (flow coords), so a
   *  committed insertion lands exactly where it was previewed */
  ghostAt: { x: number; y: number } | null;

  /** ids of the currently selected nodes/edges (drives the style panel) */
  selectedNodeIds: string[];
  selectedEdgeIds: string[];

  /** past diagram states, oldest first; the tail is the most recent undo target */
  history: Snapshot[];

  // derived helpers
  isGroup: (id: string) => boolean;
  hiddenNodeIds: () => Set<string>;

  // history
  canUndo: () => boolean;
  undo: () => void;

  // highlight sync
  setHighlight: (h: Highlight | null) => void;

  // insertion preview sync (mermaid editor <-> canvas)
  setInsertion: (i: Insertion | null) => void;
  setGhostAt: (p: { x: number; y: number } | null) => void;
  /** turn the previewed insertion into a real node; returns its id */
  commitInsertion: (shape?: NodeShape) => string | null;

  // selection
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;

  // wiki
  /** Open a linked page or the default, creating missing content on first call. */
  openPage: (nodeId: string, pageId?: string) => string | null;
  createPageForNode: (nodeId: string) => string | null;
  /** a free-standing page (no node yet) */
  createPage: (title: string) => string;
  /** drop a page and unlink any node that pointed at it */
  deletePage: (id: string) => void;
  /** Attach an existing page without changing its other links. */
  linkPage: (pageId: string, nodeId: string) => void;
  unlinkPage: (pageId: string, nodeId: string) => void;
  makeDefaultPage: (pageId: string, nodeId: string) => void;
  updatePage: (id: string, patch: Partial<Pick<Page, 'title' | 'body'>>) => void;

  // slides: the same actions over decks
  openDeck: (nodeId: string, deckId?: string) => string | null;
  createDeckForNode: (nodeId: string) => string | null;
  createDeck: (title: string) => string;
  deleteDeck: (id: string) => void;
  linkDeck: (deckId: string, nodeId: string) => void;
  unlinkDeck: (deckId: string, nodeId: string) => void;
  makeDefaultDeck: (deckId: string, nodeId: string) => void;
  updateDeck: (id: string, patch: Partial<Pick<Deck, 'title' | 'body'>>) => void;

  // mutations
  addNode: (
    shape: NodeShape,
    position: { x: number; y: number },
    extra?: { icon?: string; image?: NodeImage; label?: string },
  ) => string;
  updateLabel: (id: string, label: string) => void;
  /** patch a node's image (`null` turns it back into a plain node) */
  updateNodeImage: (id: string, patch: Partial<NodeImage> | null) => void;
  updateNodeStyle: (ids: string[], patch: Partial<ElementStyle>) => void;
  updateEdgeStyle: (ids: string[], patch: Partial<ElementStyle>) => void;
  /** set (or, with undefined, clear) the flow step of several edges */
  setEdgeOrder: (ids: string[], order: number | undefined) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  connect: (source: string, target: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  removeEdge: (id: string) => void;
  toggleCollapse: (id: string) => void;
  /** fold (true) or unfold (false) several groups as one undo step */
  setCollapsed: (ids: string[], collapsed: boolean) => void;
  nestInto: (childId: string, groupId: string | null) => void;
  /** wrap the given nodes in a new untitled group (a sheet, no card of its own),
   *  or move them into the one group already among them; returns its id */
  groupNodes: (ids: string[]) => string | null;
  autoLayout: (direction?: Direction) => void;

  // interop
  loadMermaid: (src: string) => void;
  /**
   * Live sync from the Mermaid editor: parse `src`, and on a clean parse merge
   * it into the current diagram (preserving positions/styles/collapse by id),
   * laying out only genuinely new nodes. Invalid or empty text is a no-op and
   * returns a readable error so the editor can hold the last good canvas.
   * A run of rapid edits coalesces into a single undo step.
   */
  syncMermaid: (src: string) => { ok: true } | { ok: false; error: string };
  exportMermaid: () => string;
  load: (d: Diagram) => void;
  /**
   * Take on another window's saved diagram without touching undo history or
   * selection. Pages and decks merge by `updatedAt`; a no-op when nothing differs.
   */
  applyRemote: (d: Diagram) => void;
}

const HISTORY_LIMIT = 100;

export const useDiagram = create<State>((set, get) => {
  /** id of the node in an in-progress drag, so a drag coalesces to one undo */
  let lastMoveId: string | null = null;

  /** key of the last style edit, so a slider/color drag coalesces to one undo */
  let lastStyleKey: string | null = null;

  /** true while a run of live mermaid edits is coalescing into one undo step */
  let syncing = false;

  /** Snapshot the current diagram onto the undo stack before a mutation. */
  const snapshot = (): Pick<State, 'history'> => {
    lastMoveId = null; // any snapshotted change ends a drag-coalescing run
    lastStyleKey = null; // ...and ends a style-coalescing run
    syncing = false; // ...and ends a live-mermaid-sync run
    const { nodes, edges, history } = get();
    const next = [...history, { nodes, edges }];
    if (next.length > HISTORY_LIMIT) next.shift();
    return { history: next };
  };

  /**
   * Snapshot unless this style edit continues the previous one (same elements +
   * same property), so dragging a slider or scrubbing a color is one undo step.
   */
  const styleSnapshot = (key: string): Pick<State, 'history'> | null => {
    const coalesce = lastStyleKey === key && get().history.length > 0;
    lastStyleKey = key;
    lastMoveId = null;
    syncing = false;
    if (coalesce) return null;
    const { nodes, edges, history } = get();
    const next = [...history, { nodes, edges }];
    if (next.length > HISTORY_LIMIT) next.shift();
    return { history: next };
  };


  /**
   * Pages and decks are the same thing to the store: documents that nodes link
   * to in order, the first being the default. One set of actions serves both.
   */
  const linked = (list: 'pages' | 'decks', key: LinkKey) => {
    const prefix = key === 'deckIds' ? 'deck' : 'page';
    const relink = (nodes: DiagramNode[], match: (n: DiagramNode) => boolean, ids: (old: string[]) => string[]) =>
      nodes.map((n) => (match(n) ? { ...n, [key]: ids(n[key] ?? []) } : n));
    const has = (id: string) => (n: DiagramNode) => !!n[key]?.includes(id);
    return {
      open: (nodeId: string, docId?: string): string | null => {
        const s = get();
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        if (docId && !node[key]?.includes(docId)) return null;
        const target = docId ? { ...node, [key]: [docId] } : node;
        const doc = createPageFor(target, s[list], Date.now(), key);
        if (doc) {
          set({
            [list]: [...s[list], doc],
            nodes: relink(s.nodes, (n) => n.id === nodeId && !n[key]?.length, () => [doc.id]),
          } as Partial<State>);
        }
        return doc?.id ?? target[key]?.[0] ?? null;
      },
      createFor: (nodeId: string): string | null => {
        const s = get();
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        const id = newPageId(s[list], prefix);
        set({
          [list]: [...s[list], { id, title: node.label, body: '', updatedAt: Date.now() }],
          nodes: relink(s.nodes, (n) => n.id === nodeId, (old) => [...old, id]),
        } as Partial<State>);
        return id;
      },
      /** a free-standing document (no node yet) */
      create: (title: string): string => {
        const id = newPageId(get()[list], prefix);
        set((s) => ({ [list]: [...s[list], { id, title, body: '', updatedAt: Date.now() }] }) as Partial<State>);
        return id;
      },
      remove: (id: string) =>
        set((s) => ({
          [list]: s[list].filter((p) => p.id !== id),
          nodes: relink(s.nodes, has(id), (old) => old.filter((p) => p !== id)),
          // Undo can restore deleted nodes, but must not revive links to deleted documents.
          history: s.history.map((h) => ({ ...h, nodes: relink(h.nodes, has(id), (old) => old.filter((p) => p !== id)) })),
        }) as Partial<State>),
      link: (id: string, nodeId: string) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === nodeId);
          if (!node || has(id)(node) || !s[list].some((p) => p.id === id)) return s;
          return { nodes: relink(s.nodes, (n) => n.id === nodeId, (old) => [...old, id]) };
        }),
      unlink: (id: string, nodeId: string) =>
        set((s) => ({ nodes: relink(s.nodes, (n) => n.id === nodeId && has(id)(n), (old) => old.filter((p) => p !== id)) })),
      makeDefault: (id: string, nodeId: string) =>
        set((s) => ({ nodes: relink(s.nodes, (n) => n.id === nodeId && has(id)(n), (old) => [id, ...old.filter((p) => p !== id)]) })),
      update: (id: string, patch: Partial<Pick<Page, 'title' | 'body'>>) =>
        set((s) => ({
          [list]: s[list].map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
        }) as Partial<State>),
    };
  };
  const pages = linked('pages', 'pageIds');
  const decks = linked('decks', 'deckIds');

  return {
  nodes: [],
  edges: [],
  pages: [],
  decks: [],
  highlight: null,
  insertion: null,
  ghostAt: null,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  history: [],

  isGroup: (id) => get().nodes.some((n) => n.parentId === id),

  hiddenNodeIds: () => computeHidden(get().nodes),

  canUndo: () => get().history.length > 0,

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      return {
        nodes: prev.nodes,
        edges: prev.edges,
        history: s.history.slice(0, -1),
      };
    }),

  setHighlight: (highlight) =>
    set((s) => {
      // avoid a pointless re-render when nothing changed
      const cur = s.highlight;
      if (cur === highlight) return s;
      if (cur && highlight && cur.kind === highlight.kind && cur.id === highlight.id)
        return s;
      return { highlight };
    }),

  setInsertion: (insertion) =>
    set((s) => {
      // skip no-op updates so pointer moves within one gap don't re-render
      const cur = s.insertion;
      if (cur === insertion) return s;
      if (
        cur &&
        insertion &&
        cur.afterNodeId === insertion.afterNodeId &&
        cur.beforeNodeId === insertion.beforeNodeId &&
        cur.parentId === insertion.parentId &&
        cur.edgeId === insertion.edgeId
      )
        return s;
      return { insertion };
    }),

  setGhostAt: (ghostAt) =>
    set((s) =>
      s.ghostAt === ghostAt ||
      (s.ghostAt && ghostAt && s.ghostAt.x === ghostAt.x && s.ghostAt.y === ghostAt.y)
        ? s
        : { ghostAt },
    ),

  commitInsertion: (shape = 'rect') => {
    const { insertion, ghostAt, nodes, edges } = get();
    if (!insertion || !ghostAt) return null;
    const { parentId, beforeNodeId } = insertion;
    const id = nextNodeId(get().nodes);
    const node: DiagramNode = {
      id,
      label: '',
      shape,
      parentId,
      collapsed: false,
      position: ghostAt,
    };
    // Mermaid emits siblings in array order, so the array slot decides where
    // the new line appears: just before the next sibling, else after the last
    let at = beforeNodeId ? nodes.findIndex((n) => n.id === beforeNodeId) : -1;
    if (at < 0 || nodes[at].parentId !== parentId) {
      at = nodes.length;
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].parentId === parentId) {
          at = i + 1;
          break;
        }
      }
    }
    const next = [...nodes.slice(0, at), node, ...nodes.slice(at)];

    // A → B becomes A → new → B, in the split edge's slot so the Mermaid edge
    // order is kept; the label stays on the first leg, the style on both
    const split = splitEdgeFor(edges, insertion);
    const nextEdges = split
      ? edges.flatMap((e) =>
          e.id !== split.id
            ? [e]
            : [
                { ...e, id: nextId('e'), target: id },
                { id: nextId('e'), source: id, target: e.target, style: e.style },
              ],
        )
      : edges;

    set({ ...snapshot(), nodes: next, edges: nextEdges, insertion: null, ghostAt: null });
    return id;
  },

  setSelection: (nodeIds, edgeIds) =>
    set((s) => {
      const same =
        s.selectedNodeIds.length === nodeIds.length &&
        s.selectedEdgeIds.length === edgeIds.length &&
        s.selectedNodeIds.every((id, i) => id === nodeIds[i]) &&
        s.selectedEdgeIds.every((id, i) => id === edgeIds[i]);
      if (same) return s;
      return { selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds };
    }),

  addNode: (shape, position, { icon, image, label = '' } = {}) => {
    const id = nextNodeId(get().nodes);
    const node: DiagramNode = {
      id,
      label,
      shape,
      parentId: null,
      collapsed: false,
      position,
      ...(icon && { icon }),
      ...(image && { image }),
    };
    set((s) => ({ ...snapshot(), nodes: [...s.nodes, node] }));
    return id;
  },

  updateLabel: (id, label) =>
    set((s) => {
      const nodes = s.nodes.map((n) => (n.id === id ? { ...n, label } : n));
      return {
        ...snapshot(),
        nodes,
      };
    }),

  openPage: pages.open,
  createPageForNode: pages.createFor,
  createPage: pages.create,
  deletePage: pages.remove,
  linkPage: pages.link,
  unlinkPage: pages.unlink,
  makeDefaultPage: pages.makeDefault,
  updatePage: pages.update,

  openDeck: decks.open,
  createDeckForNode: decks.createFor,
  createDeck: decks.create,
  deleteDeck: decks.remove,
  linkDeck: decks.link,
  unlinkDeck: decks.unlink,
  makeDefaultDeck: decks.makeDefault,
  updateDeck: decks.update,

  updateNodeImage: (id, patch) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === id);
      if (!node || (!node.image && !patch?.src)) return s;
      return {
        ...snapshot(),
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (!patch) {
            const rest = { ...n };
            delete rest.image;
            return rest;
          }
          const image = { ...n.image, ...patch } as NodeImage;
          // `undefined` in a patch clears that option rather than storing it
          for (const k of Object.keys(image) as (keyof NodeImage)[]) {
            if (image[k] === undefined || image[k] === false) delete image[k];
          }
          return { ...n, image };
        }),
      };
    }),

  updateNodeStyle: (ids, patch) =>
    set((s) => {
      if (ids.length === 0) return s;
      const key = `node:${patch ? Object.keys(patch).join(',') : ''}:${ids.join(',')}`;
      const set$ = new Set(ids);
      return {
        ...styleSnapshot(key),
        nodes: s.nodes.map((n) =>
          set$.has(n.id) ? { ...n, style: { ...n.style, ...patch } } : n,
        ),
      };
    }),

  updateEdgeStyle: (ids, patch) =>
    set((s) => {
      if (ids.length === 0) return s;
      const key = `edge:${patch ? Object.keys(patch).join(',') : ''}:${ids.join(',')}`;
      const set$ = new Set(ids);
      return {
        ...styleSnapshot(key),
        edges: s.edges.map((e) =>
          set$.has(e.id) ? { ...e, style: { ...e.style, ...patch } } : e,
        ),
      };
    }),

  setEdgeOrder: (ids, order) =>
    set((s) => {
      if (ids.length === 0) return s;
      const set$ = new Set(ids);
      return {
        ...styleSnapshot(`order:${ids.join(',')}`),
        edges: s.edges.map((e) => {
          if (!set$.has(e.id)) return e;
          const next = { ...e };
          delete next.order;
          return order == null ? next : { ...next, order };
        }),
      };
    }),

  moveNode: (id, position) =>
    set((s) => {
      // coalesce a continuous drag of one node into a single history entry:
      // only snapshot when the move starts on a different node than last time
      const coalesce = lastMoveId === id && s.history.length > 0;
      const hist = coalesce ? null : snapshot();
      lastMoveId = id;
      const kids = childrenOf(s.nodes);
      if (kids.has(id)) {
        // a group's card sits on its contents: dragging it carries them along
        const from = groupOrigin(id, s.nodes, kids);
        if (!from) return s;
        const dx = position.x - from.x;
        const dy = position.y - from.y;
        const inside = new Set(descendants(id, kids));
        return {
          ...hist,
          nodes: s.nodes.map((n) =>
            inside.has(n.id)
              ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
              : n,
          ),
        };
      }
      return {
        ...hist,
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      };
    }),

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
        ...snapshot(),
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
        ...snapshot(),
        edges: [...s.edges, { id: nextId('e'), source, target }],
      };
    }),

  updateEdgeLabel: (id, label) =>
    set((s) => ({
      ...snapshot(),
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, label: label.trim() || undefined } : e,
      ),
    })),

  removeEdge: (id) =>
    set((s) => ({ ...snapshot(), edges: s.edges.filter((e) => e.id !== id) })),

  toggleCollapse: (id) =>
    set((s) => ({
      ...snapshot(),
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, collapsed: !n.collapsed } : n,
      ),
    })),

  setCollapsed: (ids, collapsed) =>
    set((s) => {
      const target = new Set(ids);
      if (!s.nodes.some((n) => target.has(n.id) && n.collapsed !== collapsed)) return s;
      return {
        ...snapshot(),
        nodes: s.nodes.map((n) =>
          target.has(n.id) && n.collapsed !== collapsed ? { ...n, collapsed } : n,
        ),
      };
    }),

  nestInto: (childId, groupId) =>
    set((s) => {
      if (childId === groupId) return s;
      return {
        ...snapshot(),
        nodes: s.nodes.map((n) =>
          n.id === childId ? { ...n, parentId: groupId } : n,
        ),
      };
    }),

  groupNodes: (ids) => {
    const plan = groupPlan(get().nodes, ids);
    if (!plan) return null;
    const members = new Set(plan.members);
    if (plan.kind === 'join') {
      // a group is already selected: the rest move into it, no new card
      const into = plan.groupId;
      set((s) => ({
        ...snapshot(),
        nodes: s.nodes.map((n) => (members.has(n.id) ? { ...n, parentId: into } : n)),
        selectedNodeIds: [into],
        selectedEdgeIds: [],
      }));
      return into;
    }
    const id = nextNodeId(get().nodes);
    const nodesAfter = get().nodes.map((n) => (members.has(n.id) ? { ...n, parentId: id } : n));
    const group: DiagramNode = {
      id,
      label: '',
      shape: 'rect',
      parentId: plan.parentId,
      collapsed: false,
      // unused: a group's position is always derived from its contents
      position: groupOrigin(id, nodesAfter) ?? { x: 0, y: 0 },
    };
    set(() => ({
      ...snapshot(),
      nodes: [...nodesAfter, group],
      // the new group has nothing on screen to select: keep its members selected
      selectedNodeIds: plan.members,
      selectedEdgeIds: [],
    }));
    return id;
  },

  autoLayout: (direction = 'TB') =>
    set((s) => {
      // only lay out what's currently on screen; hidden nodes keep positions
      const hidden = computeHidden(s.nodes);
      const visible = s.nodes.filter((n) => !hidden.has(n.id));
      if (visible.length === 0) return s;
      const positions = layout(visible, s.edges, direction);
      return {
        ...snapshot(),
        nodes: s.nodes.map((n) =>
          positions[n.id] ? { ...n, position: positions[n.id] } : n,
        ),
      };
    }),

  loadMermaid: (src) => {
    const d = fromMermaid(src);
    set({ ...snapshot(), nodes: d.nodes, edges: d.edges });
  },

  syncMermaid: (src) => {
    const result = parseMermaid(src);
    if (!result.ok) return result; // hold the last good canvas

    const { nodes: curNodes, edges: curEdges } = get();
    const merged = mergeDiagram(result.diagram, { nodes: curNodes, edges: curEdges });

    // bail out when the merge changed nothing structural or textual, so moving
    // the caret or a no-op re-sync neither re-renders nor touches undo history
    if (unchanged(merged, { nodes: curNodes, edges: curEdges })) return { ok: true };

    // lay out only genuinely new nodes (absent from the current diagram), so
    // existing nodes keep the positions the merge preserved
    const curIds = new Set(curNodes.map((n) => n.id));
    const isNew = (n: DiagramNode) => !curIds.has(n.id);
    let laidOut = merged.nodes;
    if (merged.nodes.some(isNew)) {
      const positions = layout(merged.nodes, merged.edges, 'TB');
      laidOut = merged.nodes.map((n) =>
        isNew(n) && positions[n.id] ? { ...n, position: positions[n.id] } : n,
      );
    }

    // coalesce a run of live edits into one undo entry: snapshot only the
    // first edit of the run, then keep extending it until another mutation
    // (drag, delete, style, undo) ends the run via snapshot()/styleSnapshot()
    const coalesce = syncing && get().history.length > 0;
    const hist = coalesce ? null : snapshot();
    syncing = true;

    set({ ...hist, nodes: laidOut, edges: merged.edges });
    return { ok: true };
  },

  exportMermaid: () => toMermaid({ nodes: get().nodes, edges: get().edges }),

  applyRemote: (incoming) => {
    const d = normalizeDiagram(incoming);
    set((s) => {
      const pages = mergePages(s.pages, d.pages ?? []);
      const decks = mergePages(s.decks, d.decks ?? []);
      const same = JSON.stringify([s.nodes, s.edges]) === JSON.stringify([d.nodes, d.edges]);
      if (same && pages === s.pages && decks === s.decks) return s;
      return same ? { pages, decks } : { nodes: d.nodes, edges: d.edges, pages, decks };
    });
  },

  // Loading a whole new document (startup restore, file import, clear) starts
  // a fresh editing session — reset undo history rather than making it undoable.
  load: (incoming) => {
    const d = normalizeDiagram(incoming);
    lastMoveId = null;
    lastStyleKey = null;
    set({
      history: [],
      nodes: d.nodes,
      edges: d.edges,
      pages: d.pages ?? [],
      decks: d.decks ?? [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
  },
  };
});
