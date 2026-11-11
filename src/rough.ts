// Hand-drawn ink for node outlines and edges. Pure functions (no DOM), so the
// node renderer, the edge renderer and `npm test` share one source of truth.
//
// Each shape is first described as a clean SVG path in pixel space, then
// re-drawn by roughjs with a seed derived from the element id: the wobble is
// the same on every render and every reload. Sloppiness 0 keeps the clean
// path; 1 is a single sketched pen line; 2 is a double-pass scribble.
import rough from 'roughjs';
import type { NodeShape, Sloppiness } from './types';
import { shapeDef } from './shapes.ts';

const gen = rough.generator();

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Scale a path drawn in the 100x100 shape box to `sx`, `sy`. Shape outlines use
 * only absolute M/L/H/V/A/Z with axis-aligned arcs, so scaling is exact.
 */
export function scalePath(d: string, sx: number, sy: number): string {
  const out: string[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLHVAZ])([^MLHVAZ]*)/gi)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const c = cmd.toUpperCase();
    let v: number[];
    if (c === 'H') v = n.map((x) => x * sx);
    else if (c === 'V') v = n.map((y) => y * sy);
    else if (c === 'A') v = n.map((x, i) => (i % 7 === 0 || i % 7 === 5 ? x * sx : i % 7 === 1 || i % 7 === 6 ? x * sy : x));
    else v = n.map((x, i) => (i % 2 === 0 ? x * sx : x * sy));
    out.push(cmd + v.map(fmt).join(' '));
  }
  return out.join('');
}

function roundedRect(w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return `M0 0H${fmt(w)}V${fmt(h)}H0Z`;
  const [W, H, R] = [w, h, r].map(fmt);
  return (
    `M${R} 0H${fmt(w - r)}A${R} ${R} 0 0 1 ${W} ${R}V${fmt(h - r)}` +
    `A${R} ${R} 0 0 1 ${fmt(w - r)} ${H}H${R}A${R} ${R} 0 0 1 0 ${fmt(h - r)}` +
    `V${R}A${R} ${R} 0 0 1 ${R} 0Z`
  );
}

function ellipse(w: number, h: number): string {
  const [rx, ry, W, cy] = [w / 2, h / 2, w, h / 2].map(fmt);
  return `M0 ${cy}A${rx} ${ry} 0 1 0 ${W} ${cy}A${rx} ${ry} 0 1 0 0 ${cy}Z`;
}

export interface ShapeOpts {
  /** the node's corner treatment (ElementStyle.edges === 'round') */
  rounded: boolean;
  /** an icon tile: its shape only picks the corners (see iconTileCss) */
  icon?: boolean;
}

/** Clean outline (and inner detail lines) of `shape` in a `w` x `h` box. */
export function shapePath(
  shape: NodeShape,
  w: number,
  h: number,
  { rounded, icon }: ShapeOpts,
): { outline: string; detail?: string } {
  if (icon) {
    if (shape === 'circle') return { outline: ellipse(w, h) };
    return { outline: roundedRect(w, h, shape === 'round' ? 22 : rounded ? 12 : 0) };
  }
  const def = shapeDef(shape);
  if (def.outline) {
    const sx = w / 100;
    const sy = h / 100;
    return {
      outline: scalePath(def.outline, sx, sy),
      detail: def.detail ? scalePath(def.detail, sx, sy) : undefined,
    };
  }
  switch (shape) {
    case 'round':
      return { outline: roundedRect(w, h, 24) };
    case 'stadium':
      return { outline: roundedRect(w, h, h / 2) };
    case 'circle':
      return { outline: ellipse(w, h) };
    case 'diamond': // the node body is a square rotated 45deg
      return { outline: roundedRect(w, h, 0) };
    default:
      return { outline: roundedRect(w, h, rounded ? 12 : 0) };
  }
}

/** A stable roughjs seed (1..2^31-1) for an element id. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

export interface InkOpts {
  sloppiness: Sloppiness;
  seed: number;
  /**
   * dashed, dotted or animated strokes need one continuous line for the dash
   * pattern to run along, so the scribble's second pass is dropped
   */
  continuous?: boolean;
  /** keep the end points exactly where they are (edges meet their handles) */
  pinEnds?: boolean;
}

/**
 * Re-draw a clean path as ink. A single pass is joined into one continuous
 * subpath (roughjs emits one per segment), so dashes and the "draw on" trace
 * run along the whole outline instead of restarting at every corner.
 */
export function ink(d: string, { sloppiness, seed, continuous, pinEnds }: InkOpts): string {
  if (sloppiness === 0) return d;
  const multi = sloppiness === 2 && !continuous;
  const drawable = gen.path(d, {
    seed,
    roughness: sloppiness === 2 ? 2 : 1,
    bowing: sloppiness === 2 ? 2 : 0.8,
    disableMultiStroke: !multi,
    // a single pass keeps its corners where they are, so the segments meet
    // cleanly and only bow in between; the scribble may overshoot them
    preserveVertices: pinEnds || !multi,
  });
  const out: string[] = [];
  let end: number[] | null = null;
  for (const set of drawable.sets) {
    if (set.type !== 'path') continue;
    for (const { op, data } of set.ops) {
      if (op === 'move') {
        // roughjs starts every segment with a move: a single pass continues
        // through it when it starts where the last one ended, while a real
        // new subpath (or a scribble's second pass) starts fresh
        const joins = !multi && end && Math.hypot(data[0] - end[0], data[1] - end[1]) < 0.5;
        out.push((joins ? 'L' : 'M') + data.map(fmt).join(' '));
      } else out.push((op === 'bcurveTo' ? 'C' : 'L') + data.map(fmt).join(' '));
      end = data.slice(-2);
    }
  }
  return out.join('');
}

export interface Outline {
  /** clean shape, filled with the node's paper */
  fill: string;
  /** the inked outline */
  ink: string;
  /** inked inner lines (subroutine bars, cylinder lid, double ring) */
  detail?: string;
}

/** Fill + ink for a node of `shape` sized `w` x `h`. */
export function roughOutline(
  shape: NodeShape,
  w: number,
  h: number,
  opts: ShapeOpts & InkOpts,
): Outline {
  const { outline, detail } = shapePath(shape, w, h, opts);
  return {
    fill: outline,
    ink: ink(outline, opts),
    detail: detail ? ink(detail, { ...opts, seed: opts.seed + 1 }) : undefined,
  };
}

/** Which side of the target node an edge lands on (React Flow's Position). */
export type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * An open two-stroke chevron whose tip sits at (x, y), pointing into the node
 * on `side`.
 */
export function arrowHead(
  x: number,
  y: number,
  side: Side,
  { sloppiness, seed, size = 8 }: { sloppiness: Sloppiness; seed: number; size?: number },
): string {
  const s = size;
  const half = s * 0.62;
  const wings: [number, number][] =
    side === 'top'
      ? [[x - half, y - s], [x + half, y - s]]
      : side === 'bottom'
        ? [[x - half, y + s], [x + half, y + s]]
        : side === 'left'
          ? [[x - s, y - half], [x - s, y + half]]
          : [[x + s, y - half], [x + s, y + half]];
  const [[ax, ay], [bx, by]] = wings;
  const d = `M${fmt(ax)} ${fmt(ay)}L${fmt(x)} ${fmt(y)}L${fmt(bx)} ${fmt(by)}`;
  return ink(d, { sloppiness: sloppiness === 2 ? 1 : sloppiness, seed, continuous: true, pinEnds: true });
}
