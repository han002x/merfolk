import { useEffect, useMemo, useRef } from 'react';
import { useDiagram } from '../store';
import { useTheme } from '../theme';
import { toMermaid } from '../mermaid/io';
import { embedDiagram } from '../pages';
import { openNode, pageHref } from '../route';
import { renderPage } from './render';

const svgCache = new Map<string, string>();
let seq = 0;

/** Draw `source` into `host`; the previous picture stays until the new one is ready. */
async function draw(host: HTMLElement, source: string, dark: boolean) {
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
  if (!host.isConnected) return;
  host.innerHTML = svg;
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
    const host = root.current?.querySelector<HTMLElement>('[data-embed]');
    if (host && source) void draw(host, source, dark);
  }, [html, source, dark]);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const link = t.closest<HTMLElement>('a[data-node], a[data-create]');
    if (link) {
      e.preventDefault();
      const st = useDiagram.getState();
      const id = link.dataset.node ? st.openPage(link.dataset.node) : st.createPage(link.dataset.create!);
      if (id) onPage(id);
      return;
    }
    const hit = /^flowchart-(.+)-\d+$/.exec(t.closest('[data-embed] .node')?.id ?? '');
    if (hit) onNode(hit[1]);
  };

  return (
    <div
      className="wk-preview"
      ref={root}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
