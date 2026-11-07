// GIF export maths check: the loop length tracks the slowest animated element,
// frame counts/delays follow the fps, and frames downscale to the width cap.
// Run with: node --experimental-strip-types scripts/gif.ts
import {
  GIF_DEFAULTS,
  cycleSeconds,
  fitScale,
  frameCount,
  frameDelayMs,
  gifFileName,
} from '../src/gifMath.ts';
import { STYLE_DEFAULTS } from '../src/style.ts';
import type { Diagram, DiagramEdge, DiagramNode } from '../src/types.ts';
import type { AnimationKind } from '../src/types.ts';

const N = (
  id: string,
  animation?: AnimationKind,
  animationSpeed?: number,
): DiagramNode => ({
  id,
  label: id,
  shape: 'rect',
  parentId: null,
  collapsed: false,
  position: { x: 0, y: 0 },
  style: animation ? { animation, animationSpeed } : undefined,
});
const E = (
  id: string,
  animation?: AnimationKind,
  animationSpeed?: number,
): DiagramEdge => ({
  id,
  source: 'a',
  target: 'b',
  style: animation ? { animation, animationSpeed } : undefined,
});
const D = (nodes: DiagramNode[], edges: DiagramEdge[] = []): Diagram => ({
  nodes,
  edges,
});

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail ?? '');
  }
};

// cycleSeconds: 0 when nothing animates, else the slowest speed among animated
check('no animation => 0 cycle', cycleSeconds(D([N('a'), N('b')])) === 0);
check(
  "animation:'none' does not count",
  cycleSeconds(D([N('a', 'none', 3)])) === 0,
);
check(
  'slowest animated speed wins',
  cycleSeconds(D([N('a', 'pulse', 0.8), N('b', 'fade', 3)])) === 3,
);
check(
  'edges count too',
  cycleSeconds(D([N('a')], [E('e', 'flow', 1.6)])) === 1.6,
);
check(
  'a node can flow too',
  cycleSeconds(D([N('a', 'flow', 0.8)])) === 0.8,
);
check(
  'missing speed falls back to default',
  cycleSeconds(D([N('a', 'pulse')])) === STYLE_DEFAULTS.animationSpeed,
  cycleSeconds(D([N('a', 'pulse')])),
);

// frameCount / frameDelayMs: follow fps, never below 1
check('frames round to nearest', frameCount(1.6, 12) === 19, frameCount(1.6, 12));
check('at least one frame', frameCount(0, 12) === 1);
check('delay from fps', frameDelayMs(12) === 83, frameDelayMs(12));
check('delay never zero', frameDelayMs(10000) === 1);

// fitScale: cap the longest side, never upscale
check('wide source scales down', fitScale(1800, 900) === 0.5);
check('small source stays 1:1', fitScale(400, 900) === 1);
check('exact cap stays 1:1', fitScale(900, 900) === 1);
check('zero width is safe', fitScale(0, 900) === 1);

// defaults + filename sanity
check('defaults are size-conscious', GIF_DEFAULTS.maxWidth === 900 && GIF_DEFAULTS.fps === 12);
check('filename', gifFileName() === 'diagram.gif');

if (failed) process.exit(1);
console.log('PASS: gif cycle length, frame maths and scaling');
