// Hand-drawn ink is deterministic, well-formed for every shape, and clean at
// sloppiness 0. Run with: node --experimental-strip-types scripts/rough.ts
import { arrowHead, ink, roughOutline, scalePath, seedOf, shapePath } from '../src/rough.ts';
import { SHAPES } from '../src/shapes.ts';
import type { Sloppiness } from '../src/types.ts';

const fails: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) fails.push(msg);
};
const wellFormed = (d: string) => d.length > 0 && !/NaN|Infinity|undefined/.test(d);
const subpaths = (d: string) => (d.match(/M/g) ?? []).length;

// scaling the 100-box outlines is exact
check(
  scalePath('M0 12A50 12 0 0 1 100 12V88A50 12 0 0 1 0 88Z', 2, 0.5) === 'M0 6A100 6 0 0 1 200 6V44A100 6 0 0 1 0 44Z',
  'scalePath: cylinder outline scales rx/x by sx and ry/y by sy',
);
check(scalePath('M14 0H100L86 100H0Z', 1.5, 0.4) === 'M21 0H150L129 40H0Z', 'scalePath: M/H/L/Z');

for (const { shape } of SHAPES) {
  for (const icon of [false, true]) {
    for (const s of [0, 1, 2] as Sloppiness[]) {
      const tag = `${shape}${icon ? ' (icon)' : ''} @${s}`;
      const o = roughOutline(shape, 140, 60, { rounded: true, icon, sloppiness: s, seed: seedOf(shape) });
      check(wellFormed(o.fill) && wellFormed(o.ink), `${tag}: well-formed paths`);
      if (o.detail) check(wellFormed(o.detail), `${tag}: well-formed detail`);
      if (s === 0) check(o.ink === shapePath(shape, 140, 60, { rounded: true, icon }).outline, `${tag}: ink is the clean outline`);
      if (s === 1) check(subpaths(o.ink) === 1, `${tag}: a sketch is one continuous line (got ${subpaths(o.ink)})`);
      if (s === 2) check(subpaths(o.ink) > 1, `${tag}: a scribble goes over the line twice`);
      const again = roughOutline(shape, 140, 60, { rounded: true, icon, sloppiness: s, seed: seedOf(shape) });
      check(again.ink === o.ink, `${tag}: same seed draws the same line`);
    }
  }
}

// different elements wobble differently; dashed scribbles stay continuous
const a = roughOutline('rect', 120, 48, { rounded: true, sloppiness: 1, seed: seedOf('a') }).ink;
const b = roughOutline('rect', 120, 48, { rounded: true, sloppiness: 1, seed: seedOf('b') }).ink;
check(a !== b, 'different seeds draw different lines');
const dashed = roughOutline('rect', 120, 48, { rounded: true, sloppiness: 2, seed: 9, continuous: true }).ink;
check(subpaths(dashed) === 1, 'a continuous scribble is one line');

// edges keep their end points, so they still meet the handles
const edge = ink('M10,20 C10,80 200,80 200,140', { sloppiness: 2, seed: 4, continuous: true, pinEnds: true });
check(edge.startsWith('M10 20'), `edge starts on its handle (${edge.slice(0, 12)})`);
check(/200 140$/.test(edge), `edge ends on its handle (${edge.slice(-12)})`);

// the chevron's tip is the target point and it points into the node
for (const side of ['top', 'bottom', 'left', 'right'] as const) {
  const d = arrowHead(50, 50, side, { sloppiness: 0, seed: 1 });
  check(d.includes('L50 50'), `arrow ${side}: tip at the target`);
  const [x, y] = d.slice(1).split('L')[0].split(' ').map(Number);
  const ok = side === 'top' ? y < 50 : side === 'bottom' ? y > 50 : side === 'left' ? x < 50 : x > 50;
  check(ok, `arrow ${side}: wings sit outside the node`);
  check(wellFormed(arrowHead(50, 50, side, { sloppiness: 2, seed: 1 })), `arrow ${side}: sketched form is well-formed`);
}

if (fails.length) {
  console.error(`rough: ${fails.length} failure(s)\n  ` + fails.join('\n  '));
  process.exit(1);
}
console.log('rough: all checks passed');
