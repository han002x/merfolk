// The single table of node shapes: picker name, Mermaid syntax, and outline.
// The Mermaid parser, serializer, renderer and toolbar all read from here, so
// adding a shape is one row.
//
// Every shape uses Mermaid's classic bracket syntax (works in every Mermaid
// version, GitHub included). `aliases` are the Mermaid v11 `@{ shape: ... }`
// names that import as the same shape.
import type { CSSProperties } from 'react';
import type { NodeShape } from './types';

export interface ShapeDef {
  shape: NodeShape;
  name: string;
  /** Mermaid delimiters around the label: `id${open}"label"${close}` */
  open: string;
  close: string;
  aliases: string[];
  /**
   * outline in a 100x100 box, stretched to the node. Missing => the shape is
   * drawn with CSS borders (rect, round, stadium, circle, diamond)
   */
  outline?: string;
  /** stroke-only inner lines drawn over the outline (same 100x100 box) */
  detail?: string;
  /** fixed square footprint (circles, diamonds) instead of a label-sized box */
  square?: number;
}

export const SHAPES: ShapeDef[] = [
  { shape: 'rect', name: 'Rectangle', open: '[', close: ']', aliases: ['rect', 'rectangle', 'process', 'proc'] },
  { shape: 'round', name: 'Rounded', open: '(', close: ')', aliases: ['rounded', 'event'] },
  { shape: 'stadium', name: 'Stadium', open: '([', close: '])', aliases: ['stadium', 'pill', 'terminal'] },
  {
    shape: 'subroutine',
    name: 'Subroutine',
    open: '[[',
    close: ']]',
    aliases: ['subroutine', 'fr-rect', 'subprocess', 'subproc', 'framed-rectangle'],
    outline: 'M0 0H100V100H0Z',
    detail: 'M8 0V100M92 0V100',
  },
  {
    shape: 'cylinder',
    name: 'Cylinder',
    open: '[(',
    close: ')]',
    aliases: ['cyl', 'cylinder', 'database', 'db'],
    outline: 'M0 12A50 12 0 0 1 100 12V88A50 12 0 0 1 0 88Z',
    detail: 'M0 12A50 12 0 0 0 100 12',
  },
  { shape: 'circle', name: 'Circle', open: '((', close: '))', aliases: ['circle', 'circ'], square: 90 },
  {
    shape: 'dbl-circle',
    name: 'Double circle',
    open: '(((',
    close: ')))',
    aliases: ['dbl-circ', 'double-circle'],
    outline: 'M0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z',
    detail: 'M7 50A43 43 0 1 0 93 50A43 43 0 1 0 7 50Z',
    square: 90,
  },
  { shape: 'diamond', name: 'Diamond', open: '{', close: '}', aliases: ['diam', 'diamond', 'decision', 'question'], square: 90 },
  {
    shape: 'hexagon',
    name: 'Hexagon',
    open: '{{',
    close: '}}',
    aliases: ['hex', 'hexagon', 'prepare'],
    outline: 'M12 0H88L100 50L88 100H12L0 50Z',
  },
  {
    shape: 'lean-r',
    name: 'Parallelogram',
    open: '[/',
    close: '/]',
    aliases: ['lean-r', 'lean-right', 'in-out'],
    outline: 'M14 0H100L86 100H0Z',
  },
  {
    shape: 'lean-l',
    name: 'Parallelogram (left)',
    open: '[\\',
    close: '\\]',
    aliases: ['lean-l', 'lean-left', 'out-in'],
    outline: 'M0 0H86L100 100H14Z',
  },
  {
    shape: 'trap-b',
    name: 'Trapezoid',
    open: '[/',
    close: '\\]',
    aliases: ['trap-b', 'trapezoid', 'trapezoid-bottom', 'priority'],
    outline: 'M14 0H86L100 100H0Z',
  },
  {
    shape: 'trap-t',
    name: 'Trapezoid (inverted)',
    open: '[\\',
    close: '/]',
    aliases: ['trap-t', 'inv-trapezoid', 'trapezoid-top', 'manual'],
    outline: 'M0 0H100L86 100H14Z',
  },
  {
    shape: 'flag',
    name: 'Flag',
    open: '>',
    close: ']',
    aliases: ['odd'],
    outline: 'M0 0H100V100H0L14 50Z',
  },
];

export const SHAPE_DEF: ReadonlyMap<NodeShape, ShapeDef> = new Map(SHAPES.map((d) => [d.shape, d]));

/** `@{ shape: alias }` name -> shape */
export const SHAPE_ALIAS: ReadonlyMap<string, NodeShape> = new Map(
  SHAPES.flatMap((d) => d.aliases.map((a) => [a, d.shape] as const)),
);

export function shapeDef(shape: NodeShape): ShapeDef {
  return SHAPE_DEF.get(shape) ?? SHAPES[0];
}

/** Mermaid icon `form` for a node's shape, and back. */
export function iconForm(shape: NodeShape): 'square' | 'rounded' | 'circle' {
  return shape === 'circle' ? 'circle' : shape === 'round' ? 'rounded' : 'square';
}
export function shapeForForm(form: string | undefined): NodeShape {
  return form === 'circle' ? 'circle' : form === 'rounded' ? 'round' : 'rect';
}

/** CSS for a node body of `shape` (outline shapes only get their footprint). */
export function shapeCss(shape: NodeShape, rounded: boolean): CSSProperties {
  const { square } = shapeDef(shape);
  const box: CSSProperties = square
    ? { width: square, height: square, minWidth: square, minHeight: square }
    : {};
  switch (shape) {
    case 'rect':
      return { borderRadius: rounded ? 12 : 0 };
    case 'round':
      return { borderRadius: 24 };
    case 'stadium':
      return { borderRadius: 999 };
    case 'circle':
      return { ...box, borderRadius: '50%' };
    case 'diamond':
      return { ...box, transform: 'rotate(45deg)' };
    default:
      return box;
  }
}

/** CSS for an icon tile; its shape only picks the corners (Mermaid's `form`). */
export function iconTileCss(shape: NodeShape, rounded: boolean): CSSProperties {
  if (shape === 'circle') return { width: 90, height: 90, minWidth: 90, minHeight: 90, borderRadius: '50%' };
  return { borderRadius: shape === 'round' ? 22 : rounded ? 12 : 0 };
}

export const hasOutline = (shape: NodeShape) => shapeDef(shape).outline != null;
