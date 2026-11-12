import { useDiagram } from '../store';
import { showPage, useDock } from '../dock';
import { nodesOfPage, pageOf, pathTo } from '../pages';
import { nodeHref, openWiki } from '../route';
import Document, { ModeSwitch } from '../wiki/Document';
import Menu from '../wiki/Menu';
import Navigation from '../wiki/Navigation';
import '../wiki/wiki.css';

/** The selected node's wiki page, editable beside the canvas. */
export default function PagePanel() {
  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const selected = useDiagram((s) => s.selectedNodeIds[0]);
  const mode = useDock((s) => s.mode);
  const setMode = useDock((s) => s.setMode);
  const active = useDock((s) => s.page);
  const setPage = useDock((s) => s.setPage);

  const node = nodes.find((n) => n.id === selected);
  const chosen = active && active.selection === selected && (!node || node.pageIds?.includes(active.id))
    ? pages.find((p) => p.id === active.id) : undefined;
  const page = chosen ?? pageOf(node, pages);
  const pageNode = page ? (node?.pageIds?.includes(page.id) ? node : nodesOfPage(nodes, page.id)[0]) : undefined;

  /** Show a page on one of its nodes, or on its own when it has none. */
  const open = (id: string, nodeId?: string) => {
    const st = useDiagram.getState();
    const targets = nodesOfPage(st.nodes, id);
    const target = targets.find((n) => n.id === (nodeId ?? selected)) ?? targets[0];
    if (target) {
      showPage(target.id, id);
      if (target.id !== selected) window.location.hash = nodeHref(target.id);
    } else {
      st.setSelection([], []);
      setPage(id);
    }
  };
  const toNode = (id: string) => {
    window.location.hash = nodeHref(id);
  };

  // nothing selected: the tab is the way into every page
  if (!page && !node) {
    return (
      <div className="wk-dock">
        <Navigation nodes={nodes} pages={pages} pageId={null} nodeId={undefined} onPage={open}
          empty="Select a node to write its page" />
      </div>
    );
  }

  const ids = node?.pageIds ?? [];
  const available = pages.filter((p) => !ids.includes(p.id)).sort((a, b) => a.title.localeCompare(b.title));
  const create = () => node && setPage(useDiagram.getState().createPageForNode(node.id));
  const link = (id: string) => {
    if (!node) return;
    useDiagram.getState().linkPage(id, node.id);
    setPage(id);
  };

  if (!page) {
    return (
      <div className="wk-dock wk-dock-empty">
        <button className="wk-btn" onClick={create}>New page</button>
        {available.length > 0 && <div className="wk-menu-label">Link existing page</div>}
        {available.map((p) => (
          <button key={p.id} className="wk-item" onClick={() => link(p.id)}>
            <span>{p.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
    );
  }

  const crumbs = pageNode ? pathTo(nodes, pageNode.id).slice(0, -1) : [];
  return (
    <div className="wk-dock">
      <div className="wk-dock-bar">
        <div className="wk-crumbs">
          {!node && <button className="wk-crumb" onClick={() => setPage(null)}>Pages</button>}
          {node && crumbs.map((n) => (
            <button key={n.id} className="wk-crumb" onClick={() => toNode(n.id)}>
              {n.label || 'Group'}
            </button>
          ))}
        </div>
        <ModeSwitch value={page.body} mode={mode} onMode={setMode} />
      </div>
      <div className="wk-dock-head">
        <input
          className="wk-title"
          aria-label="Page title"
          value={page.title}
          placeholder="Untitled"
          onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
        />
        {node && (
          <Menu className="wk-icon" align="end" label="Pages on this node" button="⌄">
            {ids.map((id, i) => (
              <button key={id} role="menuitemradio" aria-checked={id === page.id}
                onClick={() => setPage(useDiagram.getState().openPage(node.id, id))}>
                <span>{pages.find((p) => p.id === id)?.title || 'Untitled'}</span>
                {i === 0 && ids.length > 1 && <small>default</small>}
              </button>
            ))}
            <hr />
            <button role="menuitem" onClick={create}>New page</button>
            {page.id !== ids[0] && (
              <button role="menuitem" onClick={() => useDiagram.getState().makeDefaultPage(page.id, node.id)}>
                Make default
              </button>
            )}
            <button role="menuitem" onClick={() => {
              const st = useDiagram.getState();
              st.unlinkPage(page.id, node.id);
              const next = useDiagram.getState().nodes.find((n) => n.id === node.id)?.pageIds?.[0];
              setPage(next ? st.openPage(node.id, next) : null);
            }}>
              <span>Unlink from {node.label || 'this node'}</span>
            </button>
            {available.length > 0 && <>
              <hr />
              <div className="wk-menu-label">Link existing page</div>
            </>}
            {available.map((p) => (
              <button key={p.id} role="menuitem" onClick={() => link(p.id)}>
                <span>{p.title || 'Untitled'}</span>
              </button>
            ))}
          </Menu>
        )}
        <button className="wk-icon" onClick={() => openWiki(page.id, pageNode?.id)} title="Open in wiki" aria-label="Open in wiki">
          ↗
        </button>
      </div>
      <Document
        key={page.id}
        value={page.body}
        mode={mode}
        nodeId={pageNode?.id}
        onPage={open}
        onNode={toNode}
        targets={() => [...new Set([...pages.map((p) => p.title), ...nodes.map((n) => n.label)].filter(Boolean))]}
        onChange={(body) => {
          const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
          if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
        }}
      />
    </div>
  );
}
