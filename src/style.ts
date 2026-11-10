// Shared helpers that turn an optional ElementStyle into concrete values and
// CSS. Keeping this in one place means the style panel, node renderer and edge
// renderer all agree on defaults and mappings.
import type {
  AnimationKind,
  ElementStyle,
  FontFamily,
  Sloppiness,
  StrokeStyle,
} from './types';

/** Preset ink colors shown as swatches in the panel. */
export const STROKE_COLORS = [
  'var(--mf-ink)', // theme ink: sumi on paper, chalk on night paper
  '#c8442b', // vermilion
  '#4f7a3a', // moss
  '#3b5b9a', // indigo
  '#c08a1e', // ochre
  '#8a4a7a', // plum
];

/** Preset paper fills (washi tints). 'transparent' is first so it's the obvious default. */
export const BACKGROUND_COLORS = [
  'transparent',
  '#f6d6cf', // sakura
  '#dbe7c9', // matcha
  '#d4e2f0', // sky
  '#f4e4b4', // kraft yellow
  '#e4d9ef', // wisteria
];

export const STROKE_WIDTHS: { value: number; label: string }[] = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Bold' },
  { value: 4, label: 'Extra bold' },
];

export const STROKE_STYLES: StrokeStyle[] = ['solid', 'dashed', 'dotted'];

export const SLOPPINESS: Sloppiness[] = [0, 1, 2];

export const FONT_SIZES: { value: number; label: string }[] = [
  { value: 11, label: 'S' },
  { value: 13, label: 'M' },
  { value: 18, label: 'L' },
  { value: 24, label: 'XL' },
];

export const FONT_FAMILIES: FontFamily[] = ['hand', 'sans', 'serif', 'mono'];

/** Which element kind each motion preset reads best on. */
export type AnimApplies = 'node' | 'edge' | 'both';

/** Motion presets shown in the panel, with the element kind they apply to. */
export const ANIMATIONS: {
  kind: AnimationKind;
  label: string;
  glyph: string;
  appliesTo: AnimApplies;
}[] = [
  { kind: 'none', label: 'None', glyph: '∅', appliesTo: 'both' },
  { kind: 'pulse', label: 'Pulse', glyph: '◎', appliesTo: 'node' },
  { kind: 'fade', label: 'Fade in', glyph: '◐', appliesTo: 'node' },
  { kind: 'draw', label: 'Draw on', glyph: '✍', appliesTo: 'node' },
  { kind: 'flow', label: 'Flow', glyph: '⇶', appliesTo: 'both' },
];

/** Named cycle lengths (seconds) offered when an animation is active. */
export const ANIM_SPEEDS: { value: number; label: string }[] = [
  { value: 3, label: 'Slow' },
  { value: 1.6, label: 'Normal' },
  { value: 0.8, label: 'Fast' },
];

/** Defaults applied when an element has no explicit value for a property. */
export const STYLE_DEFAULTS: Required<
  Omit<ElementStyle, 'stroke' | 'background'>
> & { stroke: string; background: string } = {
  stroke: 'var(--mf-ink)',
  background: 'var(--mf-node)',
  strokeWidth: 1,
  strokeStyle: 'solid',
  sloppiness: 1,
  edges: 'round',
  fontFamily: 'hand',
  fontSize: 13,
  opacity: 1,
  animation: 'none',
  animationSpeed: 1.6,
};

export function fontFamilyCss(f: FontFamily): string {
  switch (f) {
    case 'serif':
      return 'ui-serif, Georgia, "Times New Roman", serif';
    case 'mono':
      return 'var(--mf-mono)';
    case 'hand':
      return 'var(--mf-hand)';
    default:
      return 'var(--mf-sans)';
  }
}

/**
 * Text color for a node filled with `background`: on a light fill (the washi
 * tints) the label stays sumi ink even on night paper, so it never vanishes.
 * Unset, transparent or dark fills keep the theme's text color.
 */
export function inkOn(background: string | undefined): string | undefined {
  const m = background?.match(/^#([0-9a-f]{6})$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#2a2723' : undefined;
}

/** Map a stroke style + width to an SVG/CSS dash array. */
export function dashArray(style: StrokeStyle, width: number): string | undefined {
  switch (style) {
    case 'dashed':
      return `${width * 3} ${width * 2.5}`;
    case 'dotted':
      return `${width} ${width * 2}`;
    default:
      return undefined;
  }
}

/**
 * Dash pattern for a flowing stroke, plus its period (dash + gap). Flow follows
 * the element's own stroke style; a solid stroke gets a default dash, since
 * marching needs gaps to be seen. The keyframes shift by exactly one period,
 * so the loop is seamless whatever the style or width.
 */
export function flowDash(
  style: StrokeStyle,
  width: number,
): { array: string; period: number } {
  const [dash, gap] =
    style === 'dashed'
      ? [width * 3, width * 2.5]
      : style === 'dotted'
        ? [width, width * 2]
        : [width * 4, width * 3];
  return { array: `${dash} ${gap}`, period: dash + gap };
}

/** CSS class that drives an element's motion preset (null => no animation). */
export function animationClass(a: AnimationKind | undefined): string | null {
  switch (a) {
    case 'pulse':
      return 'mf-anim-pulse';
    case 'fade':
      return 'mf-anim-fade';
    case 'draw':
      return 'mf-anim-draw';
    case 'flow':
      return 'mf-anim-flow';
    default:
      return null;
  }
}
