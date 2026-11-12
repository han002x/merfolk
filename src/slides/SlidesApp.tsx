import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { restore, startAutosave, startSync } from '../persist';
import { toggleTheme, useTheme } from '../theme';
import { nodesOfPage, pathTo } from '../pages';
import {
  addBox, BLOCKS, boxCaret, deckFileName, duplicateBox, editSlides, insertBlock, removeBox, setBox, setBoxContent, setDeckStyle, setSlideStyle,
  hasText, LAYOUTS, moveSlide, orderBox, slideAt, slideBoxes, slideCaret, splitSlides, toMarkdown,
  type Box, type SlideEdit,
} from '../slides';
import { EMBED_MAX_SIDE, readImageFile } from '../imageUpload';
import { dragged, dragMode, RESIZE_HANDLES, type DragMode, type Point } from './drag';
import { isTyping } from '../useHotkeys';
import { BoxBar, StylePanel } from './Design';
import { deckHref, openNode } from '../route';
import { Icon } from '../components/Icon';
import Menu from '../wiki/Menu';
import Navigation from '../wiki/Navigation';
import NodeLinks from '../wiki/NodeLinks';
import SourceEditor, { type SourceHistory } from '../wiki/SourceEditor';
import ObjectSelection from './ObjectSelection';
import Present from './Present';
import Slide from './Slide';
import '../wiki/wiki.css';
import './slides.css';

const SHAPE_TOOLS = [
  { shape: 'rect', label: 'Rectangle', icon: 'rect' },
  { shape: 'round', label: 'Rounded rectangle', icon: 'round' },
  { shape: 'ellipse', label: 'Ellipse', icon: 'circle' },
  { shape: 'line', label: 'Line', icon: 'line' },
  { shape: 'arrow', label: 'Arrow', icon: 'arrow' },
] as const;
const BLOCK_TOOLS = [
  { name: 'Diagram', icon: 'shapes' },
  { name: 'Mermaid', icon: 'group' },
  { name: 'Table', icon: 'grid' },
  { name: 'Code', icon: 'code' },
  { name: 'Speaker note', icon: 'page' },
] as const;

const useSlides = (body: string) => useMemo(() => splitSlides(body).slides, [body]);

