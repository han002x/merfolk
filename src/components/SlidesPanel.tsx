import { useMemo } from 'react';
import { useDiagram } from '../store';
import { useDock } from '../dock';
import { nodesOfPage, pageOf, pathTo } from '../pages';
import { splitSlides } from '../slides';
import { deckHref, nodeHref, openSlides } from '../route';
import { write } from '../persist';
import Menu from '../wiki/Menu';
import Navigation from '../wiki/Navigation';
import SourceEditor from '../wiki/SourceEditor';
import Slide from '../slides/Slide';
import '../wiki/wiki.css';
import '../slides/slides.css';

const useSlides = (body: string) => useMemo(() => splitSlides(body).slides, [body]);
const saveForWindow = () => {
  const { nodes, edges, pages, decks } = useDiagram.getState();
  write({ nodes, edges, pages, decks });
};

/** The selected node's slide deck beside the canvas: its slides, or its Markdown. */
export default function SlidesPanel() {
  const nodes = useDiagram((s) => s.nodes);
  const decks = useDiagram((s) => s.decks);
  const selected = useDiagram((s) => s.selectedNodeIds[0]);
  const mode = useDock((s) => s.deckMode);
  const setMode = useDock((s) => s.setDeckMode);
  const active = useDock((s) => s.deck);
  const setDeck = useDock((s) => s.setDeck);

  const node = nodes.find((n) => n.id === selected);
  const chosen = active && active.selection === selected && (!node || node.deckIds?.includes(active.id))
    ? decks.find((d) => d.id === active.id) : undefined;
  const deck = chosen ?? pageOf(node, decks, 'deckIds');
  const deckNode = deck ? (node?.deckIds?.includes(deck.id) ? node : nodesOfPage(nodes, deck.id, 'deckIds')[0]) : undefined;
  const slides = useSlides(deck?.body ?? '');

  /** Show a deck on one of its nodes, or on its own when it has none. */
  const open = (id: string, nodeId?: string) => {
    const st = useDiagram.getState();
    const targets = nodesOfPage(st.nodes, id, 'deckIds');
    const target = targets.find((n) => n.id === (nodeId ?? selected)) ?? targets[0];
    if (target) {
      st.setSelection([target.id], []);
      useDock.setState({ deck: { selection: target.id, id } });
      if (target.id !== selected) window.location.hash = nodeHref(target.id);
    } else {
      st.setSelection([], []);
      setDeck(id);
    }
  };

  // nothing selected: the tab is the way into every deck
  if (!deck && !node) {
    return (
      <div className="wk-dock">
        <Navigation kind="deckIds" nodes={nodes} pages={decks} pageId={null} nodeId={undefined} onPage={open}
          empty="Select a node to write its slides" />
      </div>
    );
  }

  const ids = node?.deckIds ?? [];
  const available = decks.filter((d) => !ids.includes(d.id)).sort((a, b) => a.title.localeCompare(b.title));
  const create = () => node && setDeck(useDiagram.getState().createDeckForNode(node.id));
  const link = (id: string) => {
    if (!node) return;
    useDiagram.getState().linkDeck(id, node.id);
    setDeck(id);
  };

  if (!deck) {
    return (
      <div className="wk-dock wk-dock-empty">
        <button className="wk-btn" onClick={create}>New deck</button>
        {available.length > 0 && <div className="wk-menu-label">Link existing deck</div>}
        {available.map((d) => (
          <button key={d.id} className="wk-item" onClick={() => link(d.id)}>
            <span>{d.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
    );
  }

  const crumbs = deckNode ? pathTo(nodes, deckNode.id).slice(0, -1) : [];
  return (
    <div className="wk-dock">
      <div className="wk-dock-bar">
        <div className="wk-crumbs">
          {!node && <button className="wk-crumb" onClick={() => setDeck(null)}>Decks</button>}
          {node && crumbs.map((n) => (
            <button key={n.id} className="wk-crumb" onClick={() => { window.location.hash = nodeHref(n.id); }}>
              {n.label || 'Group'}
            </button>
          ))}
        </div>
        <div className="wk-seg" role="tablist" aria-label="Deck mode">
          {(['slides', 'source'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
              {m === 'slides' ? 'Slides' : 'Markdown'}
            </button>
          ))}
        </div>
      </div>
      <div className="wk-dock-head">
        <input
          className="wk-title"
          aria-label="Deck title"
          value={deck.title}
          placeholder="Untitled"
          onChange={(e) => useDiagram.getState().updateDeck(deck.id, { title: e.target.value })}
        />
        {node && (
          <Menu className="wk-icon" align="end" label="Decks on this node" button="⌄">
            {ids.map((id, i) => (
              <button key={id} role="menuitemradio" aria-checked={id === deck.id} onClick={() => setDeck(id)}>
                <span>{decks.find((d) => d.id === id)?.title || 'Untitled'}</span>
                {i === 0 && ids.length > 1 && <small>default</small>}
              </button>
            ))}
            <hr />
            <button role="menuitem" onClick={create}>New deck</button>
            {deck.id !== ids[0] && (
              <button role="menuitem" onClick={() => useDiagram.getState().makeDefaultDeck(deck.id, node.id)}>
                Make default
              </button>
            )}
            <button role="menuitem" onClick={() => {
              useDiagram.getState().unlinkDeck(deck.id, node.id);
              setDeck(null);
            }}>
              <span>Unlink from {node.label || 'this node'}</span>
            </button>
            {available.length > 0 && <>
              <hr />
              <div className="wk-menu-label">Link existing deck</div>
            </>}
            {available.map((d) => (
              <button key={d.id} role="menuitem" onClick={() => link(d.id)}>
                <span>{d.title || 'Untitled'}</span>
              </button>
            ))}
          </Menu>
        )}
        <button className="wk-icon" onClick={() => {
          saveForWindow();
          openSlides(deck.id, deckNode?.id);
        }} title="Open in slides" aria-label="Open in slides">
          ↗
        </button>
      </div>
      {mode === 'source' ? (
        <SourceEditor
          key={deck.id}
          value={deck.body}
          targets={() => [...new Set([...useDiagram.getState().pages.map((p) => p.title), ...nodes.map((n) => n.label)].filter(Boolean))]}
          onChange={(body) => {
            const cur = useDiagram.getState().decks.find((d) => d.id === deck.id);
            if (cur && cur.body !== body) useDiagram.getState().updateDeck(deck.id, { body });
          }}
        />
      ) : (
        <ol className="sl-strip sl-dock-strip" aria-label="Slides">
          {slides.map((s, i) => (
            <li key={i}>
              <div className="sl-tools">
                {/* a slide's number presents from that slide, in the slides window */}
                <a className="sl-number" href={deckHref(deck.id, deckNode?.id, i + 1)} target="marmerlade-slides"
                  onClick={saveForWindow}
                  title="Present from here" aria-label={`Present from slide ${i + 1}`}>
                  {i + 1}
                </a>
              </div>
              <Slide slide={s} nodeId={deckNode?.id} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
