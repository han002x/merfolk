import { useCallback, useEffect, useState } from 'react';
import { useDiagram } from '../store';
import { restore, startAutosave, startSync } from '../persist';
import { toggleTheme } from '../theme';
import { backlinks, linkableNodes, nodesOfPage, pathTo } from '../pages';
import { openNode, pageHref } from '../route';
import Document from './Document';
import Navigation from './Navigation';
import './wiki.css';

export default function WikiApp({ pageId, nodeId }: { pageId: string | null; nodeId?: string }) {
  // load the saved diagram before the first paint, then follow the canvas window
  useState(() => restore());
  useEffect(() => {
    const stops = [startAutosave(), startSync()];
    return () => stops.forEach((stop) => stop());
  }, []);

  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const page = pages.find((p) => p.id === pageId);
  const pageNodes = page ? nodesOfPage(nodes, page.id) : [];
  const node = pageNodes.find((n) => n.id === nodeId) ?? pageNodes[0];
  const linked = page ? backlinks(page, nodes, pages) : [];

  useEffect(() => {
    document.title = page ? `${page.title || 'Untitled'} · merfolk` : 'Wiki · merfolk';
  }, [page]);

  const targets = useCallback(() => {
    const st = useDiagram.getState();
    const names = [...st.pages.map((p) => p.title), ...st.nodes.map((n) => n.label)];
    return [...new Set(names.filter(Boolean))];
  }, []);

  const remove = () => {
    if (!page) return;
    if (page.body.trim() && !window.confirm(`Delete "${page.title || 'Untitled'}"?`)) return;
    window.location.hash = '#/wiki';
    useDiagram.getState().deletePage(page.id);
  };

  const create = () => {
    window.location.hash = pageHref(useDiagram.getState().createPage(''));
  };

  const toPage = (id: string) => {
    const context = useDiagram.getState().nodes.find((n) => n.id === node?.id && n.pageIds?.includes(id));
    window.location.hash = pageHref(id, context?.id);
  };

  return (
    <div className="wk">
      <aside className="wk-index">
        <div className="wk-index-head">
          <a className="wk-brand" href="#/wiki">Wiki</a>
          <button className="wk-btn" onClick={create} title="New page" aria-label="New page">+</button>
        </div>
        <Navigation nodes={nodes} pages={pages} pageId={pageId} nodeId={node?.id} />
        <button className="wk-btn wk-theme" onClick={toggleTheme} title="Toggle theme">◐</button>
      </aside>

      {page ? (
        <main className="wk-main">
          <header className="wk-head">
            <div className="wk-crumbs">
              {node &&
                pathTo(nodes, node.id)
                  .slice(0, -1)
                  .map((n) => (
                    <button key={n.id} className="wk-crumb" onClick={() => openNode(n.id)}>
                      {n.label || 'Group'}
                    </button>
                  ))}
            </div>
            <div className="wk-title-row">
              <input
                className="wk-title"
                aria-label="Page title"
                value={page.title}
                placeholder="Untitled"
                onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
              />
              {node ? (
                <button className="wk-btn" onClick={() => openNode(node.id)} title="Show on canvas">
                  Canvas
                </button>
              ) : null}
              <button className="wk-btn" onClick={remove} title="Delete page">
                Delete
              </button>
            </div>
            <div className="wk-page-nodes" aria-label="Page nodes">
              {node ? (
                <select className="wk-btn" aria-label="Linked nodes" value={node.id}
                  onChange={(e) => { window.location.hash = pageHref(page.id, e.target.value); }}>
                  {pageNodes.map((n) => <option key={n.id} value={n.id}>
                    {pathTo(nodes, n.id).map((p) => p.label || 'Untitled').join(' › ')}
                  </option>)}
                </select>
              ) : <span className="wk-empty-links">Not linked to a node</span>}
              <select
                className="wk-btn"
                value=""
                aria-label="Link to node"
                disabled={linkableNodes(nodes, page.id).length === 0}
                onChange={(e) => {
                  if (!e.target.value) return;
                  useDiagram.getState().linkPage(page.id, e.target.value);
                  window.location.hash = pageHref(page.id, e.target.value);
                }}
              >
                <option value="">Link to node</option>
                {linkableNodes(nodes, page.id).map((n) => (
                  <option key={n.id} value={n.id}>
                    {pathTo(nodes, n.id).map((p) => p.label || 'Group').join(' › ')}
                  </option>
                ))}
              </select>
            </div>
            {pageNodes.length > 0 && <div className="wk-node-links">
              {pageNodes.map((n) => <span key={n.id} className="wk-chip">
                <a href={pageHref(page.id, n.id)}>{n.label || 'Untitled'}</a>
                <button aria-label={`Unlink from ${n.label || 'Untitled'}`} title="Unlink from node"
                  onClick={() => useDiagram.getState().unlinkPage(page.id, n.id)}>×</button>
              </span>)}
            </div>}
          </header>
          <div className="wk-page-content">
            <Document
              key={page.id}
              value={page.body}
              nodeId={node?.id}
              onPage={toPage}
              targets={targets}
              onChange={(body) => {
                const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
                if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
              }}
            />

              {linked.length > 0 && (
                <footer className="wk-back">
                  {linked.map((p) => (
                    <a key={p.id} href={pageHref(p.id)} className="wk-chip">
                      {p.title || 'Untitled'}
                    </a>
                  ))}
                </footer>
              )}
          </div>
        </main>
      ) : (
        <main className="wk-main wk-empty" />
      )}
    </div>
  );
}
