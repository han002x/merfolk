import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { orphanPages, pathTo, type LinkKey } from '../pages';
import { deckHref, pageHref } from '../route';
import type { DiagramNode, Page } from '../types';

export default function Navigation({ nodes, pages, pageId, nodeId, onPage, empty = 'No pages yet', kind = 'pageIds' }: {
  nodes: DiagramNode[];
  pages: Page[];
  pageId: string | null;
  nodeId: string | undefined;
  /** open a page here instead of following its wiki link */
  onPage?: (pageId: string, nodeId?: string) => void;
  empty?: string;
  /** which of a node's links to list: its pages, or its slide decks */
  kind?: LinkKey;
}) {
  const decks = kind === 'deckIds';
  const href = decks ? deckHref : pageHref;
  const [branches, setBranches] = useState(() => ({ nodes, pageId, nodeId, closed: new Set<string>() }));
  if (branches.nodes !== nodes || branches.pageId !== pageId || branches.nodeId !== nodeId) {
    const closed = new Set(branches.closed);
    if (nodeId) for (const node of pathTo(nodes, nodeId)) closed.delete(node.id);
    setBranches({ nodes, pageId, nodeId, closed });
  }
  const { children, pagesById, unlinked } = useMemo(() => {
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    const visible = new Set<string>();
    for (const node of nodes) {
      if (node[kind]?.some((id) => pagesById.has(id))) {
        for (const ancestor of pathTo(nodes, node.id)) visible.add(ancestor.id);
      }
    }
    const children = new Map<string | null, DiagramNode[]>();
    for (const node of nodes) {
      if (!visible.has(node.id)) continue;
      const parent = node.parentId && visible.has(node.parentId) ? node.parentId : null;
      const siblings = children.get(parent) ?? [];
      siblings.push(node);
      children.set(parent, siblings);
    }
    return {
      children,
      pagesById,
      unlinked: orphanPages(nodes, pages, kind).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [nodes, pages, kind]);

  const toggle = (id: string) => setBranches((previous) => {
    const closed = new Set(previous.closed);
    if (closed.has(id)) closed.delete(id);
    else closed.add(id);
    return { ...previous, closed };
  });

  const pageLink = (page: Page, context?: string) => (
    <a
      href={href(page.id, context)}
      className={`wk-item${page.id === pageId && context === nodeId ? ' on' : ''}`}
      aria-current={page.id === pageId && context === nodeId ? 'page' : undefined}
      title={page.title || 'Untitled'}
      onClick={onPage && ((event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onPage(page.id, context);
      })}
    >
      <Icon name={decks ? 'deck' : 'page'} size={14} />
      <span>{page.title || 'Untitled'}</span>
    </a>
  );

  const renderNodes = (parentId: string | null) => (
    <ul className="wk-tree-list">
      {(children.get(parentId) ?? []).map((node) => {
        const expanded = !branches.closed.has(node.id);
        const name = node.label || node.id;
        const own = (node[kind] ?? []).flatMap((id) => pagesById.get(id) ?? []);
        // a node whose only page carries its name is one row, not two
        const solo = own.length === 1 && own[0].title === node.label ? own[0] : null;
        const nested = children.has(node.id);
        const chevron = <span className={`wk-tree-chevron${expanded ? ' expanded' : ''}`} aria-hidden="true">›</span>;
        const state = { 'aria-expanded': expanded, 'aria-label': `${expanded ? 'Collapse' : 'Expand'} ${name}` };
        return (
          <li key={node.id}>
            {solo ? <div className="wk-tree-solo">
              {nested ? <button className="wk-tree-toggle" {...state} onClick={() => toggle(node.id)}>{chevron}</button>
                : <span className="wk-tree-toggle" />}
              {pageLink(solo, node.id)}
            </div> : <button className="wk-tree-node" {...state} title={name} onClick={() => toggle(node.id)}>
              {chevron}
              <Icon name={nested ? 'group' : 'rect'} size={14} />
              <span className="wk-tree-label">{name}</span>
            </button>}
            {expanded && (nested || !solo) && <div className="wk-tree-children">
              {!solo && <ul className="wk-tree-list">
                {own.map((page) => <li key={page.id}>{pageLink(page, node.id)}</li>)}
              </ul>}
              {renderNodes(node.id)}
            </div>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="wk-navigation" aria-label={decks ? 'Slide decks' : 'Wiki pages'}>
      {pages.length === 0 && <p className="wk-index-empty">{empty}</p>}
      {renderNodes(null)}
      {unlinked.length > 0 && <section className="wk-unlinked" aria-label={decks ? 'Unlinked decks' : 'Unlinked pages'}>
        <h2 className="wk-index-heading">Unlinked</h2>
        <ul className="wk-tree-list">
          {unlinked.map((page) => <li key={page.id}>{pageLink(page)}</li>)}
        </ul>
      </section>}
    </nav>
  );
}
