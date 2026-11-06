import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
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
import { DiagramNode, type NodeData } from './components/DiagramNode';
import { GhostNode, type GhostData } from './components/GhostNode';
import { SheetNode, type SheetData } from './components/SheetNode';
import {
  childrenOf,
  descendants,
  foldEdges,
  frameOrigin,
  groupPlan,
  isOpenFrame,
  nextFoldLevel,
  nextUnfoldLevel,
  sheets,
} from './fold';
import { useFoldMotion } from './foldMotion';
import { GHOST_SIZE, sizeFor } from './layout';
import { DiagramEdge } from './components/DiagramEdge';
import { JoinPreview } from './components/JoinPreview';
import { MermaidPanel } from './components/MermaidPanel';
import { StylePanel } from './components/StylePanel';
import { Icon } from './components/Icon';
import { toggleTheme, useTheme } from './theme';
import { useHotkeys } from './useHotkeys';
import {
  startAutosave,
  restore,
  exportFile,
  importFile,
  clearSaved,
} from './persist';
import type { DiagramNode as DNode, NodeShape } from './types';
import { SAMPLE } from './sample';
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
function ToolButton({
  label,
  hotkey,
  active,
  onClick,
  children,
}: {
  label: string;
  hotkey?: string;
  /** a mode toggle (select / hand): show it pressed when it is the live tool */
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? 'mf-tool is-active' : 'mf-tool'}
      aria-label={label}
      aria-pressed={active}
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

  /** pointer tool: select drags a selection box, hand drags the canvas */
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const hand = tool === 'hand';

  /** shape awaiting placement, and the live cursor position for its preview */
  const [pending, setPending] = useState<NodeShape | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  /** the overflow (3-dot) menu: open state and its anchor for click-outside */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const hidden = useMemo(() => hiddenNodeIds(), [hiddenNodeIds, nodes]);
  // not drawn as a node: folded away, or an unfolded frame (just a sheet)
  const offscreen = useMemo(() => {
    const out = new Set(hidden);
    for (const n of nodes) if (isOpenFrame(n)) out.add(n.id);
    return out;
  }, [nodes, hidden]);

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
    return (n: DNode) => measured.get(n.id) ?? sizeFor(n.shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesVersion]);

  const positionOf = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = childrenOf(nodes);
    // a frame's card sits at the top-left of its contents
    const framePos = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const o = n.frame ? frameOrigin(n.id, nodes, kids) : null;
      if (o) framePos.set(n.id, o);
    }
    const base = (n: DNode) => framePos.get(n.id) ?? n.position;
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
        // a frame's card exists only while folded, so nothing may attach to it
        connectable: n.frame ? false : undefined,
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
          isGroup: isGroup(n.id),
          collapsed: n.collapsed,
          childCount: descendants(n.id, kids).length,
          style: n.style,
          frame: n.frame === true,
        },
      }));
  }, [nodes, offscreen, isGroup, positionOf, foldPhase, foldAnchor, selected]);

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
      draggable: false,
      selectable: false,
      focusable: false,
      deletable: false,
      className: foldPhase && moving.has(sh.groupId) ? `mf-sheet-${foldPhase}` : undefined,
      data: {
        groupId: sh.groupId,
        width: sh.rect.width,
        height: sh.rect.height,
        depth: sh.depth,
        // a frame has no card, so its sheet carries the (editable) title
        frame: byId.get(sh.groupId)?.frame === true,
        title: byId.get(sh.groupId)?.label ?? '',
      },
    }));
  }, [nodes, hidden, positionOf, sizeOf, foldPhase, foldAnchor]);

  // folding a group hides its subtree: drop it from the selection so a later
  // delete never removes something the user can no longer see
  useEffect(() => {
    const { selectedNodeIds, selectedEdgeIds } = useDiagram.getState();
    const kept = selectedNodeIds.filter((id) => !offscreen.has(id));
    if (kept.length !== selectedNodeIds.length) setSelection(kept, selectedEdgeIds);
  }, [offscreen, setSelection]);

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

  // edges into a folded card crease onto the card instead of vanishing
  const rfEdges: Edge[] = useMemo(() => {
    const selEdge = new Set(selectedEdges);
    const { direct, folded } = foldEdges(nodes, edges, hidden);
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
          ...leg,
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
      // an edge on an unfolded frame has no card to land on until it folds
      ...direct.filter((e) => !offscreen.has(e.source) && !offscreen.has(e.target)).map((e) => ({
        id: e.id,
        className: e.id === splitting?.id ? 'mf-edge-splitting' : undefined,
        type: 'diagram',
        selected: selEdge.has(e.id),
        source: e.source,
        target: e.target,
        label: e.label,
        animated: false,
        data: { style: e.style },
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
        data: { folded: true, count: f.count },
      })),
    ];
  }, [nodes, edges, hidden, offscreen, ghostNode, insertion, selectedEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSel: string[] | null = null;
      for (const c of changes) {
        // ignore synthetic changes for the ghost preview and paper sheets
        if ('id' in c && (c.id === GHOST_ID || c.id.startsWith(SHEET_PREFIX))) continue;
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
    [moveNode, setSelection],
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
  const arm = useCallback((shape: NodeShape) => {
    setPending(shape);
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
      addNode(pending, { x: flow.x - 60, y: flow.y - 24 });
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

  useHotkeys(
    useMemo(
      () => [
        { key: 'v', run: () => setTool('select') },
        { key: 'h', run: () => setTool('hand') },
        { key: 'r', run: () => arm('rect') },
        { key: 'o', run: () => arm('round') },
        { key: 'd', run: () => arm('diamond') },
        { key: 'c', run: () => arm('circle') },
        { key: 'l', run: () => tidy('TB') },
        { key: 'l', shift: true, run: () => tidy('LR') },
        { key: 't', run: () => toggleTheme() },
        { key: 'f', run: foldSelection },
        { key: '[', run: () => foldLevel('fold') },
        { key: ']', run: () => foldLevel('unfold') },
        { key: 'm', run: onTogglePanel },
        { key: 'z', meta: true, run: undo },
        { key: 'g', meta: true, run: groupSelection },
        { key: 'escape', run: cancelPending },
        { key: 'backspace', run: deleteSelected },
        { key: 'delete', run: deleteSelected },
      ],
      [arm, tidy, onTogglePanel, deleteSelected, undo, cancelPending, foldSelection, foldLevel, groupSelection],
    ),
  );

  return (
    <div
      className={`mf-canvas ${connecting ? 'is-connecting' : ''} ${pending ? 'is-placing' : ''} ${hand ? 'is-hand' : ''}`}
    >
      <div className="mf-toolbar">
        <span className="mf-brand">merfolk</span>
        <div className="mf-group-btns">
          <ToolButton label="Select" hotkey="V" active={!hand} onClick={() => setTool('select')}>
            <Icon name="cursor" />
          </ToolButton>
          <ToolButton label="Hand" hotkey="H  ·  hold Space" active={hand} onClick={() => setTool('hand')}>
            <Icon name="hand" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <ToolButton label="Rectangle" hotkey="R" onClick={() => arm('rect')}>
            <Icon name="rect" />
          </ToolButton>
          <ToolButton label="Rounded" hotkey="O" onClick={() => arm('round')}>
            <Icon name="round" />
          </ToolButton>
          <ToolButton label="Diamond" hotkey="D" onClick={() => arm('diamond')}>
            <Icon name="diamond" />
          </ToolButton>
          <ToolButton label="Circle" hotkey="C" onClick={() => arm('circle')}>
            <Icon name="circle" />
          </ToolButton>
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
                  toggleTheme();
                }}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
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
        // select: drag on empty canvas draws a selection box; middle/right
        // drag (or Space + drag) still pans. hand: every drag pans, nodes included
        selectionOnDrag={!hand}
        panOnDrag={hand ? true : [1, 2]}
        nodesDraggable={!hand}
        nodesConnectable={!hand}
        elementsSelectable={!hand}
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
        <Background gap={18} />
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
              className={`mf-place-ghost mf-place-${pending}`}
              style={{ left: cursor.x, top: cursor.y }}
            />
          )}
        </div>
      )}
      <StylePanel />
    </div>
  );
}

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true);
  const load = useDiagram((s) => s.load);

  // on first mount: restore the saved diagram, or seed the sample; then
  // begin autosaving every change back to localStorage
  useEffect(() => {
    if (useDiagram.getState().nodes.length === 0 && !restore()) {
      load(SAMPLE);
    }
    const stop = startAutosave();
    return stop;
  }, [load]);

  return (
    <ReactFlowProvider>
      <div className="mf-app">
        <Canvas onTogglePanel={() => setPanelOpen((v) => !v)} />
        {panelOpen ? (
          <MermaidPanel onClose={() => setPanelOpen(false)} />
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
