import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { splitEdgeFor, useDiagram } from './store';
import { DiagramNode, NodeImg, type NodeData } from './components/DiagramNode';
import { GhostNode, type GhostData } from './components/GhostNode';
import { SheetNode, type SheetData } from './components/SheetNode';
import {
  childrenOf,
  descendants,
  foldEdges,
  groupOrigin,
  groupPlan,
  isOpenGroup,
  nextFoldLevel,
  nextUnfoldLevel,
  sheets,
} from './fold';
import { useFoldMotion } from './foldMotion';
import { GHOST_SIZE, IMAGE_LABEL_SPACE, sizeFor } from './layout';
import { DiagramEdge } from './components/DiagramEdge';
import { JoinPreview } from './components/JoinPreview';
import { MermaidPanel } from './components/MermaidPanel';
import { StylePanel } from './components/StylePanel';
import { Icon } from './components/Icon';
import { ShapePicker, type Placement } from './components/ShapePicker';
import { ImagePicker } from './components/ImagePicker';
import { CatalogIcon, ShapeOutline } from './components/ShapeOutline';
import { openAppearance, useTheme, activeAppearance } from './theme';
import { foldedAncestors } from './pages.ts';
import { nameCanvasWindow, openDocs, parseRoute } from './route';
import { showDeck, showPage, useDock } from './dock';
import { isTyping, useHotkeys } from './useHotkeys';
import { copyImageNode, imagesFromClipboard, snapshotClipboard } from './clipboard';
import {
  startAutosave,
  startSync,
  restore,
  exportFile,
  importFile,
  clearSaved,
} from './persist';
import { exportGif } from './gif';
import { FLOW_LEAD, flowCycle, flowSchedule, flowSeconds } from './flow';
import { clock, seek, usePlayer } from './flowPlayer';
import type { DiagramNode as DNode } from './types';
import { SAMPLE } from './sample';
import { hasOutline, shapeDef } from './shapes';
import './App.css';

const GHOST_ID = '__mf_ghost__';
const nodeTypes: NodeTypes = { diagram: DiagramNode, ghost: GhostNode, sheet: SheetNode };

const SHEET_PREFIX = '__sheet__';

/** Measured node sizes as one string, so the canvas re-renders only on change. */
const sizeKeySelector = (s: { nodeLookup: Map<string, { type?: string; measured: { width?: number; height?: number } }> }) => {
  let key = '';
  for (const [id, n] of s.nodeLookup) {
    if (n.type === 'diagram' && n.measured.width) key += `${id}|${n.measured.width}|${n.measured.height}\n`;
  }
  return key;
};
const edgeTypes: EdgeTypes = { diagram: DiagramEdge };

/** A toolbar button whose tooltip announces its keyboard shortcut. */
/** half the rendered size of a freshly placed node (see `.mf-place-ghost`) */
function placeHalf({ shape, icon, image }: Placement): { x: number; y: number } {
  if (image) {
    const { width, height } = sizeFor(shape, undefined, image);
    return { x: width / 2, y: (height - IMAGE_LABEL_SPACE) / 2 + 8 };
  }
  if (icon) return shape === 'circle' ? { x: 45, y: 45 } : { x: 48, y: 42 };
  return shapeDef(shape).square ? { x: 45, y: 45 } : { x: 60, y: 24 };
}

