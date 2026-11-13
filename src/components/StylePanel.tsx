import { useStyleDefaults } from '../useStyleDefaults';
import { useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { DEFAULT_IMAGE_SIZE, type DiagramNode, type ElementStyle } from '../types';
import { asImageSrc, isDataUri, kb, readImageFile, sizedImage } from '../imageUpload';
import {
  ANIMATIONS,
  ANIM_SPEEDS,
  BACKGROUND_COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  SLOPPINESS,
  STROKE_COLORS,
  STROKE_STYLES,
  STROKE_WIDTHS,
} from '../style';

type K = keyof ElementStyle;

const STROKE_STYLE_GLYPH: Record<string, string> = {
  solid: '——',
  dashed: '- -',
  dotted: '···',
};
const SLOPPINESS_GLYPH = ['╱', '〰', '≈'];
const FONT_GLYPH: Record<string, string> = {
  hand: '✎',
  sans: 'Aa',
  serif: 'Af',
  mono: 'A>',
};

/**
 * Excalidraw-style properties panel. It appears on the left whenever one or
 * more elements are selected and edits the shared ElementStyle of every
 * selected node/edge at once.
 */
export function StylePanel() {
  const STYLE_DEFAULTS = useStyleDefaults();
  const selectedNodeIds = useDiagram((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDiagram((s) => s.selectedEdgeIds);
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const updateNodeStyle = useDiagram((s) => s.updateNodeStyle);
  const updateEdgeStyle = useDiagram((s) => s.updateEdgeStyle);
  const setEdgeOrder = useDiagram((s) => s.setEdgeOrder);

  const hasNodes = selectedNodeIds.length > 0;
  const hasEdges = selectedEdgeIds.length > 0;
  const open = hasNodes || hasEdges;

  // the style of the first selected element seeds the active-state highlights
  const selStyles = useMemo<ElementStyle[]>(() => {
    const ns = nodes
      .filter((n) => selectedNodeIds.includes(n.id))
      .map((n) => n.style ?? {});
    const es = edges
      .filter((e) => selectedEdgeIds.includes(e.id))
      .map((e) => e.style ?? {});
    return [...ns, ...es];
  }, [nodes, edges, selectedNodeIds, selectedEdgeIds]);

  if (!open) return null;

  const selEdgeOrder = edges.find((e) => selectedEdgeIds.includes(e.id) && e.order != null)?.order;

  /** current value for a property across the selection (first element wins). */
  const val = <T extends K>(key: T): ElementStyle[T] | undefined => {
    for (const s of selStyles) if (s[key] != null) return s[key];
    return undefined;
  };

  /** whether `key` currently equals `value` on every selected element. */
  const active = <T extends K>(key: T, value: ElementStyle[T]): boolean => {
    const cur = val(key) ?? STYLE_DEFAULTS[key as keyof typeof STYLE_DEFAULTS];
    return cur === value;
  };

  const patch = (p: Partial<ElementStyle>) => {
    if (hasNodes) updateNodeStyle(selectedNodeIds, p);
    if (hasEdges) updateEdgeStyle(selectedEdgeIds, p);
  };

  const count = selectedNodeIds.length + selectedEdgeIds.length;
  const imageNode =
    count === 1 && hasNodes ? nodes.find((n) => n.id === selectedNodeIds[0] && n.image) : undefined;

  return (
    <aside className="mf-style-panel" aria-label="Style properties">
      <div className="mf-panel-head">
        <span className="mf-panel-title">
          Style{count > 1 ? ` · ${count}` : ''}
        </span>
      </div>

      {imageNode && <ImageSection key={imageNode.id} node={imageNode} />}

      <section className="mf-style-section">
        <label className="mf-style-label">Stroke</label>
        <div className="mf-swatch-row">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              className={`mf-swatch${active('stroke', c) ? ' active' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`Stroke ${c}`}
              onClick={() => patch({ stroke: c })}
            />
          ))}
          <label className="mf-swatch mf-swatch-custom" title="Custom stroke color">
            <input
              type="color"
              value={toHex(val('stroke')) ?? '#2a2723'}
              onChange={(e) => patch({ stroke: e.target.value })}
            />
          </label>
        </div>
      </section>

      {hasNodes && (
        <section className="mf-style-section">
          <label className="mf-style-label">Background</label>
          <div className="mf-swatch-row">
            {BACKGROUND_COLORS.map((c) => (
              <button
                key={c}
                className={`mf-swatch${active('background', c) ? ' active' : ''}${
                  c === 'transparent' ? ' is-transparent' : ''
                }`}
                style={c === 'transparent' ? undefined : { background: c }}
                title={c}
                aria-label={`Background ${c}`}
                onClick={() => patch({ background: c })}
              />
            ))}
            <label
              className="mf-swatch mf-swatch-custom"
              title="Custom background color"
            >
              <input
                type="color"
                value={toHex(val('background')) ?? '#fffdf8'}
                onChange={(e) => patch({ background: e.target.value })}
              />
            </label>
          </div>
        </section>
      )}

      <section className="mf-style-section">
        <label className="mf-style-label">Stroke width</label>
        <div className="mf-seg">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w.value}
              className={active('strokeWidth', w.value) ? 'active' : ''}
              title={w.label}
              onClick={() => patch({ strokeWidth: w.value })}
            >
              <span
                className="mf-width-bar"
                style={{ height: Math.max(1, w.value) }}
              />
            </button>
          ))}
        </div>
      </section>

      <section className="mf-style-section">
        <label className="mf-style-label">Stroke style</label>
        <div className="mf-seg">
          {STROKE_STYLES.map((s) => (
            <button
              key={s}
              className={active('strokeStyle', s) ? 'active' : ''}
              title={s}
              onClick={() => patch({ strokeStyle: s })}
            >
              {STROKE_STYLE_GLYPH[s]}
            </button>
          ))}
        </div>
      </section>

      <section className="mf-style-section">
        <label className="mf-style-label">Sloppiness</label>
        <div className="mf-seg">
          {SLOPPINESS.map((s) => (
            <button
              key={s}
              className={active('sloppiness', s) ? 'active' : ''}
              title={['Ink', 'Sketch', 'Scribble'][s]}
              onClick={() => patch({ sloppiness: s })}
            >
              {SLOPPINESS_GLYPH[s]}
            </button>
          ))}
        </div>
      </section>

      {hasNodes && (
        <section className="mf-style-section">
          <label className="mf-style-label">Edges</label>
          <div className="mf-seg">
            <button
              className={active('edges', 'sharp') ? 'active' : ''}
              title="Sharp"
              onClick={() => patch({ edges: 'sharp' })}
            >
              ⬛
            </button>
            <button
              className={active('edges', 'round') ? 'active' : ''}
              title="Round"
              onClick={() => patch({ edges: 'round' })}
            >
              ⬭
            </button>
          </div>
        </section>
      )}

      <section className="mf-style-section">
        <label className="mf-style-label">Font family</label>
        <div className="mf-seg">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f}
              className={active('fontFamily', f) ? 'active' : ''}
              title={f}
              onClick={() => patch({ fontFamily: f })}
            >
              {FONT_GLYPH[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="mf-style-section">
        <label className="mf-style-label">Font size</label>
        <div className="mf-seg">
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.value}
              className={active('fontSize', fs.value) ? 'active' : ''}
              title={`${fs.value}px`}
              onClick={() => patch({ fontSize: fs.value })}
            >
              {fs.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mf-style-section">
        <label className="mf-style-label">
          Opacity
          <span className="mf-style-value">
            {Math.round((val('opacity') ?? STYLE_DEFAULTS.opacity) * 100)}%
          </span>
        </label>
        <input
          className="mf-opacity"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round((val('opacity') ?? STYLE_DEFAULTS.opacity) * 100)}
          onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
        />
      </section>

      {(() => {
        // show presets that fit the selection: node-only when only nodes are
        // selected, edge-only when only edges, and the union for a mix
        const anims = ANIMATIONS.filter((a) => {
          if (a.appliesTo === 'both') return true;
          if (a.appliesTo === 'node') return hasNodes;
          return hasEdges;
        });
        const curAnim = (val('animation') ?? STYLE_DEFAULTS.animation) as string;
        return (
          <section className="mf-style-section">
            <label className="mf-style-label">Animation</label>
            <div className="mf-seg mf-seg-wrap">
              {anims.map((a) => (
                <button
                  key={a.kind}
                  className={active('animation', a.kind) ? 'active' : ''}
                  title={a.label}
                  aria-label={`Animation ${a.label}`}
                  onClick={() => patch({ animation: a.kind })}
                >
                  {a.glyph}
                </button>
              ))}
            </div>
            {curAnim !== 'none' && (
              <div className="mf-seg mf-anim-speed">
                {ANIM_SPEEDS.map((s) => (
                  <button
                    key={s.value}
                    className={active('animationSpeed', s.value) ? 'active' : ''}
                    title={s.label}
                    onClick={() => patch({ animationSpeed: s.value })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })()}
      {hasEdges && (
        <section className="mf-style-section">
          <label className="mf-style-label">Flow step</label>
          <input
            className="mf-picker-filter"
            type="number"
            min={1}
            step={1}
            aria-label="Flow step"
            placeholder="Auto"
            value={selEdgeOrder ?? ''}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              setEdgeOrder(selectedEdgeIds, e.target.value === '' || n < 1 ? undefined : n);
            }}
          />
        </section>
      )}
    </aside>
  );
}

/** image size presets; px labels, so they don't read as the font S/M/L */
const IMAGE_SIZES = [48, DEFAULT_IMAGE_SIZE, 128];

/** Source, label position and size of a single selected image node. */
function ImageSection({ node }: { node: DiagramNode }) {
  const updateNodeImage = useDiagram((s) => s.updateNodeImage);
  const image = node.image!;
  const embedded = isDataUri(image.src);
  const [draft, setDraft] = useState(embedded ? '' : image.src);
  // the source can also change from the Mermaid panel or undo: follow it
  const [seenSrc, setSeenSrc] = useState(image.src);
  if (seenSrc !== image.src) {
    setSeenSrc(image.src);
    setDraft(embedded ? '' : image.src);
  }
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const w = image.w ?? DEFAULT_IMAGE_SIZE;
  const h = image.h ?? DEFAULT_IMAGE_SIZE;
  const longest = Math.max(w, h);

  const commitUrl = () => {
    if (!draft.trim() || draft.trim() === image.src) return;
    const src = asImageSrc(draft);
    if (!src) return setError('enter an http(s) image URL');
    setError(null);
    // keep the node's current footprint, reshaped to the new picture
    sizedImage(src, longest).then((next) => updateNodeImage(node.id, next));
  };

  return (
    <section className="mf-style-section">
      <label className="mf-style-label">
        Image
        {embedded && <span className="mf-style-value">Embedded · {kb(image.src)} KB</span>}
      </label>
      <div className="mf-image-src">
        <input
          className="mf-picker-filter"
          aria-label="Image URL"
          placeholder={embedded ? 'Replace with a URL…' : 'https://…'}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commitUrl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitUrl();
          }}
        />
        <button className="mf-image-upload" title="Upload an image (embedded)" onClick={() => file.current?.click()}>
          Upload
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              updateNodeImage(node.id, await readImageFile(f, longest));
              setDraft('');
              setError(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </div>
      {error && <p className="mf-picker-error">{error}</p>}
      {embedded && !error && (
        <p className="mf-style-hint">Embedded images work in marmerlade and mermaid.live; GitHub blocks data: images.</p>
      )}
      <div className="mf-seg">
        {IMAGE_SIZES.map((px) => (
          <button
            key={px}
            className={longest === px ? 'active' : ''}
            title={`Longest side ${px}px`}
            aria-label={`Image size ${px}px`}
            // scale the longest side, keeping the node's proportions
            onClick={() =>
              updateNodeImage(node.id, { w: Math.round((w * px) / longest), h: Math.round((h * px) / longest) })
            }
          >
            {px}
          </button>
        ))}
      </div>
      <div className="mf-seg">
        <button
          className={image.pos !== 't' ? 'active' : ''}
          title="Label below the image"
          onClick={() => updateNodeImage(node.id, { pos: undefined })}
        >
          Label ↓
        </button>
        <button
          className={image.pos === 't' ? 'active' : ''}
          title="Label above the image"
          onClick={() => updateNodeImage(node.id, { pos: 't' })}
        >
          Label ↑
        </button>
      </div>
      <label className="mf-image-check">
        <input
          type="checkbox"
          checked={!!image.constraint}
          onChange={(e) => updateNodeImage(node.id, { constraint: e.target.checked })}
        />
        Keep aspect ratio
      </label>
    </section>
  );
}

/** Coerce a stored color into a #rrggbb value the native color input accepts. */
function toHex(c: string | undefined): string | undefined {
  if (!c || c === 'transparent') return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return '#' + c.slice(1).split('').map((x) => x + x).join('');
  }
  return undefined; // CSS var or named color — let the input keep its default
}
