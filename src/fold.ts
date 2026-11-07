// Origami folding: pure geometry + graph logic behind fold/unfold.
//
// A group is a sheet of paper. Expanded, its subtree sits on a visible sheet;
// folded, the subtree is tucked under the group card and every edge that
// pointed into it creases onto the card instead (so folding never loses
// context). Nothing here touches React or the store, so it is easy to test.

import type { DiagramEdge, DiagramNode } from './types';

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** parentId -> children, built once per call site */
export function childrenOf(nodes: DiagramNode[]): Map<string | null, DiagramNode[]> {
  const m = new Map<string | null, DiagramNode[]>();
  for (const n of nodes) {
    const list = m.get(n.parentId);
    if (list) list.push(n);
    else m.set(n.parentId, [n]);
  }
  return m;
}

/** Every descendant id of `id` (not including `id`). */
export function descendants(
  id: string,
  kids: Map<string | null, DiagramNode[]>,
): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const k of kids.get(p) ?? []) {
      out.push(k.id);
      walk(k.id);
    }
  };
  walk(id);
  return out;
}

/**
 * Where a group sits: the top-left of everything inside it. A group has no
 * card while unfolded, so its own stored position is never used.
 */
export function groupOrigin(
  id: string,
  nodes: DiagramNode[],
  kids: Map<string | null, DiagramNode[]> = childrenOf(nodes),
): { x: number; y: number } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x = Infinity;
  let y = Infinity;
  for (const d of descendants(id, kids)) {
    const n = byId.get(d);
    if (!n || kids.has(d)) continue; // a nested group's own position is meaningless
    x = Math.min(x, n.position.x);
    y = Math.min(y, n.position.y);
  }
  return Number.isFinite(x) ? { x, y } : null;
}

/** An unfolded group: drawn as a titled sheet, with no card on screen. */
export const isOpenGroup = (n: DiagramNode, kids: Map<string | null, DiagramNode[]>) =>
  !n.collapsed && kids.has(n.id);

/** Ids hidden because some ancestor is folded. */
export function hiddenIds(nodes: DiagramNode[]): Set<string> {
  const kids = childrenOf(nodes);
  const hidden = new Set<string>();
  for (const n of nodes) {
    if (n.collapsed) for (const d of descendants(n.id, kids)) hidden.add(d);
  }
  return hidden;
}

/**
 * Map a node to what is actually on screen: itself if visible, otherwise its
 * nearest visible ancestor (the folded card it is tucked under).
 */
