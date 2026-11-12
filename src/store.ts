import { layoutStructural, placeNewStructuralCards } from './structural/layout.ts';
import { equivalent } from './equivalent.ts';
import { walkEvents } from './sequence/io.ts';
import { entitiesOf, mapPageEntities } from './entities.ts';
import { emitDiagram, parseDiagram } from './mermaid/document.ts';
import { create } from 'zustand';
import type {
  Diagram,
  FlowchartDiagram,
  DiagramEdge,
  DiagramNode,
  ElementStyle,
  NodeImage,
  NodeShape,
  Page,
} from './types';
import { mergeDiagram } from './mermaid/io.ts';
import { layout, type Direction } from './layout.ts';
import { createPageFor, mergePages, newPageId, normalizeDiagram } from './pages.ts';
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

interface Snapshot { diagram: Diagram }

interface State {
  diagram: Diagram;
  setDiagram: (diagram: Diagram) => void;
  commitSource: (diagram: Diagram) => void;
  /** wiki pages; not part of undo history */
  pages: Page[];

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
  load: (d: FlowchartDiagram) => void;
  /**
   * Take on another window's saved diagram without touching undo history or
   * selection. Pages merge by `updatedAt`; a no-op when nothing differs.
   */
  applyRemote: (d: FlowchartDiagram) => void;
}

const HISTORY_LIMIT = 100;
const EMPTY_FLOWCHART = { kind: 'flowchart', nodes: [], edges: [] } satisfies Diagram;
export function flowchartOf(state: { diagram: Diagram }): FlowchartDiagram & { kind: 'flowchart' } {
  return state.diagram.kind === 'flowchart' ? state.diagram : EMPTY_FLOWCHART;
}
type FlowState = State & FlowchartDiagram;
type FlowUpdate = Partial<FlowState> | ((state: FlowState) => Partial<FlowState> | FlowState);

