import { useEffect, useRef, useState } from 'react';
import { deckHref } from '../route';
import type { Slide as SlideData } from '../slides';
import { Icon } from '../components/Icon';
import Slide from './Slide';
import './print.css';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Time since the talk began; click to start over. */
function Timer() {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return (
    <button className="sl-timer" title="Restart timer" aria-label="Elapsed time" onClick={() => {
      setStart(Date.now());
      setNow(Date.now());
    }}>
      {clock(now - start)}
    </button>
  );
}

/** A deck, one slide filling the window. The slide number lives in the URL. */
export default function Present({ deckId, nodeId, slides, slide, presenter = false }: {
  deckId: string;
  nodeId?: string;
  slides: SlideData[];
  /** 1-based, as in the URL */
  slide: number;
  /** the speaker's window: notes, timer and next slide beside what the audience sees */
  presenter?: boolean;
}) {
  const at = Math.min(slide, slides.length);
  const [notes, setNotes] = useState(presenter);
  // which way the deck last moved, so a slide can enter from the right side
  const [seen, setSeen] = useState({ at, back: false });
  if (seen.at !== at) setSeen({ at, back: at < seen.at });
  const [overview, setOverview] = useState(false);
  const [blank, setBlank] = useState(false);
  const [pointer, setPointer] = useState(false);
  /** digits typed so far: a number then Enter jumps to that slide */
  const typed = useRef('');

  // stepping replaces the history entry, so Back leaves the presentation
  const go = (n: number) => {
    const next = Math.max(1, Math.min(slides.length, n));
    if (next !== at) window.location.replace(deckHref(deckId, nodeId, next, presenter));
  };
  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    if (presenter) window.close();
    window.location.replace(deckHref(deckId, nodeId));
  };
  /** the speaker's view in a window of its own, for a second screen */
  const openPresenter = () =>
    window.open(deckHref(deckId, nodeId, at, true), 'merfolk-presenter', 'popup,width=960,height=640')?.focus();
  const fullscreen = () =>
    void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());

  const latest = useRef({ go, exit, openPresenter });
  useEffect(() => {
    latest.current = { go, exit, openPresenter };
  });

  // every window presenting this deck stays on the same slide
  const channel = useRef<BroadcastChannel>(undefined);
  useEffect(() => {
    const ch = new BroadcastChannel(`merfolk-slides:${deckId}`);
    ch.onmessage = (e: MessageEvent<{ at: number }>) => latest.current.go(e.data.at);
    channel.current = ch;
    return () => ch.close();
  }, [deckId]);
  useEffect(() => {
    channel.current?.postMessage({ at });
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { go, exit } = latest.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (blank) {
        // any key brings the slide back
        e.preventDefault();
        setBlank(false);
        return;
      }
      if (overview) {
        // the grid is plain buttons: Tab and Enter pick a slide
        if (key === 'Escape' || key === 'o') {
          e.preventDefault();
          setOverview(false);
        }
        return;
      }
      if (/^\d$/.test(key)) {
        typed.current += key;
        return;
      }
      const number = Number(typed.current);
      typed.current = '';
      const run = ({
        ArrowRight: () => go(at + 1),
        ArrowDown: () => go(at + 1),
        PageDown: () => go(at + 1),
        Enter: () => go(number || at + 1),
        ' ': () => go(at + (e.shiftKey ? -1 : 1)),
        ArrowLeft: () => go(at - 1),
        ArrowUp: () => go(at - 1),
        PageUp: () => go(at - 1),
        Backspace: () => go(at - 1),
        Home: () => go(1),
        End: () => go(slides.length),
        Escape: exit,
        n: () => setNotes((on) => !on),
        o: () => setOverview(true),
        b: () => setBlank(true),
        l: () => setPointer((on) => !on),
        p: () => latest.current.openPresenter(),
        f: fullscreen,
      } as Record<string, (() => void) | undefined>)[key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, slides.length, blank, overview]);

  const current = slides[at - 1];
  const tool = (label: string, key: string, icon: Parameters<typeof Icon>[0]['name'], run: () => void, on?: boolean) => (
    <button className="wk-icon" title={`${label}  ·  ${key}`} aria-label={label} aria-pressed={on} onClick={run}>
      <Icon name={icon} size={15} />
    </button>
  );

  return (
    <div className={`sl-present${pointer ? ' pointer' : ''}${presenter ? ' presenter' : ''}`}>
      <div className={`sl-stage${current.look.transition ? ` t-${current.look.transition}` : ''}${seen.back ? ' back' : ''}`}>
        <Slide key={at} slide={current} nodeId={nodeId} />
        <div className="sl-progress" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={slides.length}
          aria-valuenow={at} style={{ width: `${(at / slides.length) * 100}%` }} />
        <footer className="sl-controls">
          {tool('Previous slide', '←', 'step-back', () => go(at - 1))}
          <span aria-label="Slide number">{at} / {slides.length}</span>
          {tool('Next slide', '→', 'step-fwd', () => go(at + 1))}
          {tool('All slides', 'O', 'grid', () => setOverview(true))}
          {tool('Speaker notes', 'N', 'page', () => setNotes(!notes), notes)}
          {!presenter && tool('Presenter window', 'P', 'export', openPresenter)}
          {tool('Pointer', 'L', 'cursor', () => setPointer(!pointer), pointer)}
          {tool('Blank screen', 'B', 'stop', () => setBlank(true))}
          {tool('Full screen', 'F', 'expand', fullscreen)}
          {tool('Exit presentation', 'Esc', 'close', exit)}
        </footer>
      </div>
      {notes && <aside className="sl-notes" aria-label="Presenter view">
        <div className="sl-notes-text">
          {current.notes.map((note, i) => <p key={i}>{note}</p>)}
        </div>
        <div className="sl-next">
          <Timer />
          {slides[at] && <Slide key={at} slide={slides[at]} nodeId={nodeId} />}
        </div>
      </aside>}
      {overview && <ol className="sl-overview" aria-label="All slides">
        {slides.map((s, i) => (
          <li key={i}>
            <Slide slide={s} nodeId={nodeId} />
            <button autoFocus={i === at - 1} aria-label={`Go to slide ${i + 1}`} aria-current={i === at - 1 ? 'true' : undefined}
              onClick={() => {
                setOverview(false);
                go(i + 1);
              }}>
              <span>{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>}
      {blank && <button className="sl-blank" aria-label="Show slide" autoFocus onClick={() => setBlank(false)} />}
      {/* every slide, one per sheet, for the browser's Print */}
      <div className="sl-print">
        {slides.map((s, i) => <Slide key={i} slide={s} nodeId={nodeId} />)}
      </div>
    </div>
  );
}