export default function SlidesApp({ deckId, nodeId, slide, presenter }: {
  deckId: string | null;
  nodeId?: string;
  /** set while presenting: the 1-based slide on show */
  slide?: number;
  /** this window is the speaker's view of a presentation running in another */
  presenter?: boolean;
}) {
  // load the saved diagram before the first paint, then follow the canvas window
  useState(() => restore());
  useEffect(() => {
    const stops = [startAutosave(), startSync()];
    return () => stops.forEach((stop) => stop());
  }, []);

  const nodes = useDiagram((s) => s.nodes);
  const decks = useDiagram((s) => s.decks);
  const deck = decks.find((d) => d.id === deckId);
  const deckNodes = deck ? nodesOfPage(nodes, deck.id, 'deckIds') : [];
  const node = deckNodes.find((n) => n.id === nodeId) ?? deckNodes[0];
  const theme = useTheme();
  const body = deck?.body ?? '';
  const slides = useSlides(body);
  // the narrow-screen index closes itself once a deck is chosen
  const [index, setIndex] = useState<{ at: string | null } | null>(null);
  const indexOpen = index !== null && index.at === deckId;
  const where = (id: string) => pathTo(nodes, id).map((n) => n.label || 'Untitled').join(' › ');

  useEffect(() => {
    document.title = deck ? `${deck.title || 'Untitled'} · merfolk` : 'Slides · merfolk';
  }, [deck]);

  const targets = useCallback(() => {
    const st = useDiagram.getState();
    const names = [...st.pages.map((p) => p.title), ...st.nodes.map((n) => n.label)];
    return [...new Set(names.filter(Boolean))];
  }, []);

  // the caret says which slide is being written; slide tools move it
  const [caret, setCaret] = useState(0);
  const [panel, setPanel] = useState<'style' | 'source'>('style');
  const work = useRef<HTMLDivElement>(null);
  const [workWidth, setWorkWidth] = useState(0);
  const [inspectorWidth, setInspectorWidth] = useState<number | null>(null);
  const resize = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const minWidth = 280;
  const maxWidth = Math.max(minWidth, workWidth - 320);
  const clampWidth = (width: number) => Math.min(maxWidth, Math.max(minWidth, width));
  const panelWidth = clampWidth(inspectorWidth ?? workWidth * 0.42);
  const workStyle: React.CSSProperties & { '--sl-panel-width': string } = { '--sl-panel-width': `${panelWidth}px` };
  useEffect(() => {
    const el = work.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWorkWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [deckId, slide]);
  const [jump, setJump] = useState<{ offset: number; focus?: boolean }>();
  const current = slideAt(body, caret);
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    strip.current?.children[current]?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  // the text box or shape picked on the current slide, by its place among the slide's objects
  const [picked, setPicked] = useState<{ slide: number; box: number }>();
  const [editing, setEditing] = useState(false);
  const sourceHistory = useRef<SourceHistory>(null);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const box = picked?.slide === current ? slideBoxes(body, current)[picked.box] : undefined;
  const boxAt = box ? picked!.box : -1;
  useEffect(() => {
    strip.current?.querySelectorAll('.box.selected').forEach((el) => el.classList.remove('selected'));
    if (boxAt >= 0) strip.current?.children[current]?.querySelectorAll('.sl-slide .box')[boxAt]?.classList.add('selected');
  }, [body, current, boxAt]);

  const write = (next: string) => {
    if (deck) useDiagram.getState().updateDeck(deck.id, { body: next });
  };
  const reshape = (patch: Partial<Box>) => write(setBox(body, current, boxAt, patch));
  const discard = () => {
    write(removeBox(body, current, boxAt));
    setPicked(undefined);
  };
  const duplicate = () => {
    const next = duplicateBox(body, current, boxAt);
    write(next.body);
    setPicked({ slide: current, box: next.box });
  };
  const editText = () => {
    if (box && hasText(box.shape)) setEditing(true);
  };
  const travel = (back: boolean) => {
    setPicked(undefined);
    if (back) sourceHistory.current?.undo();
    else sourceHistory.current?.redo();
  };

  // with an object picked, the keyboard moves and removes it
  const keys = useRef({ box, reshape, discard, duplicate, editText, travel, current, body });
  useEffect(() => {
    keys.current = { box, reshape, discard, duplicate, editText, travel, current, body };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { box, reshape, discard, duplicate, editText, travel, current, body } = keys.current;
      if (isTyping(e.target) || e.altKey || slide) return;
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          e.preventDefault();
          travel(key === 'z' && !e.shiftKey);
        } else if (key === 'd' && box) {
          e.preventDefault();
          duplicate();
        }
        return;
      }
      if (e.key === 'Tab' && e.target instanceof Element && e.target.closest('.sl-sheet')) {
        const count = slideBoxes(body, current).length;
        if (count) {
          e.preventDefault();
          const at = picked?.slide === current ? picked.box : (e.shiftKey ? 0 : -1);
          setPicked({ slide: current, box: (at + (e.shiftKey ? -1 : 1) + count) % count });
        }
        return;
      }
      if (!box || (e.target instanceof Element && e.target.closest('button, [role="separator"], [role="menu"]'))) return;
      const step = e.shiftKey ? 5 : 1;
      const run = ({
        Delete: discard,
        Backspace: discard,
        Escape: () => setPicked(undefined),
        Enter: editText,
        F2: editText,
        ArrowLeft: () => reshape({ left: box.left - step }),
        ArrowRight: () => reshape({ left: box.left + step }),
        ArrowUp: () => reshape({ top: box.top - step }),
        ArrowDown: () => reshape({ top: box.top + step }),
      } as Record<string, (() => void) | undefined>)[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, slide]);

  /** a drag in progress: where it began and what it has made of the object */
  const drag = useRef<{
    el: HTMLElement; stage: Element; mode: DragMode; start: Point; frame: DOMRect;
    from: Box; others: Box[]; to?: Partial<Box>; guides: HTMLElement[]; slide: number; box: number; controls: HTMLElement | null;
  }>(undefined);
  /** the slide being dragged to a new place in the strip, and the slide it is over */
  const [moving, setMoving] = useState<{ from: number; over: number }>();
  const file = useRef<HTMLInputElement>(null);

  const held = useRef(false);

  if (deck && slide) return <Present deckId={deck.id} nodeId={node?.id} slides={slides} slide={slide} presenter={presenter} />;

  const create = () => {
    window.location.hash = deckHref(useDiagram.getState().createDeck(''));
  };

  const remove = () => {
    if (!deck) return;
    if (deck.body.trim() && !window.confirm(`Delete "${deck.title || 'Untitled'}"?`)) return;
    window.location.hash = '#/slides';
    useDiagram.getState().deleteDeck(deck.id);
  };

  const focusSource = (offset: number) => {
    setPanel('source');
    setJump({ offset });
  };

  const rewrite = (next: { body: string; caret: number }) => {
    if (!deck) return;
    useDiagram.getState().updateDeck(deck.id, { body: next.body });
    setCaret(next.caret);
    focusSource(next.caret);
  };
  const edit = (kind: SlideEdit, at: number) => rewrite(editSlides(body, kind, at));
  const place = (shape?: Box['shape'], src?: string) => {
    const next = addBox(body, current, shape, src);
    write(next.body);
    setCaret(slideCaret(next.body, current));
    setPicked({ slide: current, box: next.box });
    setEditing(false);
    strip.current?.children[current]?.querySelector<HTMLElement>('.sl-sheet')?.focus({ preventScroll: true });
  };

  // objects are placed by hand: drag to move, the corner to resize, the knob above to turn
  const grab = (e: React.PointerEvent<HTMLDivElement>, at: number) => {
    if (!(e.target instanceof Element) || e.target.closest('.editing')) return;
    const handle = e.target.closest<HTMLElement>('[data-drag]')?.dataset.drag;
    const stage = e.currentTarget.querySelector('.sl-slide');
    const el = handle ? stage?.querySelector<HTMLElement>('.box.selected') : e.target.closest<HTMLElement>('.box');
    if (!el || !stage || e.button !== 0) return;
    const all = slideBoxes(body, at);
    const k = [...stage.querySelectorAll('.box')].indexOf(el);
    const from = all[k];
    if (!from) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    if (at !== current) {
      const offset = slideCaret(body, at);
      setCaret(offset);
      setJump({ offset, focus: false });
    }
    setPicked({ slide: at, box: k });
    const frame = stage.getBoundingClientRect();
    const start = { x: e.clientX - frame.left, y: e.clientY - frame.top };
    const guides = ['v', 'h'].map((side) => {
      const line = document.createElement('i');
      line.className = `sl-guide ${side}`;
      line.hidden = true;
      return stage.appendChild(line);
    });
    drag.current = {
      el, stage, start, frame, from, guides, slide: at, box: k,
      controls: e.currentTarget.querySelector<HTMLElement>('.sl-selection'),
      mode: handle === 'rotate' ? 'rotate' : RESIZE_HANDLES.find((h) => h === handle)
        ?? dragMode(from, { w: frame.width, h: frame.height }, start, el.classList.contains('selected')),
      others: all.filter((_, i) => i !== k),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pull = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = { x: e.clientX - d.frame.left, y: e.clientY - d.frame.top };
    if (!d.to && Math.abs(now.x - d.start.x) + Math.abs(now.y - d.start.y) < 3) return;
    const next = dragged(d.mode, d.from, d.others, { w: d.frame.width, h: d.frame.height }, d.start, now, e.shiftKey);
    d.to = next.to;
    // show it under the pointer now; the Markdown is written once, on release
    const shown = { ...d.from, ...next.to };
    d.el = d.stage.querySelectorAll<HTMLElement>('.box')[d.box] ?? d.el;
    d.controls = d.stage.parentElement?.querySelector<HTMLElement>('.sl-selection') ?? null;
    for (const key of ['left', 'top', 'width', 'height'] as const) d.el.style.setProperty(key, `${shown[key]}%`);
    d.el.style.transform = shown.rotate ? `rotate(${shown.rotate}deg)` : '';
    if (d.controls) {
      for (const key of ['left', 'top', 'width', 'height'] as const) d.controls.style.setProperty(key, `${shown[key]}%`);
      d.controls.style.transform = d.el.style.transform;
    }
    const [v, h] = d.guides;
    v.hidden = next.guides.x === undefined;
    h.hidden = next.guides.y === undefined;
    v.style.left = `${next.guides.x}%`;
    h.style.top = `${next.guides.y}%`;
  };
  const drop = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = undefined;
    d.guides.forEach((line) => line.remove());
    // the click that ends a grab lands on this wrapper (it holds the pointer), not on the object
    held.current = e.type === 'pointerup';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.to) {
      const next = e.type !== 'pointerup' ? d.from : { ...d.from, ...d.to };
      for (const target of [d.el, d.controls]) {
        if (!target) continue;
        for (const key of ['left', 'top', 'width', 'height'] as const) target.style.setProperty(key, `${next[key]}%`);
        target.style.transform = next.rotate ? `rotate(${next.rotate}deg)` : '';
      }
      if (e.type === 'pointerup') write(setBox(body, d.slide, d.box, d.to));
    }
  };
  const select = (at: number) => {
    setEditing(false);
    setCaret(slideCaret(body, at));
    setJump({ offset: slideCaret(body, at), focus: panel === 'source' });
  };

  const download = () => {
    if (!deck) return;
    const { nodes, edges } = useDiagram.getState();
    const url = URL.createObjectURL(new Blob([toMarkdown(deck, { nodes, edges }, node?.id)], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = deckFileName(deck);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`wk${indexOpen ? ' nav-open' : ''}`}>
      <aside className="wk-index">
        <div className="wk-index-head">
          <a className="wk-brand" href="#/slides">Slides</a>
          <button className="wk-icon" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          <button className="wk-icon" onClick={create} title="New deck" aria-label="New deck">
            <Icon name="plus" size={15} />
          </button>
        </div>
        <Navigation kind="deckIds" nodes={nodes} pages={decks} pageId={deckId} nodeId={node?.id} empty="No decks yet" />
      </aside>
      <button className="wk-scrim" aria-label="Close decks" onClick={() => setIndex(null)} />

      <main className="wk-main">
        <header className="wk-bar">
          <button className="wk-btn wk-nav-toggle" aria-expanded={indexOpen}
            onClick={() => setIndex(indexOpen ? null : { at: deckId })}>
            Decks
          </button>
          <nav className="wk-crumbs" aria-label="Linked nodes">
            {deck && <NodeLinks kind="deckIds" id={deck.id} nodeId={nodeId} />}
          </nav>
          {deck && <>
            <Menu align="end" label="New slide" button={<><Icon name="plus" size={13} />Slide</>} className="wk-btn sl-go">
              <button role="menuitem" onClick={() => edit('add', current)}>Blank</button>
              <hr />
              {Object.entries(LAYOUTS).map(([name, content]) => (
                <button key={name} role="menuitem" onClick={() => rewrite(editSlides(body, 'add', current, content))}>{name}</button>
              ))}
            </Menu>
            <a className="wk-btn sl-go" href={deckHref(deck.id, node?.id, current + 1)}>
              <Icon name="play" size={13} />
              Present
            </a>
            <Menu className="wk-icon" align="end" label="Deck actions" button={<Icon name="more" size={16} />}>
              <button role="menuitem" onClick={download}>Export Markdown</button>
              {node && <button role="menuitem" onClick={() => openNode(node.id)}>Show on canvas</button>}
              <button role="menuitem" className="danger" onClick={remove}>Delete deck</button>
            </Menu>
          </>}
        </header>

        {deck ? (
          <div className="sl-work" ref={work} style={workStyle}>
            <section className="sl-canvas" aria-label="Slide editor">
              <div className="sl-toolbar" role="toolbar" aria-label="Slide tools"
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                  const at = buttons.findIndex((button) => button === document.activeElement);
                  const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
                    : (at + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                  buttons[next]?.focus();
                }}>
                <div className="sl-tool-group" role="group" aria-label="Edit history">
                  <button type="button" className="wk-icon" aria-label="Undo" title="Undo · Ctrl/⌘Z" disabled={!historyState.undo} onClick={() => travel(true)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14" /></svg>
                  </button>
                  <button type="button" className="wk-icon" aria-label="Redo" title="Redo · Ctrl/⌘Shift+Z" disabled={!historyState.redo} onClick={() => travel(false)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14" /></svg>
                  </button>
                </div>
                <div className="sl-tool-group" role="group" aria-label="Text and shapes">
                  <button type="button" className="wk-icon" aria-label="Text box" title="Text box" onClick={() => place()}>
                    <Icon name="text" />
                  </button>
                  {SHAPE_TOOLS.map(({ shape, label, icon }) => (
                    <button key={shape} type="button" className="wk-icon" aria-label={label} title={label} onClick={() => place(shape)}>
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
                <div className="sl-tool-group" role="group" aria-label="Images">
                  <button type="button" className="wk-icon" aria-label="Image from file" title="Image from file" onClick={() => file.current?.click()}>
                    <Icon name="image" />
                  </button>
                  <button type="button" className="wk-icon" aria-label="Image from link" title="Image from link" onClick={() => {
                    const src = window.prompt('Image address')?.trim();
                    if (src) place('image', src);
                  }}>
                    <Icon name="link" />
                  </button>
                </div>
                <div className="sl-tool-group" role="group" aria-label="Content">
                  {BLOCK_TOOLS.map(({ name, icon }) => (
                    <button key={name} type="button" className="wk-icon" aria-label={name} title={name}
                      onClick={() => rewrite(insertBlock(body, caret, BLOCKS[name]))}>
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
              </div>
              <input ref={file} type="file" accept="image/*" hidden aria-label="Image file" onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = '';
                if (picked) void readImageFile(picked, EMBED_MAX_SIDE).then((image) => place('image', image.src), () => undefined);
              }} />
              <ol className="sl-strip" aria-label="Slides" ref={strip}>
                {slides.map((s, i) => (
                  <li key={i} aria-current={i === current ? 'true' : undefined}
                    className={moving?.over === i && moving.from !== i ? (moving.from < i ? 'drop-after' : 'drop-before') : undefined}
                    onDragOver={(e) => {
                      if (!moving) return;
                      e.preventDefault();
                      if (moving.over !== i) setMoving({ from: moving.from, over: i });
                    }}
                    onDrop={(e) => {
                      if (!moving) return;
                      e.preventDefault();
                      setMoving(undefined);
                      setPicked(undefined);
                      rewrite(moveSlide(body, moving.from, i));
                    }}>
                    {/* drag a slide by its number to reorder */}
                    <div className="sl-tools" draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(i + 1));
                        setMoving({ from: i, over: i });
                      }}
                      onDragEnd={() => setMoving(undefined)}>
                      <a className="sl-number" draggable={false} href={deckHref(deck.id, node?.id, i + 1)}
                        title="Present from here" aria-label={`Present from slide ${i + 1}`}>
                        {i + 1}
                      </a>
                      <Menu className="wk-icon" label={`Slide ${i + 1} actions`} button={<Icon name="more" size={14} />}>
                        <button role="menuitem" onClick={() => edit('add', i)}>Add slide after</button>
                        <button role="menuitem" onClick={() => edit('duplicate', i)}>Duplicate</button>
                        <button role="menuitem" disabled={i === 0} onClick={() => edit('up', i)}>Move up</button>
                        <button role="menuitem" disabled={i === slides.length - 1} onClick={() => edit('down', i)}>Move down</button>
                        <button role="menuitem" className="danger" onClick={() => edit('remove', i)}>Delete slide</button>
                      </Menu>
                    </div>
                    {/* clicking a slide takes the caret to its source; its objects are picked up instead */}
                    <div className="sl-slide-editor">
                      <div className="sl-object-tools">
                        {i === current && box && <BoxBar box={box} onChange={reshape} onRemove={discard} editable={hasText(box.shape)}
                          onOrder={(to) => {
                            const next = orderBox(body, current, boxAt, to);
                            write(next.body);
                            setPicked({ slide: current, box: next.box });
                          }}
                          onText={editText} onDuplicate={duplicate}
                          onSource={() => focusSource(boxCaret(body, current, boxAt) ?? caret)} />}
                      </div>
                      <div className="sl-sheet" tabIndex={0} role="group" aria-label={`Slide ${i + 1} canvas`}
                        onPointerDown={(e) => grab(e, i)} onPointerMove={pull} onPointerUp={drop} onPointerCancel={drop} onLostPointerCapture={drop}
                        onDoubleClick={(e) => {
                          if (!box || !(e.target instanceof Element) || e.target.closest('.editing, [data-drag]')) return;
                          editText();
                        }}
                        onClick={(e) => {
                          const grabbed = held.current;
                          held.current = false;
                          // a menu is drawn elsewhere on the page, yet its clicks still bubble here
                          if (grabbed || !(e.target instanceof Element) || !e.currentTarget.contains(e.target)) return;
                          if (e.target.closest('a, .node, .box, .sl-boxbar')) return;
                          setPicked(undefined);
                          select(i);
                        }}>
                        <Slide slide={s} nodeId={node?.id} />
                        {i === current && box && <ObjectSelection key={`${deck.id}:${i}:${boxAt}`} box={box} index={boxAt} editing={editing}
                          onCommit={(html) => {
                            setEditing(false);
                            const latest = useDiagram.getState().decks.find((d) => d.id === deck.id);
                            if (latest) write(setBoxContent(latest.body, i, boxAt, html));
                          }} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <aside className="sl-inspector" id="slide-settings" aria-label="Slide settings">
              <div className="sl-panel-resize" role="separator" tabIndex={0} aria-label="Resize right panel"
                aria-orientation="vertical" aria-controls="slide-settings" aria-valuemin={minWidth} aria-valuemax={maxWidth}
                aria-valuenow={Math.round(panelWidth)} aria-valuetext={`${Math.round(panelWidth)} pixels`}
                title="Drag to resize · Double-click to reset"
                onPointerDown={(e) => {
                  if (e.button !== 0 || !e.isPrimary) return;
                  e.preventDefault();
                  e.currentTarget.focus();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  resize.current = { pointerId: e.pointerId, x: e.clientX, width: panelWidth };
                }}
                onPointerMove={(e) => {
                  const start = resize.current;
                  if (start?.pointerId === e.pointerId) setInspectorWidth(clampWidth(start.width + start.x - e.clientX));
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={() => { resize.current = null; }}
                onLostPointerCapture={() => { resize.current = null; }}
                onDoubleClick={() => setInspectorWidth(null)}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const step = e.shiftKey ? 50 : 10;
                  const next = e.key === 'Home' ? minWidth : e.key === 'End' ? maxWidth
                    : panelWidth + (e.key === 'ArrowLeft' ? step : -step);
                  setInspectorWidth(clampWidth(next));
                }} />
              <input
                className="wk-title"
                aria-label="Deck title"
                value={deck.title}
                placeholder="Untitled"
                onChange={(e) => useDiagram.getState().updateDeck(deck.id, { title: e.target.value })}
              />
              <div className="sl-panel-tabs wk-seg" role="tablist" aria-label="Slide settings"
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const next = e.key === 'Home' ? 'style' : e.key === 'End' ? 'source' : panel === 'style' ? 'source' : 'style';
                  setPanel(next);
                  e.currentTarget.querySelector<HTMLButtonElement>(`#slide-${next}-tab`)?.focus();
                }}>
                <button type="button" role="tab" id="slide-style-tab" aria-controls="slide-style-panel"
                  aria-selected={panel === 'style'} tabIndex={panel === 'style' ? 0 : -1} onClick={() => setPanel('style')}>Style</button>
                <button type="button" role="tab" id="slide-source-tab" aria-controls="slide-source-panel"
                  aria-selected={panel === 'source'} tabIndex={panel === 'source' ? 0 : -1} onClick={() => setPanel('source')}>Source</button>
              </div>
              <section className="sl-style-panel" id="slide-style-panel" role="tabpanel" aria-labelledby="slide-style-tab" hidden={panel !== 'style'}>
                <StylePanel look={slides[current].look}
                  onSlide={(key, value) => write(setSlideStyle(body, current, key, value))}
                  onDeck={(key, value) => write(setDeckStyle(body, key, value))}
                  onTheme={(background, color) => write(setDeckStyle(setDeckStyle(body, 'backgroundColor', background), 'color', color))} />
              </section>
              <section className="sl-source" id="slide-source-panel" role="tabpanel" aria-labelledby="slide-source-tab" hidden={panel !== 'source'}>
                <SourceEditor
                  key={deck.id}
                  value={deck.body}
                  historyRef={sourceHistory}
                  onHistoryChange={setHistoryState}
                  targets={targets}
                  onCaret={setCaret}
                  caret={jump}
                  onChange={(body) => {
                    const cur = useDiagram.getState().decks.find((d) => d.id === deck.id);
                    if (cur && cur.body !== body) useDiagram.getState().updateDeck(deck.id, { body });
                  }}
                />
              </section>
            </aside>
          </div>
        ) : (
          <div className="wk-page-content">
            <div className="wk-list">
              <div className="wk-list-head">
                <h1>Decks</h1>
                <button className="wk-btn" onClick={create}>New deck</button>
              </div>
              <ul>
                {[...decks].sort((a, b) => b.updatedAt - a.updatedAt).map((d) => {
                  const home = nodesOfPage(nodes, d.id, 'deckIds')[0];
                  return <li key={d.id}>
                    <a href={deckHref(d.id, home?.id)}>
                      <span>{d.title || 'Untitled'}</span>
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
