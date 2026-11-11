import { useEffect, useMemo, useRef } from 'react';
import { useDiagram } from '../store';
import { useTheme } from '../theme';
import { toMermaid } from '../mermaid/io';
import { embedDiagram } from '../pages';
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
  const source = useMemo(() => {
    if (!nodeId) return '';
    const sub = embedDiagram({ nodes, edges }, nodeId);
    return sub.nodes.length ? toMermaid(sub) : '';
  }, [nodes, edges, nodeId]);

  useEffect(() => {
    const hosts = root.current?.querySelectorAll<HTMLElement>('[data-embed]');
    if (!hosts?.length) return;
    const render = new AbortController();
    if (source) {
      void diagramSvg(source, dark).then((svg) => {
        if (!render.signal.aborted && svg) hosts.forEach((host) => { host.innerHTML = svg; });
      });
    } else hosts.forEach((host) => host.replaceChildren());
    return () => render.abort();
  }, [html, source, dark]);

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