export const useDiagram = create<State>((set, get) => {
  const getFlow = (): FlowState => ({ ...get(), ...flowchartOf(get()) });
  const setFlow = (update: FlowUpdate) => set((state) => {
    if (state.diagram.kind !== 'flowchart') return state;
    const current = { ...state, ...state.diagram };
    const next = typeof update === 'function' ? update(current) : update;
    if (next === current) return state;
    const { nodes, edges, ...rest } = next;
    return { ...rest, diagram: { ...state.diagram, nodes: nodes ?? state.diagram.nodes, edges: edges ?? state.diagram.edges } };
  });
  /** id of the node in an in-progress drag, so a drag coalesces to one undo */
  let lastMoveId: string | null = null;

  /** key of the last style edit, so a slider/color drag coalesces to one undo */
  let lastStyleKey: string | null = null;

  /** Last committed source model; another mutation ends the undo-coalescing run. */
  let lastSourceDiagram: Diagram | null = null;

  /** Snapshot the current diagram onto the undo stack before a mutation. */
  const snapshot = (): Pick<State, 'history'> => {
    lastMoveId = null; // any snapshotted change ends a drag-coalescing run
    lastStyleKey = null; // ...and ends a style-coalescing run
    lastSourceDiagram = null; // ...and ends a live-mermaid-sync run
    const { diagram, history } = get();
    const next = [...history, { diagram }];
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
    lastSourceDiagram = null;
    if (coalesce) return null;
    const { diagram, history } = get();
    const next = [...history, { diagram }];
    if (next.length > HISTORY_LIMIT) next.shift();
    return { history: next };
  };

  const commitSource = (diagram: Diagram) => {
    const current = get().diagram;
    if (equivalent(diagram, current)) return;
    const history = lastSourceDiagram === current && get().history.length ? null : snapshot();
    lastSourceDiagram = diagram;
    const sameKind = current.kind === diagram.kind;
    set({ ...history, diagram, selectedNodeIds: sameKind ? get().selectedNodeIds : [], selectedEdgeIds: sameKind ? get().selectedEdgeIds : [] });
  };

  return {
  diagram: EMPTY_FLOWCHART,
  commitSource,
  setDiagram: (diagram) => set({ ...snapshot(), diagram, selectedNodeIds: [], selectedEdgeIds: [], highlight: null, insertion: null }),
  pages: [],
  highlight: null,
  insertion: null,
  ghostAt: null,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  history: [],

  isGroup: (id) => getFlow().nodes.some((n) => n.parentId === id),

  hiddenNodeIds: () => computeHidden(getFlow().nodes),

  canUndo: () => get().history.length > 0,

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      return {
        diagram: prev.diagram,
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
    const { insertion, ghostAt, nodes, edges } = getFlow();
    if (!insertion || !ghostAt) return null;
    const { parentId, beforeNodeId } = insertion;
    const id = nextNodeId(getFlow().nodes);
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

    setFlow({ ...snapshot(), nodes: next, edges: nextEdges, insertion: null, ghostAt: null });
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
    const id = nextNodeId(getFlow().nodes);
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
    setFlow((s) => ({ ...snapshot(), nodes: [...s.nodes, node] }));
    return id;
  },

  updateLabel: (id, label) =>
    setFlow((s) => {
      const nodes = s.nodes.map((n) => (n.id === id ? { ...n, label } : n));
      return {
        ...snapshot(),
        nodes,
      };
    }),

  openPage: (nodeId, pageId) => {
    const { diagram, pages } = get();
    const node = entitiesOf(diagram).find((n) => n.id === nodeId);
    if (!node || (pageId && !node.pageIds?.includes(pageId))) return null;
    const target = pageId ? { ...node, pageIds: [pageId] } : node;
    const page = createPageFor(target, pages);
    if (page) set({ pages: [...pages, page], diagram: mapPageEntities(diagram, (n) => n.id === nodeId && !n.pageIds?.length ? { ...n, pageIds: [page.id] } : n) });
    return page?.id ?? target.pageIds?.[0] ?? null;
  },
  createPageForNode: (nodeId) => {
    const { diagram, pages } = get();
    const node = entitiesOf(diagram).find((n) => n.id === nodeId);
    if (!node) return null;
    const id = newPageId(pages);
    set({ pages: [...pages, { id, title: node.label, body: '', updatedAt: Date.now() }], diagram: mapPageEntities(diagram, (n) => n.id === nodeId ? { ...n, pageIds: [...(n.pageIds ?? []), id] } : n) });
    return id;
  },
  createPage: (title) => {
    const id = newPageId(get().pages);
    set((s) => ({ pages: [...s.pages, { id, title, body: '', updatedAt: Date.now() }] }));
    return id;
  },
  deletePage: (id) => set((s) => {
    const drop = (diagram: Diagram) => mapPageEntities(diagram, (n) => n.pageIds?.includes(id) ? { ...n, pageIds: n.pageIds.filter((p) => p !== id) } : n);
    return { pages: s.pages.filter((p) => p.id !== id), diagram: drop(s.diagram), history: s.history.map((h) => ({ diagram: drop(h.diagram) })) };
  }),
  linkPage: (pageId, nodeId) => set((s) => {
    if (!s.pages.some((p) => p.id === pageId)) return s;
    return { diagram: mapPageEntities(s.diagram, (n) => n.id === nodeId && !n.pageIds?.includes(pageId) ? { ...n, pageIds: [...(n.pageIds ?? []), pageId] } : n) };
  }),
  unlinkPage: (pageId, nodeId) => set((s) => ({ diagram: mapPageEntities(s.diagram, (n) => n.id === nodeId && n.pageIds?.includes(pageId) ? { ...n, pageIds: n.pageIds.filter((id) => id !== pageId) } : n) })),
  makeDefaultPage: (pageId, nodeId) => set((s) => ({ diagram: mapPageEntities(s.diagram, (n) => n.id === nodeId && n.pageIds?.includes(pageId) ? { ...n, pageIds: [pageId, ...n.pageIds.filter((id) => id !== pageId)] } : n) })),
  updatePage: (id, patch) => set((s) => ({ pages: s.pages.map((p) => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p) })),

  updateNodeImage: (id, patch) =>
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => {
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
    setFlow((s) => ({
      ...snapshot(),
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, label: label.trim() || undefined } : e,
      ),
    })),

  removeEdge: (id) =>
    setFlow((s) => ({ ...snapshot(), edges: s.edges.filter((e) => e.id !== id) })),

  toggleCollapse: (id) =>
    setFlow((s) => ({
      ...snapshot(),
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, collapsed: !n.collapsed } : n,
      ),
    })),

  setCollapsed: (ids, collapsed) =>
    setFlow((s) => {
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
    setFlow((s) => {
      if (childId === groupId) return s;
      return {
        ...snapshot(),
        nodes: s.nodes.map((n) =>
          n.id === childId ? { ...n, parentId: groupId } : n,
        ),
      };
    }),

  groupNodes: (ids) => {
    const plan = groupPlan(getFlow().nodes, ids);
    if (!plan) return null;
    const members = new Set(plan.members);
    if (plan.kind === 'join') {
      // a group is already selected: the rest move into it, no new card
      const into = plan.groupId;
      setFlow((s) => ({
        ...snapshot(),
        nodes: s.nodes.map((n) => (members.has(n.id) ? { ...n, parentId: into } : n)),
        selectedNodeIds: [into],
        selectedEdgeIds: [],
      }));
      return into;
    }
    const id = nextNodeId(getFlow().nodes);
    const nodesAfter = getFlow().nodes.map((n) => (members.has(n.id) ? { ...n, parentId: id } : n));
    const group: DiagramNode = {
      id,
      label: '',
      shape: 'rect',
      parentId: plan.parentId,
      collapsed: false,
      // unused: a group's position is always derived from its contents
      position: groupOrigin(id, nodesAfter) ?? { x: 0, y: 0 },
    };
    setFlow(() => ({
      ...snapshot(),
      nodes: [...nodesAfter, group],
      // the new group has nothing on screen to select: keep its members selected
      selectedNodeIds: plan.members,
      selectedEdgeIds: [],
    }));
    return id;
  },

  autoLayout: (direction = 'TB') =>
    setFlow((s) => {
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

  loadMermaid: (src) => { get().syncMermaid(src); },
  syncMermaid: (src) => {
    const result = parseDiagram(src);
    if (!result.ok) return result;
    const current = get().diagram;
    let next = reconcileDiagram(result.diagram, current);
    if (next.kind === 'er' || next.kind === 'class') next = current.kind === next.kind && (current.kind === 'er' || current.kind === 'class') ? placeNewStructuralCards(next, current) : layoutStructural(next);
    if (next.kind === 'flowchart') {
      const old = flowchartOf(get());
      const curIds = new Set(old.nodes.map((n) => n.id));
      if (next.nodes.some((n) => !curIds.has(n.id))) {
        const positions = layout(next.nodes, next.edges, 'TB');
        next = { ...next, nodes: next.nodes.map((n) => !curIds.has(n.id) && positions[n.id] ? { ...n, position: positions[n.id] } : n) };
      }
    }
    commitSource(next);
    return { ok: true };
  },
  exportMermaid: () => emitDiagram(get().diagram).text,
  applyRemote: (incoming) => {
    const d = normalizeDiagram(incoming);
    set((s) => {
      const pages = mergePages(s.pages, d.pages ?? []);
      const diagram: Diagram = { kind: 'flowchart', nodes: d.nodes, edges: d.edges };
      if (equivalent(s.diagram, diagram) && pages === s.pages) return s;
      return { diagram, pages };
    });
  },
  load: (incoming) => {
    const d = normalizeDiagram(incoming);
    lastMoveId = null;
    lastStyleKey = null;
    set({ history: [], diagram: { kind: 'flowchart', nodes: d.nodes, edges: d.edges }, pages: d.pages ?? [], selectedNodeIds: [], selectedEdgeIds: [] });
  },
  };
});

export function reconcileDiagram(parsed: Diagram, current: Diagram): Diagram {
  if (parsed.kind !== current.kind) return parsed;
  if (parsed.kind === 'flowchart' && current.kind === 'flowchart') return { ...mergeDiagram(parsed, current), kind: 'flowchart' };
  const preserve = <T extends { id: string; position?: { x: number; y: number }; collapsed?: boolean; style?: ElementStyle; pageIds?: string[] }>(items: T[], old: T[]): T[] => items.map((item) => {
    const prev = old.find((entry) => entry.id === item.id);
    if (!prev) return item;
    const result = { ...item };
    for (const key of ['position', 'collapsed', 'style', 'pageIds'] as const) {
      if (key === 'pageIds' && 'pageIds' in item) continue;
      if (key in prev) Object.assign(result, { [key]: prev[key] });
    }
    return result;
  });
  if (parsed.kind === 'sequence' && current.kind === 'sequence') {
    const previous = new Map(walkEvents(current.events).map((e) => [e.id, e]));
    const events = (items: typeof parsed.events): typeof parsed.events => preserve(items, [...previous.values()]).map((e) => e.kind === 'fragment' ? { ...e, branches: e.branches.map((b) => ({ ...b, events: events(b.events) })) } : e);
    return { ...parsed, participants: preserve(parsed.participants, current.participants), events: events(parsed.events) };
  }
  if (parsed.kind === 'er' && current.kind === 'er') return { ...parsed, entities: preserve(parsed.entities, current.entities), relationships: preserve(parsed.relationships, current.relationships) };
  if (parsed.kind === 'class' && current.kind === 'class') return { ...parsed, classes: preserve(parsed.classes, current.classes), namespaces: preserve(parsed.namespaces, current.namespaces), relationships: preserve(parsed.relationships, current.relationships) };
  return parsed;
}