function visibleProxy(
  id: string,
  byId: Map<string, DiagramNode>,
  hidden: Set<string>,
): string | null {
  let cur = byId.get(id);
  while (cur && hidden.has(cur.id)) {
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return cur?.id ?? null;
}

export interface FoldedEdge {
  id: string;
  source: string;
  target: string;
  /** the real edges this crease stands for */
  count: number;
  label?: string;
}

/**
 * Split edges into those drawn as-is and "creases": edges with a hidden end,
 * rerouted to the folded card and merged when several share the same ends.
 * Edges folded entirely inside one card disappear.
 */
export function foldEdges(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  hidden: Set<string>,
): { direct: DiagramEdge[]; folded: FoldedEdge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const direct: DiagramEdge[] = [];
  const merged = new Map<string, FoldedEdge & { labels: Set<string> }>();
  for (const e of edges) {
    if (!hidden.has(e.source) && !hidden.has(e.target)) {
      direct.push(e);
      continue;
    }
    const s = visibleProxy(e.source, byId, hidden);
    const t = visibleProxy(e.target, byId, hidden);
    if (!s || !t || s === t) continue;
    const key = `${s}\u0000${t}`;
    const m = merged.get(key);
    if (m) {
      m.count++;
      if (e.label) m.labels.add(e.label);
    } else {
      merged.set(key, {
        id: `fold:${s}->${t}`,
        source: s,
        target: t,
        count: 1,
        labels: new Set(e.label ? [e.label] : []),
      });
    }
  }
  // a direct edge already joining the same pair makes a crease redundant
  const directPairs = new Set(direct.map((e) => `${e.source}\u0000${e.target}`));
  const folded: FoldedEdge[] = [];
  for (const [key, { labels, ...f }] of merged) {
    if (directPairs.has(key)) continue;
    folded.push(labels.size === 1 && f.count === 1 ? { ...f, label: [...labels][0] } : f);
  }
  return { direct, folded };
}

/**
 * Groups to fold for one "fold a level" step: the innermost unfolded groups
 * on screen, so repeated presses fold the diagram from the leaves inward.
 */
export function nextFoldLevel(nodes: DiagramNode[]): string[] {
  const kids = childrenOf(nodes);
  const hidden = hiddenIds(nodes);
  const isOpenGroup = (n: DiagramNode) =>
    !n.collapsed && !hidden.has(n.id) && (kids.get(n.id)?.length ?? 0) > 0;
  const open = nodes.filter(isOpenGroup);
  const openIds = new Set(open.map((n) => n.id));
  return open
    .filter((g) => !descendants(g.id, kids).some((d) => openIds.has(d)))
    .map((g) => g.id);
}

/** Groups to unfold for one "unfold a level" step: every folded card on screen. */
export function nextUnfoldLevel(nodes: DiagramNode[]): string[] {
  const kids = childrenOf(nodes);
  const hidden = hiddenIds(nodes);
  return nodes
    .filter((n) => n.collapsed && !hidden.has(n.id) && (kids.get(n.id)?.length ?? 0) > 0)
    .map((n) => n.id);
}

export interface Sheet {
  /** the group this sheet belongs to */
  groupId: string;
  rect: Rect;
  /** nesting depth, 0 for a top-level group */
  depth: number;
}

export const SHEET_PAD = 22;
/** extra room above a sheet's contents for its group's title */
export const SHEET_TITLE = 22;

/**
 * One paper sheet per unfolded, on-screen group, sized to wrap its visible
 * children and any nested sheets, with a band on top for the group's title.
 * Ordered outermost first so nested sheets stack on top.
 */
export function sheets(
  nodes: DiagramNode[],
  hidden: Set<string>,
  positionOf: (n: DiagramNode) => { x: number; y: number },
  sizeOf: (n: DiagramNode) => Size,
): Sheet[] {
  const kids = childrenOf(nodes);
  const out: Sheet[] = [];
  const rectOf = (n: DiagramNode): Rect => ({ ...positionOf(n), ...sizeOf(n) });

  const build = (g: DiagramNode, depth: number): Rect => {
    const children = (kids.get(g.id) ?? []).filter((c) => !hidden.has(c.id));
    if (g.collapsed || hidden.has(g.id) || children.length === 0) return rectOf(g);
    // an open group has no card: its sheet wraps its children, plus a title band
    const index = out.length;
    out.push({ groupId: g.id, rect: rectOf(g), depth }); // placeholder, keeps outer sheets first
    const box = children.map((c) => build(c, depth + 1)).reduce(union);
    const padded = pad(box, SHEET_PAD);
    const rect = { ...padded, y: padded.y - SHEET_TITLE, height: padded.height + SHEET_TITLE };
    out[index] = { groupId: g.id, rect, depth };
    return rect;
  };

  for (const root of kids.get(null) ?? []) build(root, 0);
  return out;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function pad(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p };
}

export type GroupPlan =
  /** wrap `members` in a new group card nested under `parentId` */
  | { kind: 'new'; members: string[]; parentId: string | null }
  /** the selection already holds a group: move the other `members` into it */
  | { kind: 'join'; groupId: string; members: string[] };

/**
 * Plan grouping a selection. A selected group brings its subtree along, so
 * only the outermost selected nodes count. With no group among them, they are
 * wrapped in a new group under the deepest group they already share. With
 * exactly one, the rest join that group rather than spawning a new card. With
 * nothing to move, several groups and no clear target, or a selection that is
 * exactly one group's contents (already grouped), there is no plan.
 */
export function groupPlan(nodes: DiagramNode[], ids: string[]): GroupPlan | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = childrenOf(nodes);
  const picked = new Set(ids.filter((id) => byId.has(id)));
  /** ancestors of a node, nearest first (not including the node) */
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let p = byId.get(id)?.parentId ?? null; p; p = byId.get(p)?.parentId ?? null) {
      out.push(p);
    }
    return out;
  };
  const members = [...picked].filter((id) => !ancestors(id).some((a) => picked.has(a)));

  const groups = members.filter((id) => kids.has(id));
  if (groups.length > 1) return null;
  if (groups.length === 1) {
    const groupId = groups[0];
    const rest = members.filter((id) => id !== groupId);
    return rest.length > 0 ? { kind: 'join', groupId, members: rest } : null;
  }

  if (members.length < 2) return null;
  // already grouped: every child of one group, and nothing else, is selected
  const parent = byId.get(members[0])?.parentId ?? null;
  if (
    parent &&
    members.every((id) => byId.get(id)?.parentId === parent) &&
    members.length === (kids.get(parent)?.length ?? 0)
  ) {
    return null;
  }
  // deepest ancestor shared by every member
  let common = ancestors(members[0]);
  for (const id of members.slice(1)) {
    const mine = new Set(ancestors(id));
    common = common.filter((a) => mine.has(a));
  }
  return { kind: 'new', members, parentId: common[0] ?? null };
}
