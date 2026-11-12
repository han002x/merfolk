import { memo, useMemo, useState } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import { DEFAULT_IMAGE_SIZE, type ElementStyle, type NodeImage, type NodeShape } from '../types';
import { useDiagram } from '../store';
import { useFoldMotion } from '../foldMotion';
import { STYLE_DEFAULTS, animationClass, flowDash, fontFamilyCss, inkOn } from '../style';
import { CatalogIcon, ShapeOutline } from './ShapeOutline';
import { PageButton } from './PageButton';
import { iconTileCss, shapeCss } from '../shapes';
import { seedOf } from '../rough';

export interface NodeData {
  label: string;
  shape: NodeShape;
  /** Iconify id: the node renders as an icon tile */
  icon?: string;
  /** Mermaid `img` node: the picture with the label above or below */
  image?: NodeImage;
  isGroup: boolean;
  collapsed: boolean;
  /** how many nodes are folded inside this card */
  childCount: number;
  style?: ElementStyle;
  /** flow clock reading at which the sequence reaches this node */
  flowAt?: number;
  [key: string]: unknown;
}

/** An image node's picture; a broken or blocked source shows a placeholder. */
export function NodeImg({ image }: { image: NodeImage }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const w = image.w ?? DEFAULT_IMAGE_SIZE;
  const h = image.h ?? DEFAULT_IMAGE_SIZE;
  if (failedSrc === image.src) {
    return (
      <span className="mf-node-img is-broken" style={{ width: w, height: h }} title="Image failed to load">
        <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden>
          <path
            d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M3 3l18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <img
      className="mf-node-img"
      src={image.src}
      alt=""
      draggable={false}
      style={{ width: w, height: h, objectFit: image.constraint ? 'contain' : 'fill' }}
      onError={() => setFailedSrc(image.src)}
    />
  );
}

function DiagramNodeInner({ id, data, selected, dragging }: NodeProps) {
  const d = data as NodeData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label);
  const updateLabel = useDiagram((s) => s.updateLabel);
  const toggleFold = useFoldMotion((s) => s.toggle);
  const setHighlight = useDiagram((s) => s.setHighlight);
  // highlighted when the mermaid editor (or another surface) points at this node
  const highlighted = useDiagram(
    (s) => s.highlight?.kind === 'node' && s.highlight.id === id,
  );

  // live connection state: true while dragging a new edge, and whether this
  // node is the current drop target (for the join-preview highlight)
  const connecting = useConnection((c) => c.inProgress);
  const isConnectionTarget = useConnection(
    (c) => c.inProgress && c.toNode?.id === id,
  );

  const commit = () => {
    updateLabel(id, draft.trim());
    setEditing(false);
  };

  const image = d.image;
  // an image wins over an icon; both draw as a tile whose shape picks corners
  const icon = image ? undefined : d.icon;
  const tile = !!(icon || image);
  const diamond = !tile && d.shape === 'diamond';
  const seed = useMemo(() => seedOf(id), [id]);

  const st = d.style;
  // The box only sets the footprint; the visible body is the inked SVG outline
  // (fill, stroke, width, dash, sloppiness all land on its paths).
  const rounded = (st?.edges ?? STYLE_DEFAULTS.edges) === 'round';
  const styleCss: React.CSSProperties = tile ? iconTileCss(d.shape, rounded) : shapeCss(d.shape, rounded);
  // labels stay legible on a light fill; icons take the stroke color, like the ink
  const labelInk = inkOn(st?.background);
  if (labelInk) styleCss.color = labelInk;
  if (icon && st?.stroke) styleCss.color = st.stroke;
  if (st?.opacity != null) styleCss.opacity = st.opacity;
  if (st?.fontFamily) styleCss.fontFamily = fontFamilyCss(st.fontFamily);
  if (st?.fontSize != null) styleCss.fontSize = st.fontSize;
  if (d.flowAt != null) (styleCss as Record<string, string | number>)['--mf-flow-at'] = d.flowAt;

  // motion preset: a CSS class drives the keyframes, its cycle length comes
  // from the per-element speed (falls back to the theme default)
  const animCls = animationClass(st?.animation);
  // flow redraws the outline as a marching stroke that inherits the node's
  // own stroke color, width and style (see flowDash)
  const flowing = st?.animation === 'flow';
  const strokeW = st?.strokeWidth ?? STYLE_DEFAULTS.strokeWidth;
  const fd = flowDash(st?.strokeStyle ?? STYLE_DEFAULTS.strokeStyle, strokeW);
  if (animCls) {
    const dur = `${st?.animationSpeed ?? STYLE_DEFAULTS.animationSpeed}s`;
    styleCss.animationDuration = dur;
    (styleCss as Record<string, string | number>)['--mf-anim-dur'] = dur;
    if (flowing) (styleCss as Record<string, string | number>)['--mf-flow-period'] = `${fd.period}px`;
  }

  const cls = [
    'mf-node',
    `mf-shape-${d.shape}`,
    'is-outline',
    icon ? 'is-icon' : '',
    image ? 'is-image' : '',
    image?.pos === 't' ? 'is-label-top' : '',
    d.isGroup ? 'is-group' : '',
    d.isGroup && d.collapsed ? 'is-folded' : '',
    selected ? 'selected' : '',
    dragging ? 'dragging' : '',
    connecting ? 'connecting' : '',
    isConnectionTarget ? 'join-target' : '',
    highlighted ? 'mf-linked' : '',
    d.flowAt != null ? 'mf-flow-node' : '',
    animCls ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={styleCss}
      onPointerEnter={() => setHighlight({ kind: 'node', id })}
      onPointerLeave={() => setHighlight(null)}
      onDoubleClick={() => {
        setDraft(d.label);
        setEditing(true);
      }}
    >
      <Handle type="target" position={Position.Top} />
      <ShapeOutline
        shape={d.shape}
        icon={tile}
        rounded={rounded}
        style={st}
        seed={seed}
        flowDash={flowing ? fd.array : undefined}
        pages={d.isGroup && d.collapsed}
      />
      {icon && <CatalogIcon id={icon} />}
      {image && <NodeImg image={image} />}
      <div className="mf-node-body" style={diamond ? { transform: 'rotate(-45deg)' } : undefined}>
        {editing ? (
          <input
            autoFocus
            className="mf-node-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className={`mf-node-label ${d.isGroup && !d.label ? 'is-empty' : ''}`}>
            {d.isGroup && !d.label ? 'Untitled' : d.label}
          </span>
        )}
        {d.isGroup && d.collapsed && (
          <button
            className="mf-unfold nodrag"
            aria-label={`Unfold ${d.childCount}`}
            title="Unfold  ·  F"
            onClick={(e) => {
              e.stopPropagation();
              toggleFold(id);
            }}
          >
            {d.childCount}
          </button>
        )}
      </div>
      <PageButton nodeId={id} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const DiagramNode = memo(DiagramNodeInner);
