import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { toMermaidWithMap } from '../mermaid/io';
import { Icon } from './Icon';
import { TreePanel } from './TreePanel';
import { useDock, type View } from '../dock';
import { usePageBase } from '../pageBase';

const PagePanel = lazy(() => import('./PagePanel'));

const views: View[] = ['mermaid', 'tree', 'page'];
const titles: Record<View, string> = { mermaid: 'Mermaid', tree: 'Tree', page: 'Page' };

export function MermaidPanel({ width, onWidthChange, onClose }: {
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const resize = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const maxWidth = Math.min(Math.max(280, viewportWidth - 240), viewportWidth);
  const minWidth = Math.min(280, maxWidth);
  const clampWidth = (value: number) => Math.min(maxWidth, Math.max(minWidth, value));
  const panelWidth = clampWidth(width);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const autoLayout = useDiagram((s) => s.autoLayout);
  const syncMermaid = useDiagram((s) => s.syncMermaid);
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const highlight = useDiagram((s) => s.highlight);
  const setHighlight = useDiagram((s) => s.setHighlight);
  const setInsertion = useDiagram((s) => s.setInsertion);
  const selectedNodeIds = useDiagram((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDiagram((s) => s.selectedEdgeIds);

  const base = usePageBase((s) => s.base);
  const setBase = usePageBase((s) => s.set);
  const tab = useDock((s) => s.view);
  const setTab = useDock((s) => s.setView);
  const [text, setText] = useState('');
  // line map is only valid while the textarea matches the live diagram; while
  // a parse error stands we null the mapping so stale highlights don't point at
  // wrong lines. On a clean parse the text and canvas agree, so it stays live.
  const [lineRefs, setLineRefs] = useState<Map<number, { kind: 'node' | 'edge'; id: string }>>(
    new Map(),
  );
  // true only while the textarea text does not cleanly map to the live diagram
  // (an in-flight debounce or a standing parse error); gates highlight/gap sync
  const [edited, setEdited] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** boundary index where an insertion caret is shown: caret sits *above* line
   *  `gapLine` (so 0 = before the first line). null when not hovering a gap. */
  const [gapLine, setGapLine] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // the text we last derived from the store, so the store->text effect can tell
  // its own echo (after a sync) from a genuine canvas-side change
  const derivedText = useRef('');

  // keep the editor in sync with the live diagram. This fires for every store
  // change — our own synced edits included. We only push text into the textarea
  // for canvas-origin changes, detected as the derived text changing from its
  // previous value (a drag has no text effect; add/delete/tidy/undo do). A
  // user's own edit leaves the derived text matching what they typed once it
  // syncs, so we never snap their in-progress text to canonical form.
  useEffect(() => {
    const { text: t, lineRefs: refs } = toMermaidWithMap({ nodes, edges });
    setLineRefs(refs);
    const canvasOrigin = t !== derivedText.current;
    derivedText.current = t;
    if (canvasOrigin && !edited) {
      setText(t);
      setErr(null);
    }
    // `base` is read by toMermaidWithMap through io.ts; listing it re-derives the text
  }, [nodes, edges, edited, base]);

  // never leave a preview caret/ghost behind when the panel closes
  useEffect(() => () => {
    setInsertion(null);
    setHighlight(null);
  }, [setInsertion, setHighlight]);

  // An element can have a declaration, a page link, and page metadata.
  const refToLines = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const [line, ref] of lineRefs) {
      const key = `${ref.kind}:${ref.id}`;
      const mapped = m.get(key);
      if (mapped) mapped.push(line);
      else m.set(key, [line]);
    }
    return m;
  }, [lineRefs]);

  const activeLines = useMemo(() => {
    if (edited || !highlight) return [];
    return refToLines.get(`${highlight.kind}:${highlight.id}`) ?? [];
  }, [edited, highlight, refToLines]);

  // lines for the elements selected on the canvas, so a canvas selection
  // highlights the matching editor lines (persistent, unlike the hover above).
  // Suppressed while the text is mid-edit so stale lines don't mismark.
  const selectedLines = useMemo(() => {
    const s = new Set<number>();
    if (edited) return s;
    for (const id of selectedNodeIds) {
      for (const line of refToLines.get(`node:${id}`) ?? []) s.add(line);
    }
    for (const id of selectedEdgeIds) {
      for (const line of refToLines.get(`edge:${id}`) ?? []) s.add(line);
    }
    return s;
  }, [edited, selectedNodeIds, selectedEdgeIds, refToLines]);

  const lines = useMemo(() => text.split('\n'), [text]);

  // debounced live sync: on a clean parse the canvas follows and `edited`
  // clears (re-enabling highlight/gap sync); on a parse error we hold the last
  // good canvas and surface the message inline
  const syncTimer = useRef<number | null>(null);
  const runSync = (src: string) => {
    const res = syncMermaid(src);
    if (res.ok) {
      setErr(null);
      setEdited(false);
    } else {
      setErr(res.error);
    }
  };
  const scheduleSync = (src: string) => {
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null;
      runSync(src);
    }, 400);
  };
  useEffect(
    () => () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    },
    [],
  );

  // Tidy: flush any pending edit, then auto-layout the live diagram
  const tidy = () => {
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = null;
      runSync(text);
    }
    autoLayout('TB');
  };

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  // mirror the textarea's scroll onto the highlight layer
  const syncScroll = () => {
    const ta = textareaRef.current;
    const sc = scrollRef.current;
    if (ta && sc) sc.scrollTop = ta.scrollTop;
  };

  // line height in px — read once from the textarea so hover math matches layout
  const lineHeight = useRef(0);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) lineHeight.current = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  }, []);

  // Gaps a node can be inserted into: after the `flowchart` header and up to
  // the first edge line (node declarations only, so a committed node lands
  // exactly where the caret was shown).
  const gapRange = useMemo(() => {
    let last = lines.length;
    for (const [ln, ref] of lineRefs) if (ref.kind === 'edge' && ln < last) last = ln;
    return { first: 1, last };
  }, [lines, lineRefs]);

  // Hover hit-testing. A gap is only a thin band straddling a line boundary,
  // with hysteresis (easier to stay in than to enter) and a short dwell before
  // the caret shows, so sweeping the pointer across lines just walks the line
  // highlight instead of blinking caret / ghost / highlight on every boundary.
  const GAP_ENTER = 3; // px either side of a boundary to start a gap
  const GAP_EXIT = 6; // px either side of the active boundary to keep it
  const GAP_DWELL = 180; // ms the pointer must rest in the band
  const gapRef = useRef<number | null>(null);
  const dwell = useRef<{ boundary: number; timer: number } | null>(null);

  const cancelDwell = () => {
    if (dwell.current) window.clearTimeout(dwell.current.timer);
    dwell.current = null;
  };
  useEffect(() => cancelDwell, []);

  const showGap = (boundary: number | null) => {
    gapRef.current = boundary;
    setGapLine(boundary);
    if (boundary === null) {
      setInsertion(null);
    } else {
      setHighlight(null);
      setInsertion(neighboursOf(boundary));
    }
  };

  const hoverFromMouse = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (edited) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const padTop = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    const y = e.clientY - ta.getBoundingClientRect().top - padTop + ta.scrollTop;
    const lh = lineHeight.current || 20;

    // stay in the active gap while inside its (wider) exit band
    const active = gapRef.current;
    if (active !== null && Math.abs(y - active * lh) <= GAP_EXIT) return;

    const nearest = Math.round(y / lh);
    const inBand =
      Math.abs(y - nearest * lh) <= GAP_ENTER &&
      nearest >= gapRange.first &&
      nearest <= gapRange.last;

    if (inBand) {
      // leave the current line highlight alone until the pointer settles
      if (active !== null) showGap(null);
      if (dwell.current?.boundary !== nearest) {
        cancelDwell();
        dwell.current = {
          boundary: nearest,
          timer: window.setTimeout(() => {
            dwell.current = null;
            showGap(nearest);
          }, GAP_DWELL),
        };
      }
      return;
    }

    // over a line's body → highlight the element that line renders
    cancelDwell();
    if (active !== null) showGap(null);
    const ref = lineRefs.get(Math.floor(y / lh));
    setHighlight(ref ? { kind: ref.kind, id: ref.id } : null);
  };

  // clicking the shown caret inserts a node there (at the ghost's position)
  const commitInsertion = useDiagram((s) => s.commitInsertion);
  const setSelection = useDiagram((s) => s.setSelection);
  const insertAtGap = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (edited || gapRef.current === null || e.button !== 0) return;
    e.preventDefault(); // don't move the text caret / start a selection
    const id = commitInsertion();
    gapRef.current = null;
    setGapLine(null);
    if (id) {
      setSelection([id], []);
      setHighlight({ kind: 'node', id });
    }
  };

  // the sibling nodes declared just above and just below `boundary`, so the
  // canvas can place the ghost between them. Subgraphs are respected: a whole
  // subgraph above the gap counts as one sibling (its group node), and the
  // `end` of the enclosing subgraph stops the search below (null = the gap is
  // the last slot in its scope / before everything).
  const neighboursOf = (boundary: number) => {
    const isEnd = (ln: number) => lines[ln]?.trim() === 'end';
    const nodeAt = (ln: number) => {
      const ref = lineRefs.get(ln);
      return ref?.kind === 'node' ? ref.id : null;
    };

    let afterNodeId: string | null = null;
    let depth = 0; // subgraphs closed between here and the gap, walking up
    for (let ln = boundary - 1; ln >= 0; ln--) {
      if (isEnd(ln)) {
        depth++;
        continue;
      }
      const id = nodeAt(ln);
      if (id === null) continue;
      // a subgraph opener belongs to an `end` we passed: that is the sibling
      if (depth > 0 && lines[ln].trim().startsWith('subgraph')) depth--;
      if (depth === 0) {
        afterNodeId = id;
        break;
      }
    }

    let beforeNodeId: string | null = null;
    for (let ln = boundary; ln < lines.length; ln++) {
      if (isEnd(ln)) break; // leaving the enclosing subgraph
      const id = nodeAt(ln);
      if (id !== null) {
        beforeNodeId = id;
        break;
      }
    }
    // enclosing subgraph: the first opener above the gap that is not closed
    // by an `end` between it and the gap
    let parentId: string | null = null;
    let open = 0;
    for (let ln = boundary - 1; ln >= 0; ln--) {
      if (isEnd(ln)) open++;
      else if (lines[ln].trim().startsWith('subgraph') && nodeAt(ln) !== null) {
        if (open === 0) {
          parentId = nodeAt(ln);
          break;
        }
        open--;
      }
    }
    return { afterNodeId, beforeNodeId, parentId };
  };

  const clearHover = () => {
    cancelDwell();
    if (edited) return;
    setHighlight(null);
    showGap(null);
  };

  return (
    <aside className="mf-panel" id="mf-right-panel" style={{ width: panelWidth }}>
      <div
        className="mf-panel-resize"
        role="separator"
        tabIndex={0}
        aria-label="Resize right panel"
        aria-orientation="vertical"
        aria-controls="mf-right-panel"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={panelWidth}
        aria-valuetext={`${panelWidth} pixels`}
        title="Drag to resize · Double-click to reset"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          resize.current = { pointerId: event.pointerId, x: event.clientX, width: panelWidth };
        }}
        onPointerMove={(event) => {
          const start = resize.current;
          if (start?.pointerId !== event.pointerId) return;
          onWidthChange(clampWidth(start.width + start.x - event.clientX));
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { resize.current = null; }}
        onLostPointerCapture={() => { resize.current = null; }}
        onDoubleClick={() => onWidthChange(clampWidth(360))}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 50 : 10;
          const next = event.key === 'Home' ? minWidth
            : event.key === 'End' ? maxWidth
            : panelWidth + (event.key === 'ArrowLeft' ? step : -step);
          onWidthChange(clampWidth(next));
        }}
      />
      <div className="mf-panel-head">
        <div className="mf-panel-tabs" role="tablist" aria-label="Diagram views">
          {views.map((view) => (
            <button key={view} id={`mf-tab-${view}`} role="tab"
              aria-selected={tab === view} aria-controls={`mf-view-${view}`}
              tabIndex={tab === view ? 0 : -1}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const at = views.indexOf(view);
                const next =
                  event.key === 'Home' ? views[0]
                  : event.key === 'End' ? views[views.length - 1]
                  : views[(at + (event.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length];
                document.getElementById(`mf-tab-${next}`)?.click();
                document.getElementById(`mf-tab-${next}`)?.focus();
              }}
              onClick={() => {
                if (syncTimer.current) {
                  window.clearTimeout(syncTimer.current);
                  syncTimer.current = null;
                  runSync(text);
                }
                clearHover();
                setHighlight(null);
                setInsertion(null);
                setTab(view);
              }}>
              {titles[view]}
            </button>
          ))}
        </div>
        <button
          className="mf-tool"
          aria-label="Close panel"
          title="Close  ·  M"
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="mf-panel-body" role="tabpanel" id="mf-view-page"
        aria-labelledby="mf-tab-page" hidden={tab !== 'page'}>
        {tab === 'page' && (
          <Suspense fallback={null}>
            <PagePanel />
          </Suspense>
        )}
      </div>
      <div className="mf-panel-body" role="tabpanel" id="mf-view-tree"
        aria-labelledby="mf-tab-tree" hidden={tab !== 'tree'}>
        <TreePanel />
      </div>
      <div className="mf-panel-body" role="tabpanel" id="mf-view-mermaid"
        aria-labelledby="mf-tab-mermaid" hidden={tab !== 'mermaid'}>
        <div className="mf-mermaid-wrap">
          {/* highlight + hover overlay, scroll-synced behind/over the textarea */}
          <div className="mf-mermaid-overlay" ref={scrollRef} aria-hidden>
            {lines.map((line, i) => (
              <div
                key={i}
                className={`mf-mline${activeLines.includes(i) ? ' active' : ''}${
                  selectedLines.has(i) ? ' selected' : ''
                }${i === gapLine ? ' insert-before' : ''}`}
              >
                {line === '' ? '\u200b' : line}
              </div>
            ))}
            {/* caret below the last line when inserting at the very end */}
            {gapLine === lines.length && (
              <div className="mf-mline insert-before" aria-hidden>
                {'\u200b'}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="mf-mermaid-text"
            value={text}
            spellCheck={false}
            aria-label="Mermaid source"
            onScroll={syncScroll}
            onMouseMove={hoverFromMouse}
            onMouseLeave={clearHover}
            onMouseDown={insertAtGap}
            style={gapLine !== null ? { cursor: 'copy' } : undefined}
            title={gapLine !== null ? 'Click to insert a node here' : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setEdited(true);
              cancelDwell();
              showGap(null);
              scheduleSync(e.target.value);
            }}
          />
        </div>

        {err && <div className="mf-err">{err}</div>}
        <div className="mf-panel-actions">
          <button className="mf-primary" onClick={tidy}>
            Tidy
          </button>
          <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <input
            className="mf-base"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="Base URL"
            aria-label="Base URL for page links"
            spellCheck={false}
          />
        </div>
      </div>
    </aside>
  );
}
