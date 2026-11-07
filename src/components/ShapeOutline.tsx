// Node outlines and icon artwork. Box-like shapes are plain CSS borders
// (`shapeCss` in src/shapes.ts); the rest (cylinder, hexagon, parallelograms,
// ...) are an SVG path stretched over the node (`ShapeOutline`).
import type { ElementStyle, NodeShape } from '../types';
import { shapeDef } from '../shapes';
import { ICON_BY_ID } from '../icons/catalog';
import { dashArray } from '../style';

/** SVG outline for shapes CSS can't draw; renders nothing for the others. */
export function ShapeOutline({
  shape,
  style,
  flowDash: flow,
}: {
  shape: NodeShape;
  style?: ElementStyle;
  /** dash pattern while the flow animation runs (follows the stroke style) */
  flowDash?: string;
}) {
  const { outline, detail } = shapeDef(shape);
  if (!outline) return null;
  const width = style?.strokeWidth;
  const stroke = {
    stroke: style?.stroke,
    strokeWidth: width,
    strokeDasharray:
      flow ?? (style?.strokeStyle ? dashArray(style.strokeStyle, width ?? 1) : undefined),
  };
  const detailStroke = flow
    ? { ...stroke, strokeDasharray: style?.strokeStyle ? dashArray(style.strokeStyle, width ?? 1) : undefined }
    : stroke;
  return (
    <svg className="mf-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={outline} pathLength={100} vectorEffect="non-scaling-stroke" style={{ ...stroke, fill: style?.background }} />
      {detail && <path className="mf-outline-detail" d={detail} vectorEffect="non-scaling-stroke" style={detailStroke} />}
    </svg>
  );
}

// Small 24x24 previews for the picker: box shapes as paths, outline shapes
// reuse their outline squeezed into a 20x14 (or 16x16) box. Inner lines sit
// further in than on a node so they stay legible at this size.
const GLYPH_DETAIL: Partial<Record<NodeShape, string>> = {
  subroutine: 'M20 0V100M80 0V100',
  'dbl-circle': 'M22 50A28 28 0 1 0 78 50A28 28 0 1 0 22 50Z',
};
const BOX_GLYPH: Partial<Record<NodeShape, string>> = {
  rect: 'M0 0H100V100H0Z',
  round: 'M25 0H75A25 25 0 0 1 100 25V75A25 25 0 0 1 75 100H25A25 25 0 0 1 0 75V25A25 25 0 0 1 25 0Z',
  circle: 'M0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z',
  diamond: 'M50 0L100 50L50 100L0 50Z',
};

export function ShapeGlyph({ shape, size = 18 }: { shape: NodeShape; size?: number }) {
  const def = shapeDef(shape);
  const d = def.outline ?? BOX_GLYPH[shape] ?? BOX_GLYPH.rect!;
  const detail = GLYPH_DETAIL[shape] ?? def.detail;
  // wide shapes sit in a 20x14 box, square ones in 16x16
  const [w, h] = def.square ? [16, 16] : [20, 14];
  const stadium = shape === 'stadium';
  return (
    <svg className="mf-svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {stadium ? (
        <rect x={2} y={5} width={20} height={14} rx={7} fill="none" stroke="currentColor" strokeWidth={1.6} />
      ) : (
        <svg x={(24 - w) / 2} y={(24 - h) / 2} width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
          <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {detail && <path d={detail} fill="none" stroke="currentColor" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
    </svg>
  );
}

/**
 * A catalog icon (Lucide / Simple Icons artwork), tinted with currentColor.
 * Ids outside the catalog (e.g. `logos:aws` from an imported diagram) fall back
 * to a neutral tile glyph so the node still reads as an icon.
 */
export function CatalogIcon({ id, size = 28 }: { id: string; size?: number }) {
  const entry = ICON_BY_ID.get(id);
  return (
    <svg
      className="mf-catalog-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html:
          entry?.body ??
          '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="2.5"/></g>',
      }}
    />
  );
}
