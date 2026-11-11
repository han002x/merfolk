// Pure wiki logic: pages hang off nodes by `pageId` and outlive them.
// No store or DOM here, so scripts/pages.ts can exercise it directly.

import type { Diagram, DiagramNode, Page } from './types';

export function newPageId(pages: Page[]): string {
  let id: string;
  do {
    id = `page${Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0')}`;
  } while (pages.some((p) => p.id === id));
  return id;
}

/** The page a node points at, if it exists. */
export function pageOf(node: DiagramNode | undefined, pages: Page[]): Page | undefined {
  return node?.pageId ? pages.find((p) => p.id === node.pageId) : undefined;
}

/**
 * Give `node` a page, titled from its label, unless it already has one.
 * Returns the new page, or null when nothing needed creating.
 */
export function createPageFor(node: DiagramNode, pages: Page[], now = Date.now()): Page | null {
  if (pageOf(node, pages)) return null;
  // a pageId whose page is gone (e.g. pasted Mermaid) is reused rather than orphaned
  const id = node.pageId ?? newPageId(pages);
  return { id, title: node.label, body: '', updatedAt: now };
}

/** Pages no node points at. */
export function orphanPages(nodes: DiagramNode[], pages: Page[]): Page[] {
  const used = new Set(nodes.map((n) => n.pageId));
  return pages.filter((p) => !used.has(p.id));
}

/** Rename the page behind a node (one way: node label -> page title). */
export function retitle(pages: Page[], node: DiagramNode, now = Date.now()): Page[] {
  const page = pageOf(node, pages);
  if (!page || page.title === node.label) return pages;
  return pages.map((p) => (p === page ? { ...p, title: node.label, updatedAt: now } : p));
}

/** How long a page only we have counts as "not saved yet" rather than deleted. */
const UNSAVED_MS = 2000;

/**
 * Merge another window's saved pages into ours. The save is the truth: per page
 * the newer `updatedAt` wins, pages only it has are added, and pages only we
 * have were deleted there, unless we touched them in the last couple of
 * seconds (still on their way to storage). Returns `local` itself when nothing
 * changed, so callers can skip a write and avoid echo loops between windows.
 */
export function mergePages(local: Page[], remote: Page[], now = Date.now()): Page[] {
  const theirs = new Map(remote.map((p) => [p.id, p]));
  let changed = false;
  const kept: Page[] = [];
  for (const l of local) {
    const r = theirs.get(l.id);
    if (!r) {
      if (now - l.updatedAt < UNSAVED_MS) kept.push(l);
      else changed = true;
    } else if (r.updatedAt > l.updatedAt) {
      kept.push(r);
      changed = true;
    } else kept.push(l);
  }
  const have = new Set(local.map((p) => p.id));
  for (const r of remote)
    if (!have.has(r.id)) {
      kept.push(r);
      changed = true;
    }
  return changed ? kept : local;
}

/** Unlinked nodes a page could be re-attached to. */
export function linkableNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.filter((n) => !n.pageId);
}

// ---- wikilinks -------------------------------------------------------------

/** `[[Target]]` / `[[Target|alias]]`, in document order. */
export function extractLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]/g)].map((m) => m[1].trim());
}

export type Resolved =
  | { kind: 'page'; page: Page }
  | { kind: 'node'; node: DiagramNode }
  | { kind: 'none' };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A link names a page title first, then a node label (whose page is created on
 * first visit). Case-insensitive; the first match in document order wins.
 */
export function resolveLink(target: string, nodes: DiagramNode[], pages: Page[]): Resolved {
  const page = pages.find((p) => same(p.title, target));
  if (page) return { kind: 'page', page };
  const node = nodes.find((n) => n.label && same(n.label, target));
  if (!node) return { kind: 'none' };
  const linked = pageOf(node, pages);
  return linked ? { kind: 'page', page: linked } : { kind: 'node', node };
}

/** The node a page hangs off, if any. */
export function nodeOfPage(nodes: DiagramNode[], pageId: string): DiagramNode | undefined {
  return nodes.find((n) => n.pageId === pageId);
}

/** Pages whose body links to `page` (by title, or by its node's label). */
export function backlinks(page: Page, nodes: DiagramNode[], pages: Page[]): Page[] {
  return pages.filter(
    (other) =>
      other.id !== page.id &&
      extractLinks(other.body).some((t) => {
        const r = resolveLink(t, nodes, pages);
        if (r.kind === 'page') return r.page.id === page.id;
        return r.kind === 'node' && r.node.pageId === page.id;
      }),
  );
}

// ---- diagram structure ------------------------------------------------------

/** Root-to-node chain of groups, ending with the node itself. */
export function pathTo(nodes: DiagramNode[], nodeId: string): DiagramNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: DiagramNode[] = [];
  for (let n = byId.get(nodeId); n && !path.includes(n); n = n.parentId ? byId.get(n.parentId) : undefined)
    path.unshift(n);
  return path;
}

/** Folded groups hiding `nodeId`: unfold these to reveal it on the canvas. */
export function foldedAncestors(nodes: DiagramNode[], nodeId: string): string[] {
  return pathTo(nodes, nodeId)
    .slice(0, -1)
    .filter((n) => n.collapsed)
    .map((n) => n.id);
}

/**
 * What a page embeds: a group's subtree, or a lone node with its direct
 * neighbours. Page links are dropped, so the Mermaid carries no `click` lines.
 */
export function embedDiagram(d: Diagram, nodeId: string): Diagram {
  const root = d.nodes.find((n) => n.id === nodeId);
  if (!root) return { nodes: [], edges: [] };
  const keep = new Set<string>([nodeId]);
  const isGroup = d.nodes.some((n) => n.parentId === nodeId);
  if (isGroup) {
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of d.nodes)
        if (n.parentId && keep.has(n.parentId) && !keep.has(n.id)) {
          keep.add(n.id);
          grew = true;
        }
    }
    keep.delete(nodeId); // the group is the sheet, not a node in its own picture
  } else {
    for (const e of d.edges) {
      if (e.source === nodeId) keep.add(e.target);
      if (e.target === nodeId) keep.add(e.source);
    }
  }
  const nodes = d.nodes
    .filter((n) => keep.has(n.id))
    .map(({ pageId: _drop, ...n }) => ({
      ...n,
      parentId: n.parentId && keep.has(n.parentId) ? n.parentId : null,
    }));
  const edges = d.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { nodes, edges };
}
