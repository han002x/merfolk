// Pure wiki logic: pages link to any number of nodes and outlive them.
// Slide decks link the same way, so each helper takes the node field to read.
// No store or DOM here, so scripts/pages.ts can exercise it directly.

import type { Diagram, DiagramNode, Page } from './types';

/** The node field holding links to pages or to decks. */
export type LinkKey = 'pageIds' | 'deckIds';

/** Validate page references at JSON and Mermaid boundaries. */
export function parsePageIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((id: unknown) => typeof id === 'string' && id.length > 0))
    throw new Error('Page links must be an array of nonempty page IDs');
  return [...new Set<string>(value)];
}

/** Read old single-page diagrams without retaining a second source of truth. */
export function normalizeDiagram(diagram: Diagram): Diagram {
  return {
    ...diagram,
    pages: Array.isArray(diagram.pages) ? diagram.pages : [],
    decks: Array.isArray(diagram.decks) ? diagram.decks : [],
    nodes: diagram.nodes.map((node) => {
      const legacy = 'pageId' in node ? node.pageId : undefined;
      const clean = { ...node };
      if ('pageId' in clean) delete clean.pageId;
      if (node.deckIds !== undefined) clean.deckIds = parsePageIds(node.deckIds);
      if (node.pageIds !== undefined) return { ...clean, pageIds: parsePageIds(node.pageIds) };
      return typeof legacy === 'string' && legacy ? { ...clean, pageIds: [legacy] } : clean;
    }),
  };
}

export function newPageId(pages: Page[], prefix = 'page'): string {
  let id: string;
  do {
    id = `${prefix}${Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0')}`;
  } while (pages.some((p) => p.id === id));
  return id;
}

/** The default page of a node, if it exists. */
export function pageOf(node: DiagramNode | undefined, pages: Page[], key: LinkKey = 'pageIds'): Page | undefined {
  return pages.find((p) => p.id === node?.[key]?.[0]);
}

/**
 * Give `node` a page, titled from its label, unless it already has one.
 * Returns the new page, or null when nothing needed creating.
 */
export function createPageFor(node: DiagramNode, pages: Page[], now = Date.now(), key: LinkKey = 'pageIds'): Page | null {
  if (pageOf(node, pages, key)) return null;
  // A reference imported from Mermaid may not have page content yet.
  const id = node[key]?.[0] ?? newPageId(pages, key === 'deckIds' ? 'deck' : 'page');
  return { id, title: node.label, body: '', updatedAt: now };
}

/** Pages no node points at. */
export function orphanPages(nodes: DiagramNode[], pages: Page[], key: LinkKey = 'pageIds'): Page[] {
  const used = new Set(nodes.flatMap((n) => n[key] ?? []));
  return pages.filter((p) => !used.has(p.id));
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

/** Nodes not yet linked to this page. */
export function linkableNodes(nodes: DiagramNode[], pageId: string, key: LinkKey = 'pageIds'): DiagramNode[] {
  return nodes.filter((n) => !n[key]?.includes(pageId));
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

/** All nodes linked to a page, in diagram order. */
export function nodesOfPage(nodes: DiagramNode[], pageId: string, key: LinkKey = 'pageIds'): DiagramNode[] {
  return nodes.filter((n) => n[key]?.includes(pageId));
}

/** Pages whose body links to `page` (by title, or by its node's label). */
export function backlinks(page: Page, nodes: DiagramNode[], pages: Page[]): Page[] {
  return pages.filter(
    (other) =>
      other.id !== page.id &&
      extractLinks(other.body).some((t) => {
        const r = resolveLink(t, nodes, pages);
        if (r.kind === 'page') return r.page.id === page.id;
        return r.kind === 'node' && r.node.pageIds?.[0] === page.id;
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
 * The node an embed draws: `{{diagram:Target}}` names one by id or label,
 * a bare `{{diagram}}` takes the node the page or deck is open on.
 */
export function embedNode(target: string, nodes: DiagramNode[], fallback?: string): string | undefined {
  if (!target.trim()) return fallback;
  return (nodes.find((n) => n.id === target.trim()) ?? nodes.find((n) => n.label && same(n.label, target)))?.id;
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
    .map(({ pageIds: _pages, deckIds: _decks, ...n }) => ({
      ...n,
      parentId: n.parentId && keep.has(n.parentId) ? n.parentId : null,
    }));
  const edges = d.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { nodes, edges };
}
