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

/** Preset stroke colors shown as swatches in the panel. */
export const STROKE_COLORS = [
  '#e6e8ec', // default (theme ink)
  '#e03131', // red
  '#2f9e44', // green
  '#1971c2', // blue
  '#f08c00', // amber
  '#ae3ec9', // purple
];

/** Preset background fills. 'transparent' is first so it's the obvious default. */
export const BACKGROUND_COLORS = [
  'transparent',
  '#ffc9c9', // red tint
  '#b2f2bb', // green tint
  '#a5d8ff', // blue tint
  '#ffec99', // amber tint
  '#eebefa', // purple tint
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
  { kind: 'flow', label: 'Flow', glyph: '⇶', appliesTo: 'edge' },
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
  stroke: 'var(--mf-border)',
  background: 'var(--mf-node)',
  strokeWidth: 1,
  strokeStyle: 'solid',
  sloppiness: 0,
  edges: 'round',
  fontFamily: 'sans',
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
      return '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';
    default:
      return 'var(--mf-sans)';
  }
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