function ToolButton({
  label,
  hotkey,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hotkey?: string;
  /** show the current tool pressed */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? 'mf-tool is-active' : 'mf-tool'}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={hotkey ? `${label}  ·  ${hotkey}` : label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Canvas({ onTogglePanel }: { onTogglePanel: () => void }) {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const addNode = useDiagram((s) => s.addNode);
  const moveNode = useDiagram((s) => s.moveNode);
  const removeNode = useDiagram((s) => s.removeNode);
  const removeEdge = useDiagram((s) => s.removeEdge);
  const connect = useDiagram((s) => s.connect);
  const isGroup = useDiagram((s) => s.isGroup);
  const hiddenNodeIds = useDiagram((s) => s.hiddenNodeIds);
  const insertion = useDiagram((s) => s.insertion);
  const autoLayout = useDiagram((s) => s.autoLayout);
  const undo = useDiagram((s) => s.undo);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const load = useDiagram((s) => s.load);
  const theme = useTheme();
  const selected = useDiagram((s) => s.selectedNodeIds);
  const selectedEdges = useDiagram((s) => s.selectedEdgeIds);
  const setSelection = useDiagram((s) => s.setSelection);
  const groupNodes = useDiagram((s) => s.groupNodes);
  const fileInput = useRef<HTMLInputElement>(null);

  /** shape awaiting placement, and the live cursor position for its preview */
  const [pending, setPending] = useState<Placement | null>(null);
  /** the shape + icon library popover */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** the image (URL / upload / clipboard) popover */
  const [imageOpen, setImageOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /** last pointer position over the canvas: where a pasted image lands */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** a short-lived message, e.g. why a paste was refused */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(msg);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  /** the overflow (3-dot) menu: open state and its anchor for click-outside */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /** true while a GIF is being captured + encoded (disables re-entry) */
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-importing the same file
      if (!file) return;
      try {
        await importFile(file);
        window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      } catch {
        // ignore malformed files; a real validation UI can come later
      }
    },
    [fitView],
  );

  const clearCanvas = useCallback(() => {
    clearSaved();
    load({ nodes: [], edges: [] });
  }, [load]);

  const tidy = useCallback(
    (direction: 'TB' | 'LR') => {
      autoLayout(direction);
      // let positions commit, then frame the result
      window.requestAnimationFrame(() =>
        fitView({ padding: 0.2, duration: 300 }),
      );
    },
    [autoLayout, fitView],
  );

  // Export an animated GIF of the whole diagram: frame it, drop the live
  // selection so no outline bleeds into the capture, then record the viewport.
  const saveGif = useCallback(async () => {
    if (exporting) return;
    const el = document.querySelector<HTMLElement>('.react-flow');
    if (!el) return;
    setExporting(true);
    setSelection([], []);
    fitView({ padding: 0.2, duration: 0 });
    // wait a frame for the fit + deselect to paint before capturing
    await new Promise((r) => window.requestAnimationFrame(() => r(null)));
    try {
      const { nodes: ns, edges: es } = useDiagram.getState();
      // a sequence that is playing or stepped into is recorded as one loop,
      // each frame taken at a fixed clock reading
      const { steps, speed, playing: wasPlaying, lit: wasLit } = usePlayer.getState();
      const recordFlow = steps > 0 && (wasPlaying || wasLit);
      const was = clock();
      if (recordFlow) usePlayer.getState().pause();
      const loop = flowSeconds(steps, speed);
      try {
        await exportGif(
          el,
          { nodes: ns, edges: es },
          {},
          recordFlow
            ? {
                seconds: loop,
                frame: (t) => seek(-FLOW_LEAD + (((t / loop) % 1) * flowCycle(steps))),
              }
            : undefined,
        );
      } finally {
        if (recordFlow) {
          seek(was);
          if (wasPlaying) usePlayer.getState().toggle();
        }
      }
    } catch {
      // capture/encoding is best-effort; never crash the canvas
    } finally {
      setExporting(false);
    }
  }, [exporting, fitView, setSelection]);

  const hidden = useMemo(() => hiddenNodeIds(), [hiddenNodeIds, nodes]);
  // not drawn as a node: folded away, or an unfolded group (just a sheet)
  const offscreen = useMemo(() => {
    const kids = childrenOf(nodes);
    const out = new Set(hidden);
    for (const n of nodes) if (isOpenGroup(n, kids)) out.add(n.id);
    return out;
  }, [nodes, hidden]);

  // the edges on screen: those into a folded card crease onto the card instead
  // of vanishing, and ones on an unfolded group land on its sheet, as in Mermaid
  const shown = useMemo(() => {
    const { direct, folded } = foldEdges(nodes, edges, hidden);
    // One between a group and its own contents has no sensible path, so it
    // waits until the group folds (and then folds away inside it).
    const kids = childrenOf(nodes);
    const inside = new Map<string, Set<string>>();
    const within = (g: string, id: string) => {
      if (!inside.has(g)) inside.set(g, new Set(descendants(g, kids)));
      return inside.get(g)!.has(id);
    };
    const endOf = (id: string) => (offscreen.has(id) ? SHEET_PREFIX + id : id);
    const placed = direct.flatMap((e) => {
      const s = offscreen.has(e.source);
      const t = offscreen.has(e.target);
      if ((s && within(e.source, e.target)) || (t && within(e.target, e.source))) return [];
      return [{ ...e, source: endOf(e.source), target: endOf(e.target) }];
    });
    return { direct, placed, folded, endOf };
  }, [nodes, edges, hidden, offscreen]);

  // the order the sequenced flow travels them
  const flow = useMemo(
    () => flowSchedule([...shown.placed, ...shown.folded]),
    [shown],
  );
  const setSchedule = usePlayer((s) => s.setSchedule);
  const playing = usePlayer((s) => s.playing);
  const lit = usePlayer((s) => s.lit);
  const flowSpeed = usePlayer((s) => s.speed);
  const stopFlow = usePlayer((s) => s.stop);
  const cycleSpeed = usePlayer((s) => s.cycleSpeed);
  const [flowOpen, setFlowOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flowOpen) return;
    const onDown = (e: MouseEvent) => {
      if (flowRef.current && !flowRef.current.contains(e.target as globalThis.Node)) setFlowOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [flowOpen]);
  const togglePlay = usePlayer((s) => s.toggle);
  const stepFlow = usePlayer((s) => s.stepBy);
  const noFlow = flow.steps === 0;
  useEffect(() => setSchedule(flow.sig, flow.steps), [flow.sig, flow.steps, setSchedule]);

  // fold choreography: nodes mid-fold are drawn on the card they fold into
  const foldPhase = useFoldMotion((s) => s.phase);
  const foldAnchor = useFoldMotion((s) => s.anchor);
  const fold = useFoldMotion((s) => s.fold);
  const unfold = useFoldMotion((s) => s.unfold);

  // Measured node sizes, kept across renders. The canvas is controlled, so
  // React Flow only remembers a size if we hand it back on the node; without
  // this, rebuilding nodes would drop sizes and the sheets would never settle.
  const sizeCache = useRef(new Map<string, { width: number; height: number }>());
  const sizeKey = useStore(sizeKeySelector);
  const sizesVersion = useMemo(() => {
    for (const line of sizeKey.split('\n')) {
      const [id, w, h] = line.split('|');
      if (id) sizeCache.current.set(id, { width: Number(w), height: Number(h) });
    }
    let v = '';
    for (const [id, z] of sizeCache.current) v += `${id}|${z.width}|${z.height}\n`;
    return v;
  }, [sizeKey]);
  const sizeOf = useMemo(() => {
    const measured = new Map(sizeCache.current);
    return (n: DNode) => measured.get(n.id) ?? sizeFor(n.shape, n.icon, n.image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesVersion]);

  const positionOf = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = childrenOf(nodes);
    // a group's card (shown once folded) sits at the top-left of its contents
    const groupPos = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const o = kids.has(n.id) ? groupOrigin(n.id, nodes, kids) : null;
      if (o) groupPos.set(n.id, o);
    }
    const base = (n: DNode) => groupPos.get(n.id) ?? n.position;
    return (n: DNode) => {
      const into = foldPhase && foldPhase !== 'unfolding' ? foldAnchor.get(n.id) : undefined;
      const card = into ? byId.get(into) : undefined;
      if (!card) return base(n);
      // center the node on the card it is tucked under
      const a = sizeOf(card);
      const b = sizeOf(n);
      const at = base(card);
      return {
        x: at.x + (a.width - b.width) / 2,
        y: at.y + (a.height - b.height) / 2,
      };
    };
  }, [nodes, foldPhase, foldAnchor, sizeOf]);

  const rfNodes: Node<NodeData>[] = useMemo(() => {
    const kids = childrenOf(nodes);
    const motionClass =
      foldPhase === 'folding' ? 'mf-folding' : foldPhase === 'unfold-start' ? 'mf-unfold-start' : 'mf-unfolding';
    const cards = new Set(foldAnchor.values());
    // selection is owned by the store: passing it down keeps React Flow in step
    // when code selects a node (e.g. one just inserted), so a pane click still
    // deselects it
    const sel = new Set(selected);
    return nodes
      .filter((n) => !offscreen.has(n.id))
      .map((n) => ({
        id: n.id,
        selected: sel.has(n.id),
        type: 'diagram',
        position: positionOf(n),
        measured: sizeCache.current.get(n.id),
        className: foldAnchor.has(n.id)
          ? motionClass
          : foldPhase && cards.has(n.id)
            ? 'mf-fold-card'
            : undefined,
        data: {
          label: n.label,
          shape: n.shape,
          icon: n.icon,
          image: n.image,
          isGroup: isGroup(n.id),
          collapsed: n.collapsed,
          childCount: descendants(n.id, kids).length,
          style: n.style,
          flowAt: flow.nodeAt.get(n.id),
        },
      }));
  }, [nodes, offscreen, isGroup, positionOf, foldPhase, foldAnchor, selected, flow]);

  // a sheet of paper behind every unfolded group, under edges and nodes
  const sheetNodes: Node<SheetData>[] = useMemo(() => {
    const moving = new Set([...foldAnchor.keys(), ...foldAnchor.values()]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return sheets(nodes, hidden, positionOf, sizeOf).map((sh) => ({
      id: SHEET_PREFIX + sh.groupId,
      type: 'sheet',
      position: { x: sh.rect.x, y: sh.rect.y },
      // explicit size: sheets have no handles, so React Flow never re-measures them
      width: sh.rect.width,
      height: sh.rect.height,
      zIndex: -10 + sh.depth,
      draggable: true,
      selectable: false,
      focusable: false,
      deletable: false,
      className: foldPhase && moving.has(sh.groupId) ? `mf-sheet-${foldPhase}` : undefined,
      data: {
        groupId: sh.groupId,
        width: sh.rect.width,
        height: sh.rect.height,
        depth: sh.depth,
        // a group has no card while unfolded, so its sheet carries the title
        title: byId.get(sh.groupId)?.label ?? '',
      },
    }));
  }, [nodes, hidden, positionOf, sizeOf, foldPhase, foldAnchor]);

  // folding a group hides its subtree: drop it from the selection so a later
  // delete never removes something the user can no longer see
  useEffect(() => {
    const { selectedNodeIds, selectedEdgeIds } = useDiagram.getState();
    const kept = selectedNodeIds.filter((id) => !hidden.has(id));
    if (kept.length !== selectedNodeIds.length) setSelection(kept, selectedEdgeIds);
  }, [hidden, setSelection]);

  // A non-interactive ghost node mirrors the Mermaid editor's insertion gap.
  // It sits midway between the nodes declared just above and just below the
  // gap; at either end of the document it sits beyond the single neighbour.
  // It is then nudged off any visible node so it never hides one.
  const ghostNode: Node<GhostData> | null = useMemo(() => {
    if (!insertion) return null;
    const visible = nodes.filter((n) => !offscreen.has(n.id));
    const find = (id: string | null) => (id == null ? undefined : visible.find((n) => n.id === id));
    const prev = find(insertion.afterNodeId);
    const next = find(insertion.beforeNodeId);

    const g = GHOST_SIZE;
    const GAP = 40;
    const rect = (n: DNode) => ({ ...positionOf(n), ...sizeOf(n) });
    const center = (n: DNode) => {
      const r = rect(n);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };

    let c: { x: number; y: number };
    if (prev && next) {
      const a = center(prev);
      const b = center(next);
      c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (prev) {
      const r = rect(prev);
      c = { x: r.x + r.width / 2, y: r.y + r.height + GAP + g.height / 2 };
    } else if (next) {
      const r = rect(next);
      c = { x: r.x + r.width / 2, y: r.y - GAP - g.height / 2 };
    } else {
      c = { x: 40 + g.width / 2, y: 40 + g.height / 2 };
    }
    let pos = { x: c.x - g.width / 2, y: c.y - g.height / 2 };

    // step downward until the ghost clears every visible node (sheets are
    // separate nodes, so the ghost may still sit on a group's sheet)
    const solid = visible.map(rect);
    const PAD = 12;
    const hits = (p: { x: number; y: number }) =>
      solid.some(
        (r) =>
          p.x < r.x + r.width + PAD &&
          p.x + g.width + PAD > r.x &&
          p.y < r.y + r.height + PAD &&
          p.y + g.height + PAD > r.y,
      );
    for (let i = 0; i < 24 && hits(pos); i++) pos = { x: pos.x, y: pos.y + g.height / 2 };

    return {
      id: GHOST_ID,
      type: 'ghost',
      position: pos,
      // paint above nodes and edge labels so the preview is never covered
      zIndex: 1000,
      draggable: false,
      selectable: false,
      focusable: false,
      deletable: false,
      data: { shape: 'rect' },
    };
  }, [insertion, nodes, offscreen, positionOf, sizeOf]);

  // share where the ghost is drawn so clicking the editor gap commits a node
  // at exactly the previewed spot
  const setGhostAt = useDiagram((s) => s.setGhostAt);
  useEffect(() => setGhostAt(ghostNode ? ghostNode.position : null), [ghostNode, setGhostAt]);

  const rfNodesWithGhost = useMemo(
    () => [
      ...(sheetNodes as Node[]),
      ...(rfNodes as Node[]),
      ...(ghostNode ? [ghostNode as Node] : []),
    ],
    [sheetNodes, rfNodes, ghostNode],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const selEdge = new Set(selectedEdges);
    const { direct, placed, folded, endOf } = shown;
    // while previewing an insertion that splits A → B, draw A → ghost → B as
    // dashed preview legs in place of the edge it would replace
    const split = ghostNode ? splitEdgeFor(edges, insertion) : undefined;
    const splitting = split && direct.some((e) => e.id === split.id) ? split : undefined;
    const previewLegs: Edge[] = splitting
      ? [
          { source: splitting.source, target: GHOST_ID },
          { source: GHOST_ID, target: splitting.target },
        ].map((leg, i) => ({
          id: `__mf_ghost_edge_${i}__`,
          type: 'diagram',
          source: endOf(leg.source),
          target: endOf(leg.target),
          className: 'mf-ghost-edge',
          selectable: false,
          focusable: false,
          deletable: false,
          data: { style: splitting.style, preview: true },
        }))
      : [];
    return [
      ...previewLegs,
      // the split edge stays mounted (faded) so its label and insert button
      // keep the pointer, otherwise the preview would end the hover it came from
      ...placed.map((e) => ({
        id: e.id,
        className: e.id === splitting?.id ? 'mf-edge-splitting' : undefined,
        type: 'diagram',
        selected: selEdge.has(e.id),
        source: e.source,
        target: e.target,
        label: e.label,
        animated: false,
        data: { style: e.style, flowStep: flow.edgeStep.get(e.id) },
      })),
      ...folded.map((f) => ({
        id: f.id,
        type: 'diagram',
        source: f.source,
        target: f.target,
        label: f.label,
        selectable: false,
        focusable: false,
        deletable: false,
        data: { folded: true, count: f.count, flowStep: flow.edgeStep.get(f.id) },
      })),
    ];
  }, [shown, flow, edges, ghostNode, insertion, selectedEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSel: string[] | null = null;
      for (const c of changes) {
        if ('id' in c && c.id === GHOST_ID) continue;
        if ('id' in c && c.id.startsWith(SHEET_PREFIX)) {
          if (c.type === 'position' && c.position) {
            const sheet = sheetNodes.find((n) => n.id === c.id);
            const current = useDiagram.getState().nodes;
            const groupId = c.id.slice(SHEET_PREFIX.length);
            const origin = groupOrigin(groupId, current, childrenOf(current));
            if (sheet && origin) {
              moveNode(groupId, {
                x: origin.x + c.position.x - sheet.position.x,
                y: origin.y + c.position.y - sheet.position.y,
              });
            }
          }
          continue;
        }
        if (c.type === 'position' && c.position) {
          moveNode(c.id, c.position);
        } else if (c.type === 'select') {
          const base: string[] = nextSel ?? useDiagram.getState().selectedNodeIds;
          nextSel = c.selected
            ? [...new Set([...base, c.id])]
            : base.filter((id: string) => id !== c.id);
        }
      }
      if (nextSel) {
        setSelection(nextSel, useDiagram.getState().selectedEdgeIds);
      }
    },
    [moveNode, setSelection, sheetNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let nextSel: string[] | null = null;
      for (const c of changes) {
        if (c.type === 'select') {
          const base: string[] = nextSel ?? useDiagram.getState().selectedEdgeIds;
          nextSel = c.selected
            ? [...new Set([...base, c.id])]
            : base.filter((id: string) => id !== c.id);
        }
      }
      if (nextSel) {
        setSelection(useDiagram.getState().selectedNodeIds, nextSel);
      }
    },
    [setSelection],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target);
    },
    [connect],
  );

  const [connecting, setConnecting] = useState(false);

  // Arm a shape for placement: the next left-click on the canvas drops it at
  // the cursor. A preview ghost follows the pointer until then.
  const arm = useCallback((p: Placement) => {
    setPending(p.image ? { shape: p.shape, image: p.image } : p.icon ? { shape: p.shape, icon: p.icon } : { shape: p.shape });
    setCursor(null);
  }, []);

  const cancelPending = useCallback(() => {
    setPending(null);
    setCursor(null);
  }, []);

  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!pending) return;
      setCursor({ x: e.clientX, y: e.clientY });
    },
    [pending],
  );

  // Place the armed shape at the clicked point (centered on the cursor).
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (!pending) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const half = placeHalf(pending);
      addNode(pending.shape, { x: flow.x - half.x, y: flow.y - half.y }, pending);
      cancelPending();
    },
    [pending, screenToFlowPosition, addNode, cancelPending],
  );

  const deleteSelected = useCallback(() => {
    selected.forEach((id) => removeNode(id));
    selectedEdges.forEach((id) => removeEdge(id));
    setSelection([], []);
  }, [selected, selectedEdges, removeNode, removeEdge, setSelection]);

  // F: fold the selected groups (or the sheet a selected node sits on);
  // unfold them instead when they are all already folded
  const foldSelection = useCallback(() => {
    const { nodes: all, selectedNodeIds } = useDiagram.getState();
    const kids = childrenOf(all);
    const byId = new Map(all.map((n) => [n.id, n]));
    const targets = new Set<string>();
    for (const id of selectedNodeIds) {
      const n = byId.get(id);
      if (!n) continue;
      if (kids.has(id)) targets.add(id);
      else if (n.parentId) targets.add(n.parentId);
    }
    const ids = [...targets];
    if (ids.length === 0) return;
    if (ids.every((id) => byId.get(id)?.collapsed)) unfold(ids);
    else fold(ids.filter((id) => !byId.get(id)?.collapsed));
  }, [fold, unfold]);

  // what ⌘G would do with the current selection: wrap it in a new group,
  // move it into the one group already selected, or nothing (no bar)
  const groupAction = useMemo(() => groupPlan(nodes, selected)?.kind ?? null, [nodes, selected]);

  // ⌘G: group the selection into an untitled frame (no new card on screen),
  // or into the one group already selected
  const groupSelection = useCallback(() => {
    groupNodes(useDiagram.getState().selectedNodeIds);
  }, [groupNodes]);

  // [ / ]: fold or unfold the whole diagram one crease at a time, then frame it
  const foldLevel = useCallback(
    (dir: 'fold' | 'unfold') => {
      const all = useDiagram.getState().nodes;
      const ids = dir === 'fold' ? nextFoldLevel(all) : nextUnfoldLevel(all);
      if (ids.length === 0) return;
      if (dir === 'fold') fold(ids);
      else unfold(ids);
      window.setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 280);
    },
    [fold, unfold, fitView],
  );

  // W: drill down into the selected node's page
  const openSelectedPage = useCallback(() => {
    const id = useDiagram.getState().selectedNodeIds[0];
    if (id) showPage(id);
  }, []);

  // K: the Slides tab, on the selected node's deck (or every deck when nothing is selected)
  const openSelectedDeck = useCallback(() => {
    const id = useDiagram.getState().selectedNodeIds[0];
    if (id) showDeck(id);
    else useDock.setState({ open: true, view: 'slides' });
  }, []);

  // E: flip the page tab between Markdown and Preview
  const toggleMode = useCallback(() => {
    const { view, mode, setMode } = useDock.getState();
    if (view === 'page') setMode(mode === 'read' ? 'edit' : 'read');
  }, []);

  // #/node/<id> (from the wiki): unfold what hides the node, select it, frame it
  useEffect(() => {
    const goto = () => {
      const route = parseRoute(window.location.hash);
      if (route.kind !== 'node') return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const { nodes: all } = useDiagram.getState();
      const node = all.find((n) => n.id === route.id);
      if (!node) return;
      const closed = foldedAncestors(all, node.id);
      if (closed.length) unfold(closed);
      setSelection([node.id], []);
      const sheet = !node.collapsed && all.some((n) => n.parentId === node.id);
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(
        () =>
          fitView({
            nodes: [{ id: sheet ? `${SHEET_PREFIX}${node.id}` : node.id }],
            padding: 0.6,
            maxZoom: 1.2,
            duration: calm ? 0 : 400,
          }),
        closed.length ? 320 : 60,
      );
    };
    // after App's mount effect has restored the saved diagram
    const first = window.setTimeout(goto, 0);
    window.addEventListener('hashchange', goto);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener('hashchange', goto);
    };
  }, [unfold, setSelection, fitView]);

  useHotkeys(
    useMemo(
      () => [
        { key: 'v', run: cancelPending },
        { key: 'r', run: () => arm({ shape: 'rect' }) },
        { key: 'o', run: () => arm({ shape: 'round' }) },
        { key: 'd', run: () => arm({ shape: 'diamond' }) },
        { key: 'c', run: () => arm({ shape: 'circle' }) },
        { key: 's', run: () => (setImageOpen(false), setPickerOpen((v) => !v)) },
        { key: 'i', run: () => (setPickerOpen(false), setImageOpen((v) => !v)) },
        { key: 'l', run: () => tidy('TB') },
        { key: 'l', shift: true, run: () => tidy('LR') },
        { key: 't', run: () => openAppearance() },
        { key: 'f', run: foldSelection },
        { key: 'w', run: openSelectedPage },
        { key: 'k', run: openSelectedDeck },
        { key: 'e', run: toggleMode },
        { key: '[', run: () => foldLevel('fold') },
        { key: ']', run: () => foldLevel('unfold') },
        { key: 'p', run: togglePlay },
        { key: ',', run: () => stepFlow(-1) },
        { key: '.', run: () => stepFlow(1) },
        { key: 'm', run: onTogglePanel },
        { key: 'z', meta: true, run: undo },
        { key: 'g', meta: true, run: groupSelection },
        { key: 'escape', run: cancelPending },
        { key: 'backspace', run: deleteSelected },
        { key: 'delete', run: deleteSelected },
      ],
      [arm, tidy, onTogglePanel, deleteSelected, undo, cancelPending, foldSelection, foldLevel, groupSelection, openSelectedPage, openSelectedDeck, toggleMode, togglePlay, stepFlow],
    ),
  );

  // Ctrl/Cmd+C on one selected image node copies it; Ctrl/Cmd+V of any picture
  // (file, copied web image, image URL, or a copied node) drops an image node
  // at the pointer. Text fields keep their own native copy/paste.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement) || window.getSelection()?.toString()) return;
      const { nodes: all, selectedNodeIds, selectedEdgeIds } = useDiagram.getState();
      if (selectedNodeIds.length !== 1 || selectedEdgeIds.length > 0) return;
      const node = all.find((n) => n.id === selectedNodeIds[0]);
      if (node?.image) copyImageNode(e, node.image, node.label);
    };
    let lastPaste: { x: number; y: number; n: number } | null = null;
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement) || !e.clipboardData) return;
      const clip = snapshotClipboard(e.clipboardData);
      if (!clip) return;
      e.preventDefault();
      // at the pointer when it is over the canvas, else the middle of the view
      const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
      const p = pointer.current;
      const inside = p && pane && p.x >= pane.left && p.x <= pane.right && p.y >= pane.top && p.y <= pane.bottom;
      const screen = inside ? p : pane ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 } : { x: 0, y: 0 };
      const at = screenToFlowPosition(screen);
      // pasting again at the same spot cascades instead of stacking exactly
      const n = lastPaste && Math.hypot(lastPaste.x - at.x, lastPaste.y - at.y) < 1 ? lastPaste.n + 1 : 0;
      lastPaste = { ...at, n };
      imagesFromClipboard(clip)
        .then((items) => {
          if (items.length === 0) return;
          const ids = items.map(({ image, label }, i) => {
            const half = placeHalf({ shape: 'rect', image });
            const off = (n + i) * 24;
            return addNode('rect', { x: at.x - half.x + off, y: at.y - half.y + off }, { image, label });
          });
          setSelection(ids, []);
        })
        .catch((err: Error) => flash(`Couldn't paste the image: ${err.message}`));
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [addNode, screenToFlowPosition, setSelection, flash]);

  return (
    <div
      className={`mf-canvas ${connecting ? 'is-connecting' : ''} ${pending ? 'is-placing' : ''}`}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <div className="mf-toolbar">
        <span className="mf-brand">merfolk</span>
        <div className="mf-group-btns">
          <ToolButton label="Rectangle" hotkey="R" onClick={() => arm({ shape: 'rect' })}>
            <Icon name="rect" />
          </ToolButton>
          <ToolButton label="Rounded" hotkey="O" onClick={() => arm({ shape: 'round' })}>
            <Icon name="round" />
          </ToolButton>
          <ToolButton label="Diamond" hotkey="D" onClick={() => arm({ shape: 'diamond' })}>
            <Icon name="diamond" />
          </ToolButton>
          <ToolButton label="Circle" hotkey="C" onClick={() => arm({ shape: 'circle' })}>
            <Icon name="circle" />
          </ToolButton>
          <ShapePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={arm} />
          <ImagePicker open={imageOpen} onOpenChange={setImageOpen} onPick={arm} />
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <ToolButton label="Tidy down" hotkey="L" onClick={() => tidy('TB')}>
            <Icon name="tidy-down" />
          </ToolButton>
          <ToolButton label="Tidy right" hotkey="⇧L" onClick={() => tidy('LR')}>
            <Icon name="tidy-right" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <ToolButton label="Fold a level" hotkey="[" onClick={() => foldLevel('fold')}>
            <Icon name="fold" />
          </ToolButton>
          <ToolButton label="Unfold a level" hotkey="]" onClick={() => foldLevel('unfold')}>
            <Icon name="unfold" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <div className="mf-menu-wrap" ref={flowRef}>
            <ToolButton
              label={playing ? 'Stop flow' : 'Play flow'}
              hotkey="P"
              active={playing}
              disabled={noFlow}
              onClick={() => {
                if (playing) {
                  stopFlow();
                  setFlowOpen(false);
                } else {
                  togglePlay();
                  setFlowOpen(true);
                }
              }}
            >
              <Icon name={playing ? 'stop' : 'play'} />
            </ToolButton>
            {flowOpen && (
              <div className="mf-menu mf-flow-menu" role="toolbar" aria-label="Flow controls">
                <ToolButton label="Previous step" hotkey="," disabled={noFlow || !lit} onClick={() => stepFlow(-1)}>
                  <Icon name="step-back" />
                </ToolButton>
                <ToolButton
                  label={playing ? 'Pause flow' : 'Stop flow'}
                  disabled={!playing && !lit}
                  onClick={() => {
                    if (playing) togglePlay();
                    else {
                      stopFlow();
                      setFlowOpen(false);
                    }
                  }}
                >
                  <Icon name={playing ? 'pause' : 'stop'} />
                </ToolButton>
                <ToolButton label="Next step" hotkey="." disabled={noFlow} onClick={() => stepFlow(1)}>
                  <Icon name="step-fwd" />
                </ToolButton>
                <ToolButton label="Flow speed" disabled={noFlow} onClick={cycleSpeed}>
                  <span className="mf-speed">{flowSpeed === 0.5 ? '½' : flowSpeed}×</span>
                </ToolButton>
              </div>
            )}
          </div>
        </div>
        <span className="mf-sep" />
        <div className="mf-menu-wrap" ref={menuRef}>
          <ToolButton label="More actions" onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="more" />
          </ToolButton>
          {menuOpen && (
            <div className="mf-menu" role="menu">
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  exportFile();
                }}
              >
                <Icon name="export" />
                <span>Export file</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                disabled={exporting}
                onClick={() => {
                  setMenuOpen(false);
                  saveGif();
                }}
              >
                <Icon name="film" />
                <span>{exporting ? 'Exporting GIF…' : 'Export GIF'}</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileInput.current?.click();
                }}
              >
                <Icon name="import" />
                <span>Import file</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  menuRef.current?.querySelector('button')?.focus();
                  openAppearance();
                }}
              >
                <Icon name={'shapes'} />
                <span>Appearance</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openDocs();
                }}
              >
                <Icon name="book" />
                <span>Docs</span>
              </button>
              <span className="mf-menu-sep" />
              <button
                className="mf-menu-item mf-menu-danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  clearCanvas();
                }}
              >
                <Icon name="trash" />
                <span>Clear canvas</span>
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onPickFile}
        />
      </div>
      <ReactFlow
        nodes={rfNodesWithGhost}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        connectionLineComponent={JoinPreview}
        colorMode={theme}
        deleteKeyCode={null}
        // Drag on empty canvas selects; middle/right drag or Space + drag pans.
        selectionOnDrag
        panOnDrag={[1, 2]}
        fitView
      >
        <NodeToolbar
          nodeId={selected}
          isVisible={groupAction !== null}
          position={Position.Top}
          offset={12}
        >
          <div className="mf-selbar">
            <button
              className="mf-selbar-btn"
              title={`${groupAction === 'join' ? 'Add to group' : 'Group'}  ·  ⌘G`}
              onClick={groupSelection}
            >
              <Icon name="group" />
              <span>{groupAction === 'join' ? 'Add to group' : 'Group'}</span>
            </button>
          </div>
        </NodeToolbar>
        <Background gap={activeAppearance().texture === 'grid' ? 24 : 18} variant={activeAppearance().texture === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {pending && (
        <div
          className="mf-place-overlay"
          onMouseMove={onPaneMouseMove}
          onClick={onPaneClick}
          onContextMenu={(e) => {
            e.preventDefault();
            cancelPending();
          }}
        >
          {cursor && (
            <div
              className={[
                'mf-place-ghost',
                `mf-place-${pending.image ? 'image' : pending.icon ? 'icon' : pending.shape}`,
                !pending.icon && !pending.image && hasOutline(pending.shape) ? 'is-outline' : '',
              ].join(' ')}
              style={{ left: cursor.x, top: cursor.y }}
            >
              {pending.image ? (
                <NodeImg image={pending.image} />
              ) : pending.icon ? (
                <CatalogIcon id={pending.icon} />
              ) : (
                hasOutline(pending.shape) && <ShapeOutline shape={pending.shape} style={{ sloppiness: 0 }} />
              )}
            </div>
          )}
        </div>
      )}
      <StylePanel />
      {notice && (
        <div className="mf-notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const panelOpen = useDock((s) => s.open);
  const setPanelOpen = useDock((s) => s.setOpen);
  const [panelWidth, setPanelWidth] = useState(360);
  const load = useDiagram((s) => s.load);

  // on first mount: restore the saved diagram, or seed the sample; then
  // begin autosaving every change back to localStorage
  useEffect(() => {
    if (useDiagram.getState().nodes.length === 0 && !restore()) {
      load(SAMPLE);
    }
    nameCanvasWindow();
    const stops = [startAutosave(), startSync()];
    return () => stops.forEach((stop) => stop());
  }, [load]);

  return (
    <ReactFlowProvider>
      <div className="mf-app">
        <Canvas onTogglePanel={() => setPanelOpen(!useDock.getState().open)} />
        {panelOpen ? (
          <MermaidPanel
            width={panelWidth}
            onWidthChange={setPanelWidth}
            onClose={() => setPanelOpen(false)}
          />
        ) : (
          <button
            className="mf-reopen"
            title="Mermaid  ·  M"
            aria-label="Open Mermaid panel"
            onClick={() => setPanelOpen(true)}
          >
            <Icon name="code" />
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}
