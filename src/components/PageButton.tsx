import { useDiagram } from '../store';
import { showPage } from '../dock';
import { Icon } from './Icon';

/** Drill down: open the node's wiki page in its own window, creating it first. */
export function PageButton({ nodeId }: { nodeId: string }) {
  const has = useDiagram((s) => !!s.nodes.find((n) => n.id === nodeId)?.pageId);
  return (
    <button
      className={`mf-page nodrag nopan${has ? ' has-page' : ''}`}
      aria-label="Open page"
      title="Page  ·  W"
      onClick={(e) => {
        e.stopPropagation();
        showPage(nodeId);
      }}
    >
      <Icon name="page" size={13} />
    </button>
  );
}
