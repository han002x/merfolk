import { useDiagram } from '../store';
import { showPage, useDock } from '../dock';
import { nodesOfPage, pageOf, pathTo } from '../pages';
import { nodeHref, openWiki } from '../route';
import Editor from '../wiki/Editor';
import Preview from '../wiki/Preview';
import LinkedPages from './LinkedPages';
import '../wiki/wiki.css';

/** The selected node's wiki page, editable beside the canvas. */
export default function PagePanel() {
  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const selected = useDiagram((s) => s.selectedNodeIds[0]);
  const mode = useDock((s) => s.mode);
  const setMode = useDock((s) => s.setMode);
  const editing = mode === 'edit';
  const active = useDock((s) => s.page);
  const setPage = useDock((s) => s.setPage);

  const node = nodes.find((n) => n.id === selected);
  const chosen = active && active.selection === selected && (!node || node.pageIds?.includes(active.id))
    ? pages.find((p) => p.id === active.id) : undefined;
  const page = chosen ?? pageOf(node, pages);
  const pageNode = page ? (node?.pageIds?.includes(page.id) ? node : nodesOfPage(nodes, page.id)[0]) : undefined;

  const toPage = (id: string) => {
    const st = useDiagram.getState();
    const targets = nodesOfPage(st.nodes, id);
    const target = targets.find((n) => n.id === selected) ?? targets[0];
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

  if (!node && !page) return null;
  const crumbs = pageNode ? pathTo(nodes, pageNode.id).slice(0, -1) : [];
  return (
    <div className="wk-dock">
      {node && <LinkedPages node={node} pageId={page?.id} onPage={setPage} />}
      {page ? (
        <>
          <div className="wk-dock-head">
            <input
              className="wk-title"
              aria-label="Page title"
              value={page.title}
              placeholder="Untitled"
              onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
            />
            <button className="wk-btn" onClick={() => openWiki(page.id, pageNode?.id)} title="Open in window" aria-label="Open in window">
              ↗
            </button>
          </div>
          <div className="wk-seg" role="tablist" aria-label="Page mode">
            {(['edit', 'read'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {m === 'edit' ? 'Markdown' : 'Preview'}
              </button>
            ))}
          </div>
          {crumbs.length > 0 && (
            <div className="wk-crumbs">
              {crumbs.map((n) => (
                <button key={n.id} className="wk-crumb" onClick={() => toNode(n.id)}>
                  {n.label || 'Group'}
                </button>
              ))}
            </div>
          )}
          {!pageNode && <div className="wk-crumbs">Not linked to a node</div>}
          {editing ? (
            <Editor
              key={page.id}
              value={page.body}
              targets={() => [...new Set([...pages.map((p) => p.title), ...nodes.map((n) => n.label)].filter(Boolean))]}
              onChange={(body) => {
                const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
                if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
              }}
            />
          ) : (
            <div className="wk-read">
              <Preview body={page.body} nodeId={pageNode?.id} onPage={toPage} onNode={toNode} />
            </div>
          )}
        </>
      ) : <div className="wk-empty-links">Create a page or link an existing one.</div>}
    </div>
  );
}
