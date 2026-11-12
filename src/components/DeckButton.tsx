import { useDiagram } from '../store';
import { showDeck } from '../dock';
import { Icon } from './Icon';

/** Open the node's default slide deck in the side panel, creating it first. */
export function DeckButton({ nodeId }: { nodeId: string }) {
  const has = useDiagram((s) => !!s.nodes.find((n) => n.id === nodeId)?.deckIds?.length);
  return (
    <button
      className={`mf-page mf-deck nodrag nopan${has ? ' has-page' : ''}`}
      aria-label="Open slides"
      title="Slides  ·  K"
      onClick={(e) => {
        e.stopPropagation();
        showDeck(nodeId);
      }}
    >
      <Icon name="deck" size={13} />
    </button>
  );
}
