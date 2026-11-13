import { useEffect, useMemo, type MouseEvent } from 'react';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import source from '../../ONTOLOGY.md?raw';
import './docs.css';
import '../wiki/wiki.css';

const slug = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ +/g, '-');

// headings get ids so the document's own `[Shapes](#shapes)` links can scroll
const marked = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const id = slug(tokens.map((t) => t.raw).join(''));
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

export default function DocsApp() {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true })), []);

  useEffect(() => {
    document.title = 'Docs · merfolk';
  }, []);

  // `#shapes` would leave the docs route, so in-page anchors scroll instead
  const onClick = (e: MouseEvent) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (!href?.startsWith('#') || href.startsWith('#/')) return;
    e.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView();
  };

  return (
    <div className="dk">
      <header className="dk-head">
        <a href="#/">← Canvas</a>
        <strong>Docs</strong>
      </header>
      <article className="wk-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
