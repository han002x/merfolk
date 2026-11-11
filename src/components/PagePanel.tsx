import { useState } from 'react';
import { useDiagram } from '../store';
import { nodeOfPage, orphanPages, pageOf, pathTo } from '../pages';
import { nodeHref, openWiki } from '../route';
import Editor from '../wiki/Editor';
import Preview from '../wiki/Preview';
import '../wiki/wiki.css';

/** The selected node's wiki page, editable beside the canvas. */
export default function PagePanel() {
  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const selected = useDiagram((s) => s.selectedNodeIds[0]);
  const [editing, setEditing] = useState(true);
  // a page reached by a link that has no node to select; dropped when selection moves
  const [pinned, setPinned] = useState<{ sel?: string; id: string } | null>(null);

  const node = nodes.find((n) => n.id === selected);
  const pinnedPage = pinned && pinned.sel === selected ? pages.find((p) => p.id === pinned.id) : undefined;
  const page = pinnedPage ?? pageOf(node, pages);
  const pageNode = page ? nodeOfPage(nodes, page.id) : undefined;
  const orphan = page ? orphanPages(nodes, pages).some((p) => p.id === page.id) : false;

  const toPage = (id: string) => {
    const target = nodeOfPage(useDiagram.getState().nodes, id);
    if (target) window.location.hash = nodeHref(target.id);
    else setPinned({ sel: selected, id });
  };
  const toNode = (id: string) => {
    window.location.hash = nodeHref(id);
  };

  if (!node && !page) return null;
  if (!page)
    return (
      <div className="wk-dock">
        <button className="wk-btn" onClick={() => useDiagram.getState().openPage(node!.id)}>
          Create page
        </button>
      </div>
    );

  const crumbs = pageNode ? pathTo(nodes, pageNode.id).slice(0, -1) : [];
  return (
    <div className="wk-dock">
      <div className="wk-dock-head">
        <input
          className="wk-title"
          value={page.title}
          placeholder="Untitled"
          onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
        />
        <button className="wk-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Read' : 'Edit'}
        </button>
        <button className="wk-btn" onClick={() => openWiki(page.id)} title="Open in window">
          ↗
        </button>
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
      {orphan && !node && <div className="wk-crumbs">Not linked to a node</div>}
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
    </div>
  );
}
