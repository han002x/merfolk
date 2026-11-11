import { useDiagram } from '../store';
import type { DiagramNode } from '../types';

/** Manage one node's ordered page links without changing shared page content. */
export default function LinkedPages({ node, pageId, onPage }: {
  node: DiagramNode;
  pageId?: string;
  onPage: (id: string | null) => void;
}) {
  const pages = useDiagram((s) => s.pages);
  const ids = node.pageIds ?? [];
  const available = pages.filter((p) => !ids.includes(p.id)).sort((a, b) => a.title.localeCompare(b.title));
  const active = pageId && ids.includes(pageId) ? pageId : '';

  const open = (id: string) => onPage(useDiagram.getState().openPage(node.id, id));
  return (
    <div className="wk-links" aria-label="Node pages">
      {ids.length > 0 && (
        <select className="wk-btn wk-page-picker" aria-label="Linked pages" value={active}
          onChange={(e) => open(e.target.value)}>
          <option value="" disabled>Choose page</option>
          {ids.map((id, i) => (
            <option key={id} value={id}>
              {pages.find((p) => p.id === id)?.title || 'Untitled'}{i === 0 ? ' (default)' : ''}
            </option>
          ))}
        </select>
      )}
      <div className="wk-link-actions">
        <button className="wk-btn" onClick={() => onPage(useDiagram.getState().createPageForNode(node.id))}>
          New page
        </button>
        <select className="wk-btn" aria-label="Link existing page" value="" disabled={available.length === 0}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            useDiagram.getState().linkPage(id, node.id);
            onPage(id);
          }}>
          <option value="">Link existing page</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
        </select>
        {active && (
          <>
            {active !== ids[0] && (
              <button className="wk-btn" onClick={() => useDiagram.getState().makeDefaultPage(active, node.id)}>
                Make default
              </button>
            )}
            <button className="wk-btn" onClick={() => {
              const st = useDiagram.getState();
              st.unlinkPage(active, node.id);
              const next = useDiagram.getState().nodes.find((n) => n.id === node.id)?.pageIds?.[0];
              onPage(next ? st.openPage(node.id, next) : null);
            }}>Unlink</button>
          </>
        )}
      </div>
    </div>
  );
}
