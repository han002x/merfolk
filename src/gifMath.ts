// Pure maths for GIF export, kept free of any browser/DOM imports so it can be
// unit-tested under `node --experimental-strip-types` (scripts/gif.ts).

import type { FlowchartDiagram } from './types';

/** Fallback cycle length (seconds) — mirrors STYLE_DEFAULTS.animationSpeed. */
const DEFAULT_ANIMATION_SPEED = 1.6;

/** Fixed, size-conscious defaults — no dialog (zero-config export). */
export const GIF_DEFAULTS = {
  /** frames per second of the captured animation */
  fps: 12,
  /** longest side of the output, in px (frames are downscaled to fit) */
  maxWidth: 900,
  /** gif.js quality: lower is better/slower; 10 keeps files small and sharp */
  quality: 10,
  /** seconds a still (no animation) GIF should last */
  stillSeconds: 1,
} as const;

/**
 * The cycle length (seconds) one loop of the diagram's animation lasts: the
 * slowest animationSpeed among animated elements, so every preset completes a
 * whole number of cycles within the GIF. `flowSeconds` is the sequenced flow's
 * loop (0 when it is not recorded). Returns 0 when nothing animates.
 */
export function cycleSeconds(diagram: FlowchartDiagram, flowSeconds = 0): number {
  let max = flowSeconds;
  const consider = (speed: number | undefined, animated: boolean) => {
    if (!animated) return;
    max = Math.max(max, speed ?? DEFAULT_ANIMATION_SPEED);
  };
  for (const n of diagram.nodes) {
    const a = n.style?.animation;
    consider(n.style?.animationSpeed, a != null && a !== 'none');
  }
  for (const e of diagram.edges) {
    const a = e.style?.animation;
    consider(e.style?.animationSpeed, a != null && a !== 'none');
  }
  return max;
}

/** Number of frames to capture for a cycle of `seconds` at `fps` (>= 1). */
export function frameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

/** Per-frame delay in ms from an fps (gif.js wants whole milliseconds). */
export function frameDelayMs(fps: number): number {
  return Math.max(1, Math.round(1000 / fps));
}

/**
 * Scale factor (<= 1) that fits a source width into `maxWidth`. A source at or
 * below the cap is captured 1:1.
 */
export function fitScale(sourceWidth: number, maxWidth: number): number {
  if (sourceWidth <= 0) return 1;
  return Math.min(1, maxWidth / sourceWidth);
}

/** The download filename for the exported GIF. */
export function gifFileName(): string {
  return 'diagram.gif';
}
