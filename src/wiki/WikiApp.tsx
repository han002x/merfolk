import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDiagram } from '../store';
import { restore, startAutosave, startSync } from '../persist';
import { toggleTheme } from '../theme';
import { backlinks, linkableNodes, nodeOfPage, orphanPages, pathTo } from '../pages';
import { openNode, pageHref } from '../route';
import Editor from './Editor';
import Preview from './Preview';
import './wiki.css';

export default function WikiApp({ pageId }: { pageId: string | null }) {
  // load the saved diagram before the first paint, then follow the canvas window
  useState(() => restore());
  useEffect(() => {
    const stops = [startAutosave(), startSync()];
    return () => stops.forEach((stop) => stop());
  }, []);

  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const page = pages.find((p) => p.id === pageId);
  const node = page ? nodeOfPage(nodes, page.id) : undefined;
  const orphans = useMemo(() => new Set(orphanPages(nodes, pages).map((p) => p.id)), [nodes, pages]);
  const sorted = useMemo(
    () => [...pages].sort((a, b) => a.title.localeCompare(b.title)),
    [pages],
  );
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

  return (
    <div className="wk">
      <aside className="wk-index">
        <div className="wk-index-head">
          <a className="wk-brand" href="#/wiki">Wiki</a>
          <button className="wk-btn" onClick={create} title="New page">+</button>
        </div>
        <nav>
          {sorted.map((p) => (
            <a
              key={p.id}
              href={pageHref(p.id)}
              className={`wk-item${p.id === pageId ? ' on' : ''}${orphans.has(p.id) ? ' orphan' : ''}`}
            >
              {p.title || 'Untitled'}
            </a>
          ))}
        </nav>
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
                value={page.title}
                placeholder="Untitled"
                onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
              />
              {node ? (
                <button className="wk-btn" onClick={() => openNode(node.id)} title="Show on canvas">
                  Canvas
                </button>
              ) : (
                <select
                  className="wk-btn"
                  value=""
                  aria-label="Link to node"
                  onChange={(e) => e.target.value && useDiagram.getState().linkPage(page.id, e.target.value)}
                >
                  <option value="">Link to node</option>
                  {linkableNodes(nodes).map((n) => (
                    <option key={n.id} value={n.id}>
                      {pathTo(nodes, n.id).map((p) => p.label || 'Group').join(' › ')}
                    </option>
                  ))}
                </select>
              )}
              <button className="wk-btn" onClick={remove} title="Delete page">
                Delete
              </button>
            </div>
          </header>
          <div className="wk-split">
            <Editor
              key={page.id}
              value={page.body}
              targets={targets}
              onChange={(body) => {
                const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
                if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
              }}
            />
            <div className="wk-read">
              <Preview body={page.body} nodeId={node?.id} />
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
          </div>
        </main>
      ) : (
        <main className="wk-main wk-empty" />
      )}
    </div>
  );
}
