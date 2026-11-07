// Animated-GIF export. Captures the live React Flow viewport frame by frame
// over one animation cycle and encodes a size-optimised, looping GIF.
//
// Capture is DOM-based (html-to-image), so the GIF matches exactly what is on
// screen — the same node/edge motion presets the user set in the style panel.
// The loop-length/frame/scale maths lives in gifMath.ts (pure, unit-tested);
// this module holds only the browser capture + encode path.

import { toCanvas } from 'html-to-image';
import GIF from 'gif.js';
import workerUrl from 'gif.js/dist/gif.worker.js?url';
import type { Diagram } from './types';
import {
  GIF_DEFAULTS,
  cycleSeconds,
  fitScale,
  frameCount,
  frameDelayMs,
  gifFileName,
} from './gifMath';

export { GIF_DEFAULTS, cycleSeconds, frameCount, frameDelayMs, fitScale, gifFileName };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Capture the given element's animation to a looping GIF and download it.
 * `diagram` is read only to size the loop to the slowest animation; the pixels
 * come entirely from the live DOM so the result matches the canvas.
 */
export async function exportGif(
  element: HTMLElement,
  diagram: Diagram,
  opts: Partial<typeof GIF_DEFAULTS> = {},
): Promise<void> {
  const { fps, maxWidth, quality, stillSeconds } = { ...GIF_DEFAULTS, ...opts };

  const rect = element.getBoundingClientRect();
  const srcW = Math.max(1, Math.round(rect.width));
  const srcH = Math.max(1, Math.round(rect.height));
  if (srcW < 2 || srcH < 2) return; // nothing meaningful to capture

  const scale = fitScale(srcW, maxWidth);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const seconds = cycleSeconds(diagram) || stillSeconds;
  const frames = frameCount(seconds, fps);
  const delay = frameDelayMs(fps);

  // read the canvas background so flattened frames are not transparent (a
  // transparent GIF palette wastes a slot and can fringe on dark viewers)
  const bg =
    getComputedStyle(element).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    '#ffffff';

  const gif = new GIF({
    workers: 2,
    quality,
    width: outW,
    height: outH,
    repeat: 0, // 0 = loop forever
    background: bg,
    transparent: null,
    workerScript: workerUrl,
  });

  const captureOpts = {
    width: srcW,
    height: srcH,
    canvasWidth: outW,
    canvasHeight: outH,
    backgroundColor: bg,
    pixelRatio: 1,
    // skip the transient overlays so the GIF is just the diagram
    filter: (node: HTMLElement) => {
      const cls = typeof node.className === 'string' ? node.className : '';
      return !(
        cls.includes('react-flow__minimap') ||
        cls.includes('react-flow__controls') ||
        cls.includes('react-flow__panel')
      );
    },
  };

  // grab evenly spaced frames across exactly one cycle of real time, so the
  // live CSS animations advance between captures
  for (let i = 0; i < frames; i++) {
    const canvas = await toCanvas(element, captureOpts);
    gif.addFrame(canvas, { delay, copy: true });
    if (i < frames - 1) await sleep((seconds * 1000) / frames);
  }

  const blob: Blob = await new Promise((resolve) => {
    gif.on('finished', resolve);
    gif.render();
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = gifFileName();
  a.click();
  URL.revokeObjectURL(url);
}
