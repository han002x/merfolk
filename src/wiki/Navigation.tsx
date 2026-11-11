import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { orphanPages, pathTo } from '../pages';
import { pageHref } from '../route';
import type { DiagramNode, Page } from '../types';

export default function Navigation({ nodes, pages, pageId, nodeId }: {
  nodes: DiagramNode[];
  pages: Page[];
  pageId: string | null;
  nodeId: string | undefined;
}) {
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
      if (node.pageIds?.some((id) => pagesById.has(id))) {
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
      unlinked: orphanPages(nodes, pages).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [nodes, pages]);

  const pageLink = (page: Page, context?: string) => (
    <a
      href={pageHref(page.id, context)}
      className={`wk-item${page.id === pageId && context === nodeId ? ' on' : ''}`}
      aria-current={page.id === pageId && context === nodeId ? 'page' : undefined}
      title={page.title || 'Untitled'}
    >
      <Icon name="page" size={14} />
      <span>{page.title || 'Untitled'}</span>
    </a>
  );

  const renderNodes = (parentId: string | null) => (
    <ul className="wk-tree-list">
      {(children.get(parentId) ?? []).map((node) => {
        const expanded = !branches.closed.has(node.id);
        return (
          <li key={node.id}>
            <button className="wk-tree-node" aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label || node.id}`}
              title={node.label || node.id}
              onClick={() => setBranches((previous) => {
                const closed = new Set(previous.closed);
                if (closed.has(node.id)) closed.delete(node.id);
                else closed.add(node.id);
                return { ...previous, closed };
              })}>
              <span className={`wk-tree-chevron${expanded ? ' expanded' : ''}`} aria-hidden="true">›</span>
              <Icon name={children.has(node.id) ? 'group' : 'rect'} size={14} />
              <span className="wk-tree-label">{node.label || node.id}</span>
            </button>
            {expanded && <div className="wk-tree-children">
              <ul className="wk-tree-list">
                {(node.pageIds ?? []).map((id) => {
                  const page = pagesById.get(id);
                  return page ? <li key={id}>{pageLink(page, node.id)}</li> : null;
                })}
              </ul>
              {renderNodes(node.id)}
            </div>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="wk-navigation" aria-label="Wiki pages">
      <div className="wk-index-heading">Pages <span>{pages.length}</span></div>
      {pages.length === 0 && <p className="wk-index-empty">No pages yet</p>}
      {renderNodes(null)}
      {unlinked.length > 0 && <section className="wk-unlinked" aria-label="Unlinked pages">
        <h2 className="wk-index-heading">Unlinked <span>{unlinked.length}</span></h2>
        <ul className="wk-tree-list">
          {unlinked.map((page) => <li key={page.id}>{pageLink(page)}</li>)}
        </ul>
      </section>}
    </nav>
  );
}
