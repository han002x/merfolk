// Hash routes. `#/` is the canvas; the wiki lives in its own window.
//   #/wiki            page index
//   #/wiki/<pageId>   one page
//   #/node/<nodeId>   canvas, focused on a node

import { useSyncExternalStore } from 'react';

export type Route =
  | { kind: 'canvas' }
  | { kind: 'node'; id: string }
  | { kind: 'wiki'; id: string | null; nodeId?: string };

export function parseRoute(hash: string): Route {
  const [, kind, id] = hash.match(/^#\/(wiki|node|participant)(?:\/([^/?]+))?/) ?? [];
  const decoded = id ? decodeURIComponent(id) : null;
  if (kind === 'wiki') {
    const nodeId = new URLSearchParams(hash.split('?')[1]).get('node');
    return { kind: 'wiki', id: decoded, ...(nodeId && { nodeId }) };
  }
  if ((kind === 'node' || kind === 'participant') && decoded) return { kind: 'node', id: decoded };
  return { kind: 'canvas' };
}

export const pageHref = (pageId: string, nodeId?: string) =>
  `#/wiki/${encodeURIComponent(pageId)}${nodeId ? `?node=${encodeURIComponent(nodeId)}` : ''}`;
export const nodeHref = (nodeId: string) => `#/node/${encodeURIComponent(nodeId)}`;

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

const CANVAS = 'merfolk-canvas';
const WIKI = 'merfolk-wiki';

/** Name the canvas window so the wiki can navigate it instead of opening more. */
export function nameCanvasWindow() {
  if (!window.name) window.name = CANVAS;
}

/** Open (or reuse) the wiki window at a page. */
export function openWiki(pageId: string, nodeId?: string) {
  window.open(pageHref(pageId, nodeId), WIKI)?.focus();
}

/** Open (or reuse) the canvas window focused on a node. */
export function openNode(nodeId: string) {
  window.open(`${window.location.pathname}${nodeHref(nodeId)}`, CANVAS)?.focus();
}
