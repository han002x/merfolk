// Node outlines and icon artwork. Every node is drawn as ink on paper: a clean
// fill under a hand-drawn outline (src/rough.ts), sized to the node in pixels
// so the wobble never stretches.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ElementStyle, NodeShape } from '../types';
import { shapeDef } from '../shapes';
import { ICON_BY_ID } from '../icons/catalog';
import { STYLE_DEFAULTS, dashArray } from '../style';
import { roughOutline } from '../rough';

/** Layout size of the element's parent (unaffected by canvas zoom). */
function useParentSize(ref: React.RefObject<Element | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const read = () =>
      setSize((s) =>
        s && s.w === parent.clientWidth && s.h === parent.clientHeight
          ? s
          : { w: parent.clientWidth, h: parent.clientHeight },
      );
    read();
    const ro = new ResizeObserver(read);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Offsets of the pages stacked beneath a folded card. */
const PAGES = [8, 4];

/** Hand-drawn outline for a node body; fills its parent box. */
export function ShapeOutline({
  shape,
  icon = false,
  rounded = true,
  style,
  seed = 1,
  flowDash: flow,
  pages = false,
}: {
  shape: NodeShape;
  /** an icon tile (its shape only picks the corners) */
  icon?: boolean;
  rounded?: boolean;
  style?: ElementStyle;
  /** stable per-element seed (see seedOf) */
  seed?: number;
  /** dash pattern while the flow animation runs (follows the stroke style) */
  flowDash?: string;
  /** a folded card: draw its folded pages stacked underneath */
  pages?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const size = useParentSize(ref);
  const sloppiness = style?.sloppiness ?? STYLE_DEFAULTS.sloppiness;
  const strokeStyle = style?.strokeStyle ?? STYLE_DEFAULTS.strokeStyle;
  const drawing = style?.animation === 'draw';
  // dashes and animations run along one continuous line
  const continuous = strokeStyle !== 'solid' || flow != null || drawing;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;

  const art = useMemo(() => {
    if (!w || !h) return null;
    const opts = { rounded, icon, sloppiness, continuous };
    return {
      body: roughOutline(shape, w, h, { ...opts, seed }),
      pages: pages ? PAGES.map((_, i) => roughOutline(shape, w, h, { ...opts, seed: seed + 7 + i })) : [],
    };
  }, [shape, w, h, rounded, icon, sloppiness, continuous, seed, pages]);

  const width = style?.strokeWidth;
  const dash = dashArray(strokeStyle, width ?? 1);
  const inkCss = { stroke: style?.stroke, strokeWidth: width, strokeDasharray: flow ?? dash };
  const detailCss = { stroke: style?.stroke, strokeWidth: width, strokeDasharray: dash };

  return (
    <svg ref={ref} className="mf-outline" viewBox={`0 0 ${w || 1} ${h || 1}`} aria-hidden="true">
      {art && (
        <>
          {art.pages.map((p, i) => (
            <g key={i} className="mf-outline-page" transform={`translate(${PAGES[i]} ${PAGES[i]})`}>
              <path className="mf-outline-fill" d={p.fill} />
              <path className="mf-outline-ink" d={p.ink} />
            </g>
          ))}
          <path className="mf-outline-fill" d={art.body.fill} style={{ fill: style?.background }} />
          <path className="mf-outline-ink" d={art.body.ink} pathLength={drawing ? 100 : undefined} style={inkCss} />
          {art.body.detail && <path className="mf-outline-detail" d={art.body.detail} style={detailCss} />}
        </>
      )}
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
