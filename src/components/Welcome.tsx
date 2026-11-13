import { useEffect, useLayoutEffect, useState } from 'react';

import type { FitViewOptions } from '@xyflow/react';
const KEY = 'marmerlade.welcomed';

/** Fired to show the first-run notes again (e.g. after Clear canvas). */
export const WELCOME_EVENT = 'marmerlade:welcome';

/** Frames the demo diagram below the notes. */
export const FIRST_RUN_FIT: FitViewOptions = {
  padding: { top: '320px', right: '80px', bottom: '60px', left: '80px' },
  maxZoom: 1,
};

/** True until the first-run notes have been dismissed once. */
export function isFirstRun(): boolean {
  try {
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // best-effort
  }
}

interface Pt {
  x: number;
  y: number;
}
interface Rects {
  bar: DOMRect;
  panel: DOMRect;
  vw: number;
}

/** A hand-drawn arrow: two slightly different curves and a two-stroke head. */
function arrow(from: Pt, to: Pt, bend: number): string[] {
  const curve = (a: Pt, b: Pt, k: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const c = { x: (a.x + b.x) / 2 - (dy / len) * k, y: (a.y + b.y) / 2 + (dx / len) * k };
    return { c, d: `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}` };
  };
  const main = curve(from, to, bend);
  const echo = curve({ x: from.x + 3, y: from.y - 2 }, { x: to.x - 2, y: to.y + 2 }, bend * 1.25);
  const tip = Math.atan2(to.y - main.c.y, to.x - main.c.x);
  const wing = (turn: number) =>
    `M${to.x} ${to.y}L${to.x - Math.cos(tip + turn) * 15} ${to.y - Math.sin(tip + turn) * 15}`;
  return [main.d, echo.d, wing(0.5), wing(-0.5)];
}

/**
 * First-run notes drawn over the canvas: hand-inked arrows to the toolbar and
 * to the (closed) side panel. Any click or key dismisses them for good.
 */
export function Welcome({ onDone }: { onDone: () => void }) {
  const [rects, setRects] = useState<Rects | null>(null);
  const [leaving, setLeaving] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const bar = document.querySelector('.mf-toolbar')?.getBoundingClientRect();
      const panel = document.querySelector('.mf-reopen')?.getBoundingClientRect();
      if (bar && panel) setRects({ bar, panel, vw: window.innerWidth });
    };
    measure();
    const watch = new ResizeObserver(measure);
    for (const el of document.querySelectorAll('.mf-toolbar, .mf-reopen')) watch.observe(el);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const dismiss = () => {
      markWelcomed();
      setLeaving(true);
      timer = window.setTimeout(onDone, 220);
    };
    window.addEventListener('pointerdown', dismiss, { capture: true, once: true });
    window.addEventListener('keydown', dismiss, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', dismiss, { capture: true });
      window.removeEventListener('keydown', dismiss, { capture: true });
      window.clearTimeout(timer);
    };
  }, [onDone]);

  if (!rects) return null;
  const { bar, panel, vw } = rects;
  const left = { x: Math.max(24, bar.left), y: bar.bottom + 96 };
  const right = { x: vw - 24, y: panel.bottom + 96 };
  const toolbarArrow = arrow(
    { x: left.x + 70, y: left.y - 10 },
    { x: bar.left + bar.width * 0.3, y: bar.bottom + 10 },
    -34,
  );
  const panelArrow = arrow(
    { x: right.x - 90, y: right.y - 10 },
    { x: panel.left + panel.width / 2, y: panel.bottom + 10 },
    34,
  );

  return (
    <div className={leaving ? 'mf-welcome is-leaving' : 'mf-welcome'} aria-hidden="true">
      <svg className="mf-welcome-ink">
        {[toolbarArrow, panelArrow].map((paths, i) =>
          paths.map((d, j) => (
            <path
              key={`${i}-${j}`}
              d={d}
              pathLength={1}
              className={j === 1 ? 'is-echo' : undefined}
              style={{ animationDelay: `${i * 260 + (j > 1 ? 700 : j * 120)}ms` }}
            />
          )),
        )}
      </svg>
      <div className="mf-welcome-brand" style={{ top: bar.bottom + 160 }}>
        <img src="/favicon.svg" alt="" width="36" height="36" />
        <span className="mf-brand">marmerlade</span>
      </div>
      <p className="mf-welcome-note" style={{ left: left.x, top: left.y }}>
        Shapes, tidy, fold, play
      </p>
      <p className="mf-welcome-note is-right" style={{ right: vw - right.x, top: right.y }}>
        Mermaid, tree, pages, slides
        <kbd>M</kbd>
      </p>
    </div>
  );
}
