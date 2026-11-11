// Playback for the sequenced flow. One clock, in steps, lives in the CSS
// variable --mf-flow-t on <html>; edges and nodes derive their own progress
// from it in CSS, so a frame costs no React render. Below zero nothing shows.

import { create } from 'zustand';
import { FLOW_HOLD, FLOW_LEAD, HOP_SECONDS } from './flow';

export const FLOW_SPEEDS = [0.5, 1, 2] as const;

/** the clock reading when nothing is lit */
const CLEAR = -1;
const EPS = 1e-6;

interface Player {
  playing: boolean;
  speed: number;
  steps: number;
  sig: string;
  /** true while any of the sequence is lit */
  lit: boolean;
  toggle: () => void;
  pause: () => void;
  /** pause and clear the sequence */
  stop: () => void;
  stepBy: (dir: 1 | -1) => void;
  cycleSpeed: () => void;
  /** the schedule changed: restart if playing, else clear */
  setSchedule: (sig: string, steps: number) => void;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let time = CLEAR;
let raf = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** The clock reading, so a caller can put it back after borrowing it. */
export const clock = () => time;

/** Move the clock; every lit edge and node follows in CSS. */
export function seek(t: number) {
  time = t;
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--mf-flow-t', String(t));
  const lit = t >= 0;
  if (lit !== usePlayer.getState().lit) usePlayer.setState({ lit });
}

function halt() {
  cancelAnimationFrame(raf);
  clearInterval(timer);
  timer = undefined;
}

function run() {
  halt();
  const { speed } = usePlayer.getState();
  if (reducedMotion()) {
    // no travelling pulse: hop from step to step
    timer = setInterval(() => {
      const { steps } = usePlayer.getState();
      if (time >= steps) seek(CLEAR);
      else seek(time < 0 ? 1 : Math.min(steps, Math.floor(time + EPS) + 1));
    }, (HOP_SECONDS * 1000) / speed);
    return;
  }
  let last = performance.now();
  const tick = (now: number) => {
    const { speed: v, steps } = usePlayer.getState();
    const end = steps + FLOW_HOLD;
    let t = time + ((now - last) / 1000) * (v / HOP_SECONDS);
    last = now;
    if (t >= end) t = -FLOW_LEAD + (t - end);
    seek(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export const usePlayer = create<Player>((set, get) => ({
  playing: false,
  speed: 1,
  steps: 0,
  sig: '',
  lit: false,

  toggle: () => {
    const { playing, steps } = get();
    if (playing) return get().pause();
    if (steps === 0) return;
    if (time < -FLOW_LEAD || time >= steps) seek(-FLOW_LEAD);
    set({ playing: true });
    run();
  },

  pause: () => {
    halt();
    set({ playing: false });
  },

  stop: () => {
    get().pause();
    seek(CLEAR);
  },

  stepBy: (dir) => {
    const { steps } = get();
    if (steps === 0) return;
    get().pause();
    if (dir > 0) seek(time < 0 ? 1 : Math.min(steps, Math.floor(time + EPS) + 1));
    else {
      const t = Math.ceil(time - EPS) - 1;
      seek(t <= 0 ? CLEAR : Math.min(steps, t));
    }
  },

  cycleSpeed: () => {
    const i = FLOW_SPEEDS.indexOf(get().speed as (typeof FLOW_SPEEDS)[number]);
    set({ speed: FLOW_SPEEDS[(i + 1) % FLOW_SPEEDS.length] });
    if (get().playing) run();
  },

  setSchedule: (sig, steps) => {
    if (sig === get().sig) return;
    set({ sig, steps });
    if (steps === 0) {
      halt();
      set({ playing: false });
      seek(CLEAR);
    } else seek(get().playing ? -FLOW_LEAD : CLEAR);
  },
}));
