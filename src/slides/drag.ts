// Pure geometry for placing objects on a slide by hand. Pixels are relative
// to the slide's top-left corner; a box is in percent of the slide.

import type { Box } from '../slides';

export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
export type DragMode = 'move' | 'resize' | 'rotate' | ResizeHandle;
export interface Point { x: number; y: number }
export interface Frame { w: number; h: number }

const centre = (box: Box, frame: Frame): Point => ({
  x: ((box.left + box.width / 2) / 100) * frame.w,
  y: ((box.top + box.height / 2) / 100) * frame.h,
});

/** `v` seen from a box turned `degrees` clockwise. */
const unturn = (v: Point, degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(a) + v.y * Math.sin(a), y: -v.x * Math.sin(a) + v.y * Math.cos(a) };
};

/** What a press on a box begins. Only a selected box shows its corner and turn handles. */
export function dragMode(box: Box, frame: Frame, at: Point, selected: boolean): DragMode {
  if (!selected) return 'move';
  const c = centre(box, frame);
  const local = unturn({ x: at.x - c.x, y: at.y - c.y }, box.rotate ?? 0);
  const hw = ((box.width / 100) * frame.w) / 2;
  const hh = ((box.height / 100) * frame.h) / 2;
  if (local.y < -hh - 4) return 'rotate';
  return local.x > hw - 12 && local.y > hh - 12 ? 'resize' : 'move';
}

/** How near, in percent of the slide, an edge or centre must come to snap. */
const SNAP = 1.2;

/** The smallest shift bringing one of `own` onto one of `targets`, if any is near. */
function snap(own: number[], targets: number[]): { shift: number; at: number } | undefined {
  let best: { shift: number; at: number } | undefined;
  for (const o of own)
    for (const t of targets)
      if (Math.abs(t - o) < SNAP && (!best || Math.abs(t - o) < Math.abs(best.shift))) best = { shift: t - o, at: t };
  return best;
}

export interface Dragged {
  to: Partial<Box>;
  /** alignment guides to draw, in percent across and down the slide */
  guides: { x?: number; y?: number };
}

/**
 * Where a drag has taken a box. Moving snaps its edges and centre to the
 * slide's and to the other objects'; turning snaps to 45° steps (15° with
 * `strict`). `strict` (Shift) moves freely.
 */
export function dragged(mode: DragMode, from: Box, others: Box[], frame: Frame, start: Point, now: Point, strict = false): Dragged {
  const d = { x: now.x - start.x, y: now.y - start.y };
  if (mode === 'rotate') {
    const c = centre(from, frame);
    let angle = (Math.atan2(now.y - c.y, now.x - c.x) * 180) / Math.PI + 90;
    angle = ((((angle + 180) % 360) + 360) % 360) - 180;
    const step = strict ? 15 : 45;
    const near = Math.round(angle / step) * step;
    angle = strict || Math.abs(near - angle) < 4 ? near : Math.round(angle);
    return { to: { rotate: angle || undefined }, guides: {} };
  }
  if (mode !== 'move') {
    const local = unturn(d, from.rotate ?? 0);
    const handle = mode === 'resize' ? 'se' : mode;
    const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    let width = Math.max(1, from.width + horizontal * (local.x / frame.w) * 100);
    let height = from.shape === 'line' ? from.height : Math.max(1, from.height + vertical * (local.y / frame.h) * 100);
    if (strict && horizontal && vertical && from.shape !== 'line') {
      const dx = width / from.width - 1;
      const dy = height / from.height - 1;
      const scale = Math.max(1 + (Math.abs(dx) > Math.abs(dy) ? dx : dy), 1 / from.width, 1 / from.height);
      width = from.width * scale;
      height = from.height * scale;
    }
    const shift = unturn({
      x: horizontal * (width - from.width) / 200 * frame.w,
      y: vertical * (height - from.height) / 200 * frame.h,
    }, -(from.rotate ?? 0));
    const left = from.left + shift.x / frame.w * 100 - (width - from.width) / 2;
    const top = from.top + shift.y / frame.h * 100 - (height - from.height) / 2;
    return {
      to: {
        width,
        ...(from.shape !== 'line' && { height }),
        ...(Math.abs(left - from.left) > 1e-9 && { left }),
        ...(Math.abs(top - from.top) > 1e-9 && { top }),
      },
      guides: {},
    };
  }
  let left = from.left + (d.x / frame.w) * 100;
  let top = from.top + (d.y / frame.h) * 100;
  if (strict) return { to: { left, top }, guides: {} };
  const x = snap([left, left + from.width / 2, left + from.width],
    [0, 50, 100, ...others.flatMap((o) => [o.left, o.left + o.width / 2, o.left + o.width])]);
  const y = snap([top, top + from.height / 2, top + from.height],
    [0, 50, 100, ...others.flatMap((o) => [o.top, o.top + o.height / 2, o.top + o.height])]);
  left += x?.shift ?? 0;
  top += y?.shift ?? 0;
  return { to: { left, top }, guides: { ...(x && { x: x.at }), ...(y && { y: y.at }) } };
}
