import { memo, useState } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import type { ElementStyle, NodeShape } from '../types';
import { useDiagram } from '../store';
import { useFoldMotion } from '../foldMotion';
import { STYLE_DEFAULTS, animationClass, fontFamilyCss } from '../style';

export interface NodeData {
  label: string;
  shape: NodeShape;
  isGroup: boolean;
  collapsed: boolean;
  /** how many nodes are folded inside this card */
  childCount: number;
  style?: ElementStyle;
  /** a frame group's card (shown only while folded); may be untitled */
  frame?: boolean;
  [key: string]: unknown;
}

function shapeStyle(shape: NodeShape, rounded: boolean): React.CSSProperties {
  switch (shape) {
    case 'round':
      return { borderRadius: 24 };
    case 'circle':
      return {
        borderRadius: '50%',
        width: 90,
        height: 90,
        minWidth: 90,
        minHeight: 90,
      };
    case 'diamond':
      return {
        transform: 'rotate(45deg)',
        width: 90,
        height: 90,
        minWidth: 90,
        minHeight: 90,
      };
    default:
      return { borderRadius: rounded ? 12 : 0 };
  }
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

  const diamond = d.shape === 'diamond';

  const st = d.style;
  const sloppiness = st?.sloppiness ?? STYLE_DEFAULTS.sloppiness;
  // Derive concrete CSS from the optional style overrides. Unset fields fall
  // back to the theme-driven CSS variables so untouched nodes look unchanged.
  const styleCss: React.CSSProperties = {
    ...shapeStyle(d.shape, (st?.edges ?? STYLE_DEFAULTS.edges) === 'round'),
  };
  if (st?.stroke) styleCss.borderColor = st.stroke;
  if (st?.background) styleCss.background = st.background;
  if (st?.strokeWidth != null) styleCss.borderWidth = st.strokeWidth;
  if (st?.strokeStyle && st.strokeStyle !== 'solid')
    styleCss.borderStyle = st.strokeStyle;
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
  if (animCls) {
    styleCss.animationDuration = `${st?.animationSpeed ?? STYLE_DEFAULTS.animationSpeed}s`;
  }

  const cls = [
    'mf-node',
    d.isGroup ? 'is-group' : '',
    d.isGroup && d.collapsed ? 'is-folded' : '',
    selected ? 'selected' : '',
    dragging ? 'dragging' : '',
    connecting ? 'connecting' : '',
    isConnectionTarget ? 'join-target' : '',
    highlighted ? 'mf-linked' : '',
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
          <span className={`mf-node-label ${d.frame && !d.label ? 'is-empty' : ''}`}>
            {d.frame && !d.label ? 'Untitled' : d.label}
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
