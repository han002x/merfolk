import { useCallback, useEffect, useState } from 'react';
import { useDiagram } from '../store';
import { restore, startAutosave, startSync } from '../persist';
import { openAppearance } from '../theme';
import { backlinks, nodesOfPage, pathTo } from '../pages';
import { openNode, pageHref } from '../route';
import { Icon } from '../components/Icon';
import Document, { ModeSwitch, type PageMode } from './Document';
import Menu from './Menu';
import Navigation from './Navigation';
import NodeLinks from './NodeLinks';
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
  const [mode, setMode] = useState<PageMode>('edit');
  // the narrow-screen index closes itself once a page is chosen
  const [index, setIndex] = useState<{ at: string | null } | null>(null);
  const indexOpen = index !== null && index.at === pageId;
  const where = (id: string) => pathTo(nodes, id).map((n) => n.label || 'Untitled').join(' › ');

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
    <div className={`wk${indexOpen ? ' nav-open' : ''}`}>
      <aside className="wk-index">
        <div className="wk-index-head">
          <a className="wk-brand" href="#/wiki">Wiki</a>
          <button className="wk-icon" onClick={openAppearance} title="Appearance" aria-label="Appearance">
            <Icon name={'shapes'} size={15} />
          </button>
          <button className="wk-icon" onClick={create} title="New page" aria-label="New page">
            <Icon name="plus" size={15} />
          </button>
        </div>
        <Navigation nodes={nodes} pages={pages} pageId={pageId} nodeId={node?.id} />
      </aside>
      <button className="wk-scrim" aria-label="Close pages" onClick={() => setIndex(null)} />

      <main className="wk-main">
        <header className="wk-bar">
          <button className="wk-btn wk-nav-toggle" aria-expanded={indexOpen}
            onClick={() => setIndex(indexOpen ? null : { at: pageId })}>
            Pages
          </button>
          <nav className="wk-crumbs" aria-label="Linked nodes">
            {page && <NodeLinks id={page.id} nodeId={nodeId} />}
          </nav>
          {page && <>
            <ModeSwitch value={page.body} mode={mode} onMode={setMode} />
            <Menu className="wk-icon" align="end" label="Page actions" button={<Icon name="more" size={16} />}>
              {node && <button role="menuitem" onClick={() => openNode(node.id)}>Show on canvas</button>}
              <button role="menuitem" className="danger" onClick={remove}>Delete page</button>
            </Menu>
          </>}
        </header>

        {page ? (
          <div className="wk-page-content">
            <input
              className="wk-title"
              aria-label="Page title"
              value={page.title}
              placeholder="Untitled"
              onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
            />
            <Document
              key={page.id}
              value={page.body}
              mode={mode}
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
                <h2>Linked from</h2>
                {linked.map((p) => (
                  <a key={p.id} href={pageHref(p.id)}>{p.title || 'Untitled'}</a>
                ))}
              </footer>
            )}
          </div>
        ) : (
          <div className="wk-page-content">
            <div className="wk-list">
              <div className="wk-list-head">
                <h1>Pages</h1>
                <button className="wk-btn" onClick={create}>New page</button>
              </div>
              <ul>
                {[...pages].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => {
                  const home = nodesOfPage(nodes, p.id)[0];
                  return <li key={p.id}>
                    <a href={pageHref(p.id, home?.id)}>
                      <span>{p.title || 'Untitled'}</span>
                      {home && <span>{where(home.id)}</span>}
                    </a>
                  </li>;
                })}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
