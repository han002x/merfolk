import { useDiagram } from '../store';
import { linkableNodes, nodesOfPage, pathTo, type LinkKey } from '../pages';
import { deckHref, openNode, pageHref } from '../route';
import Menu from './Menu';

/** Where a page or deck lives on the canvas: its group trail and its linked nodes. */
export default function NodeLinks({ id, nodeId, kind = 'pageIds' }: {
  id: string;
  /** the linked node this window is showing the document on */
  nodeId?: string;
  kind?: LinkKey;
}) {
  const nodes = useDiagram((s) => s.nodes);
  const linked = nodesOfPage(nodes, id, kind);
  const node = linked.find((n) => n.id === nodeId) ?? linked[0];
  const linkable = linkableNodes(nodes, id, kind);
  const decks = kind === 'deckIds';
  const href = decks ? deckHref : pageHref;
  const where = (at: string) => pathTo(nodes, at).map((n) => n.label || 'Untitled').join(' › ');
  const go = (at: string) => {
    window.location.hash = href(id, at);
  };

  return <>
    {node && pathTo(nodes, node.id).slice(0, -1).map((n) => (
      <button key={n.id} className="wk-crumb" title="Show on canvas" onClick={() => openNode(n.id)}>
        {n.label || 'Group'}
      </button>
    ))}
    <Menu className="wk-crumb" label={node ? `Linked to ${node.label || 'Untitled'}` : 'Link to node'}
      button={<>
        {node ? node.label || 'Untitled' : 'Link to node'}
        {linked.length > 1 && <small>+{linked.length - 1}</small>}
        <span aria-hidden="true">⌄</span>
      </>}>
      {linked.map((n) => <div key={n.id} className="wk-menu-row">
        <button role="menuitemradio" aria-checked={n.id === node?.id} onClick={() => go(n.id)}>
          <span>{where(n.id)}</span>
        </button>
        <button aria-label={`Unlink from ${n.label || 'Untitled'}`} title="Unlink"
          onClick={() => useDiagram.getState()[decks ? 'unlinkDeck' : 'unlinkPage'](id, n.id)}>×</button>
      </div>)}
      {linked.length > 0 && linkable.length > 0 && <>
        <hr />
        <div className="wk-menu-label">Link to node</div>
      </>}
      {linkable.map((n) => <button key={n.id} role="menuitem" onClick={() => {
        useDiagram.getState()[decks ? 'linkDeck' : 'linkPage'](id, n.id);
        go(n.id);
      }}>
        <span>{where(n.id)}</span>
      </button>)}
      {linked.length + linkable.length === 0 && <div className="wk-menu-label">No nodes on the canvas</div>}
    </Menu>
  </>;
}
