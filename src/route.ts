// Hash routes. `#/` is the canvas; the wiki lives in its own window.
//   #/wiki            page index
//   #/wiki/<pageId>   one page
//   #/node/<nodeId>   canvas, focused on a node
//   #/slides          deck index
//   #/slides/<deckId> one deck; `?slide=<n>` presents it from slide n,
//                     `&presenter=1` as the speaker's own window
//   #/docs            the data model and ontology (ONTOLOGY.md)

import { useSyncExternalStore } from 'react';

export type Route =
  | { kind: 'canvas' }
  | { kind: 'docs' }
  | { kind: 'node'; id: string }
  | { kind: 'wiki'; id: string | null; nodeId?: string }
  | { kind: 'slides'; id: string | null; nodeId?: string; slide?: number; presenter?: boolean };

export function parseRoute(hash: string): Route {
  const [, kind, id] = hash.match(/^#\/(wiki|node|slides|docs)(?:\/([^/?]+))?/) ?? [];
  const decoded = id ? decodeURIComponent(id) : null;
  if (kind === 'docs') return { kind: 'docs' };
  if (kind === 'wiki' || kind === 'slides') {
    const query = new URLSearchParams(hash.split('?')[1]);
    const nodeId = query.get('node');
    const slide = Number(query.get('slide'));
    return {
      kind,
      id: decoded,
      ...(nodeId && { nodeId }),
      ...(kind === 'slides' && Number.isInteger(slide) && slide > 0 && { slide }),
      ...(kind === 'slides' && query.has('presenter') && { presenter: true }),
    };
  }
  if (kind === 'node' && decoded) return { kind: 'node', id: decoded };
  return { kind: 'canvas' };
}

export const pageHref = (pageId: string, nodeId?: string) =>
  `#/wiki/${encodeURIComponent(pageId)}${nodeId ? `?node=${encodeURIComponent(nodeId)}` : ''}`;
export const deckHref = (deckId: string, nodeId?: string, slide?: number, presenter?: boolean) => {
  const query = [nodeId && `node=${encodeURIComponent(nodeId)}`, slide && `slide=${slide}`, presenter && 'presenter=1']
    .filter(Boolean).join('&');
  return `#/slides/${encodeURIComponent(deckId)}${query ? `?${query}` : ''}`;
};
export const nodeHref = (nodeId: string) => `#/node/${encodeURIComponent(nodeId)}`;

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

const CANVAS = 'marmerlade-canvas';
const WIKI = 'marmerlade-wiki';
const SLIDES = 'marmerlade-slides';

/** Name the canvas window so the wiki can navigate it instead of opening more. */
export function nameCanvasWindow() {
  if (!window.name) window.name = CANVAS;
}

/** Open (or reuse) the wiki window at a page. */
export function openWiki(pageId: string, nodeId?: string) {
  window.open(pageHref(pageId, nodeId), WIKI)?.focus();
}

/** Open (or reuse) the slides window at a deck, or at the list of decks. */
export function openSlides(deckId?: string, nodeId?: string) {
  window.open(deckId ? deckHref(deckId, nodeId) : '#/slides', SLIDES)?.focus();
}

/** Open (or reuse) the canvas window focused on a node. */
export function openNode(nodeId: string) {
  window.open(`${window.location.pathname}${nodeHref(nodeId)}`, CANVAS)?.focus();
}

/** Open (or reuse) the docs window. */
export function openDocs() {
  window.open('#/docs', 'marmerlade-docs')?.focus();
}
