import { useEffect, useMemo, useRef } from 'react';
import { useDiagram } from '../store';
import { useTheme } from '../theme';
import { toMermaid } from '../mermaid/io';
import { embedDiagram, embedNode } from '../pages';
import { openNode, pageHref, parseRoute } from '../route';
import { renderPage } from './render';

const svgCache = new Map<string, string>();
let seq = 0;

async function diagramSvg(source: string, dark: boolean) {
  const key = `${dark}\u0000${source}`;
  let svg = svgCache.get(key);
  if (!svg) {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
    try {
      if (!(await mermaid.parse(source, { suppressErrors: true }))) return;
      svg = (await mermaid.render(`wk-embed-${seq++}`, source)).svg;
    } catch {
      return;
    }
    svgCache.set(key, svg);
  }
  return svg;
}

/** Rendered page. Wikilinks navigate; embedded diagram nodes jump to the canvas. */
export default function Preview({
  body,
  nodeId,
  onPage = (id) => (window.location.hash = pageHref(id)),
  onNode = openNode,
}: {
  body: string;
  nodeId?: string;
  /** a wikilink to a page was followed */
  onPage?: (pageId: string) => void;
  /** a node in the embedded diagram was clicked */
  onNode?: (nodeId: string) => void;
}) {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const pages = useDiagram((s) => s.pages);
  const dark = useTheme() === 'dark';
  const root = useRef<HTMLDivElement>(null);

  const html = useMemo(() => renderPage(body, { nodes, pages }), [body, nodes, pages]);

  useEffect(() => {
    const hosts = root.current?.querySelectorAll<HTMLElement>('[data-embed], [data-mermaid]');
    if (!hosts?.length) return;
    const render = new AbortController();
    hosts.forEach((host) => {
      // a fence carries its own source; an embed draws a node of the live diagram
      const fence = host.dataset.mermaid === undefined ? undefined : decodeURIComponent(host.dataset.mermaid);
      let source = fence ?? '';
      if (host.dataset.embed !== undefined) {
        const id = embedNode(host.dataset.embed, nodes, nodeId);
        const sub = id ? embedDiagram({ nodes, edges }, id) : null;
        source = sub?.nodes.length ? toMermaid(sub) : '';
      }
      const key = `${dark}\u0000${source}`;
      if (host.dataset.shown === key) return;
      const show = (svg?: string) => {
        if (render.signal.aborted) return;
        host.dataset.shown = key;
        if (svg) {
          host.innerHTML = svg;
          // drawn width, so a slide can scale the picture with its own size
          const drawn = host.querySelector('svg')?.viewBox.baseVal.width;
          if (drawn) host.style.setProperty('--embed-w', String(drawn));
        }
        else host.textContent = fence ?? '';
      };
      if (source) void diagramSvg(source, dark).then(show);
      else show();
    });
    return () => render.abort();
  }, [html, nodes, edges, nodeId, dark]);

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
    const t = e.target;
    const link = t.closest<HTMLAnchorElement>('a.wl');
    if (link) {
      e.preventDefault();
      const st = useDiagram.getState();
      const route = parseRoute(link.getAttribute('href') ?? '');
      const id = link.dataset.node ? st.openPage(link.dataset.node)
        : link.dataset.create ? st.createPage(link.dataset.create)
        : route.kind === 'wiki' ? route.id : null;
      if (id) onPage(id);
      return;
    }
    const hit = /^flowchart-(.+)-\d+$/.exec(t.closest('[data-embed] .node')?.id ?? '');
    if (hit) onNode(hit[1]);
  };

  return (
    <div
      className="wk-preview wk-prose"
      ref={root}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
