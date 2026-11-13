import { useEffect, useMemo, useState, type MouseEvent } from 'react';
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

interface Entry { id: string; text: string; depth: number }

const outline: Entry[] = marked
  .lexer(source)
  .flatMap((t) =>
    t.type === 'heading' && (t.depth === 2 || t.depth === 3)
      ? [{ id: slug(t.tokens?.map((x) => x.raw).join('') ?? t.text), text: t.text.replace(/`/g, ''), depth: t.depth }]
      : [],
  );

export default function DocsApp() {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true })), []);
  const [active, setActive] = useState('');

  useEffect(() => {
    document.title = 'Docs · marmerlade';
  }, []);

  // highlight the section being read
  useEffect(() => {
    const heads = outline.map((e) => document.getElementById(e.id)).filter((el): el is HTMLElement => !!el);
    const seen = new Set<string>();
    const watch = new IntersectionObserver(
      (hits) => {
        for (const h of hits) {
          if (h.isIntersecting) seen.add(h.target.id);
          else seen.delete(h.target.id);
        }
        const first = heads.find((el) => seen.has(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-56px 0px -70% 0px' },
    );
    heads.forEach((el) => watch.observe(el));
    return () => watch.disconnect();
  }, []);

  // `#shapes` would leave the docs route, so in-page anchors scroll instead
  const onClick = (e: MouseEvent) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (!href?.startsWith('#') || href.startsWith('#/')) return;
    e.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView();
  };

  return (
    <div className="dk" onClick={onClick}>
      <header className="dk-head">
        <a href="#/">← Canvas</a>
        <strong>Docs</strong>
      </header>
      <div className="dk-body">
        <nav className="dk-toc" aria-label="Contents">
          {outline.map((e) => (
            <a key={e.id} href={`#${e.id}`} data-depth={e.depth} aria-current={active === e.id || undefined}>
              {e.text}
            </a>
          ))}
        </nav>
        <article className="wk-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
