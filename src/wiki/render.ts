// Markdown -> sanitized HTML, with `[[wikilinks]]`, the `{{diagram}}` embed
// (`{{diagram:Node}}` names a node) and Mermaid fences.
// Links are resolved against the live diagram, so renames show up on re-render.

import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { DiagramNode, Page } from '../types';
import { resolveLink } from '../pages.ts';
import { pageHref } from '../route.ts';

export interface RenderContext {
  nodes: DiagramNode[];
  pages: Page[];
}

let ctx: RenderContext = { nodes: [], pages: [] };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src) => src.indexOf('[['),
      tokenizer(src) {
        const m = /^\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/.exec(src);
        if (!m) return undefined;
        const target = m[1].trim();
        return { type: 'wikilink', raw: m[0], target, text: (m[2] ?? m[1]).trim() };
      },
      renderer(token) {
        const { target, text } = token as unknown as { target: string; text: string };
        const r = resolveLink(target, ctx.nodes, ctx.pages);
        if (r.kind === 'page')
          return `<a class="wl" href="${pageHref(r.page.id)}">${esc(text)}</a>`;
        if (r.kind === 'node')
          return `<a class="wl" href="#/wiki" data-node="${esc(r.node.id)}">${esc(text)}</a>`;
        return `<a class="wl new" href="#/wiki" data-create="${esc(target)}">${esc(text)}</a>`;
      },
    },
    {
      name: 'embed',
      level: 'block',
      start: (src) => src.indexOf('{{diagram'),
      tokenizer(src) {
        const m = /^\{\{diagram(?::([^}\n]+))?\}\}[ \t]*(?:\n|$)/.exec(src);
        return m ? { type: 'embed', raw: m[0], target: (m[1] ?? '').trim() } : undefined;
      },
      renderer: (token) => `<div class="embed" data-embed="${esc((token as unknown as { target: string }).target)}"></div>\n`,
    },
  ],
  renderer: {
    // a Mermaid fence is a picture, drawn by Preview; URI-encoded because the
    // sanitizer drops any attribute holding an arrow (`-->` closes a comment)
    code: ({ text, lang }) =>
      lang === 'mermaid' ? `<div class="embed" data-mermaid="${encodeURIComponent(text)}"></div>\n` : false,
  },
});

/** Sanitized HTML for a page body. Raw HTML in the Markdown is cleaned, not trusted. */
export function renderPage(body: string, context: RenderContext): string {
  ctx = context;
  const html = marked.parse(body, { async: false, gfm: true });
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-node', 'data-create', 'data-embed', 'data-mermaid'] });
}
