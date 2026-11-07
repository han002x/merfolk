import { memo, useState } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import type { ElementStyle, NodeShape } from '../types';
import { useDiagram } from '../store';
import { useFoldMotion } from '../foldMotion';
import { STYLE_DEFAULTS, animationClass, flowDash, fontFamilyCss } from '../style';
import { CatalogIcon, ShapeOutline } from './ShapeOutline';
import { hasOutline, iconTileCss, shapeCss } from '../shapes';

export interface NodeData {
  label: string;
  shape: NodeShape;
  /** Iconify id: the node renders as an icon tile */
  icon?: string;
  isGroup: boolean;
  collapsed: boolean;
  /** how many nodes are folded inside this card */
  childCount: number;
  style?: ElementStyle;
  [key: string]: unknown;
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

  const icon = d.icon;
  const diamond = !icon && d.shape === 'diamond';
  // shapes CSS can't draw get an SVG outline; the div itself goes invisible
  const outline = !icon && hasOutline(d.shape);

  const st = d.style;
  const sloppiness = st?.sloppiness ?? STYLE_DEFAULTS.sloppiness;
  // Derive concrete CSS from the optional style overrides. Unset fields fall
  // back to the theme-driven CSS variables so untouched nodes look unchanged.
  const rounded = (st?.edges ?? STYLE_DEFAULTS.edges) === 'round';
  const styleCss: React.CSSProperties = icon ? iconTileCss(d.shape, rounded) : shapeCss(d.shape, rounded);
  // the corner radius the flow ring follows (before sloppiness skews it)
  const baseRadius = styleCss.borderRadius;
  // an outline shape takes stroke/fill/dash on its SVG path instead
  if (!outline) {
    if (st?.stroke) styleCss.borderColor = st.stroke;
    if (st?.background) styleCss.background = st.background;
    if (st?.strokeWidth != null) styleCss.borderWidth = st.strokeWidth;
    if (st?.strokeStyle && st.strokeStyle !== 'solid')
      styleCss.borderStyle = st.strokeStyle;
  }
  // icons take the stroke color, like the text and the outline
  if (icon && st?.stroke) styleCss.color = st.stroke;
  if (st?.opacity != null) styleCss.opacity = st.opacity;
  if (st?.fontFamily) styleCss.fontFamily = fontFamilyCss(st.fontFamily);
  if (st?.fontSize != null) styleCss.fontSize = st.fontSize;
  // "Sloppiness" has no border-dash analogue, so approximate the hand-drawn
  // feel with a subtle rotation + asymmetric corner radii; 0 stays clean.
  // (Skip the rotation on diamonds, whose body is already rotated.)
  if (sloppiness > 0 && !diamond) {
    styleCss.transform = `rotate(${sloppiness === 1 ? -0.4 : -0.9}deg)`;
  }
  if (sloppiness > 0 && typeof styleCss.borderRadius === 'number') {
    const r = styleCss.borderRadius as number;
    styleCss.borderRadius = `${r + 4 * sloppiness}px ${r}px ${r + 2 * sloppiness}px ${r}px`;
  }

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
    if (flowing) {
      const vars = styleCss as Record<string, string | number>;
      vars['--mf-flow-period'] = fd.period;
      vars['--mf-flow-w'] = `${strokeW}px`;
      if (st?.stroke) vars['--mf-flow-ink'] = st.stroke;
      // the ring replaces the CSS border, which would otherwise show through
      if (!outline) styleCss.borderColor = 'transparent';
    }
  }

  const cls = [
    'mf-node',
    `mf-shape-${d.shape}`,
    outline ? 'is-outline' : '',
    icon ? 'is-icon' : '',
    d.isGroup ? 'is-group' : '',
    d.isGroup && d.collapsed ? 'is-folded' : '',
    selected ? 'selected' : '',
    dragging ? 'dragging' : '',
    connecting ? 'connecting' : '',
    isConnectionTarget ? 'join-target' : '',
    highlighted ? 'mf-linked' : '',
    animCls ?? '',
    st?.stroke ? 'has-stroke' : '',
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
      {outline && <ShapeOutline shape={d.shape} style={st} flowDash={flowing ? fd.array : undefined} />}
      {flowing && !outline && (
        <svg className="mf-flow-ring" aria-hidden="true">
          <rect
            width="100%"
            height="100%"
            rx={typeof baseRadius === 'number' ? baseRadius + strokeW / 2 : (baseRadius ?? 0)}
            strokeDasharray={fd.array}
          />
        </svg>
      )}
      {icon && <CatalogIcon id={icon} />}
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const DiagramNode = memo(DiagramNodeInner);
