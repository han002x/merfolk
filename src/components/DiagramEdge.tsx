import { useEffect, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useDiagram } from '../store';
import { Icon } from './Icon';
import type { ElementStyle } from '../types';
import { STYLE_DEFAULTS, animationClass, dashArray, flowDash, fontFamilyCss } from '../style';
import { arrowHead, ink, seedOf, type Side } from '../rough';

const EDGE_STYLE_BASE: React.CSSProperties = {
  transition: 'stroke 160ms ease, stroke-width 160ms ease',
};

// Custom edge: renders the bezier path plus an editable label. Double-click the
// label (or the pill shown when empty) to rename inline, matching node rename.
export function DiagramEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const updateEdgeLabel = useDiagram((s) => s.updateEdgeLabel);
  const setHighlight = useDiagram((s) => s.setHighlight);
  const highlighted = useDiagram(
    (s) => s.highlight?.kind === 'edge' && s.highlight.id === id,
  );
  const [editing, setEditing] = useState(false);
  const setInsertion = useDiagram((s) => s.setInsertion);
  const commitInsertion = useDiagram((s) => s.commitInsertion);
  const setSelection = useDiagram((s) => s.setSelection);
  // this edge is the one a pending insertion would split (A → new → B)
  const splittingMe = useDiagram((s) => s.insertion?.edgeId === id);

  // preview a node inserted on this edge: ghost midway between the two ends,
  // dashed legs A → ghost → B. The new node joins whichever group both ends
  // share (or the group one end *is*, when the edge runs group → child).
  const previewInsert = () => {
    const byId = new Map(useDiagram.getState().nodes.map((n) => [n.id, n]));
    const a = byId.get(source);
    const b = byId.get(target);
    let parentId: string | null = null;
    if (a && b) {
      if (b.parentId === a.id) parentId = a.id;
      else if (a.parentId === b.id) parentId = b.id;
      else if (a.parentId === b.parentId) parentId = a.parentId;
    }
    setInsertion({ afterNodeId: source, beforeNodeId: target, parentId, edgeId: id });
  };
  // keep the button up briefly after the edge loses hover, so the pointer can
  // travel from the line onto it without the button vanishing on the way
  const [lingering, setLingering] = useState(false);
  const [wasHighlighted, setWasHighlighted] = useState(highlighted);
  if (wasHighlighted !== highlighted) {
    setWasHighlighted(highlighted);
    if (!highlighted) setLingering(true);
  }
  useEffect(() => {
    if (!lingering) return;
    const t = window.setTimeout(() => setLingering(false), 300);
    return () => window.clearTimeout(t);
  }, [lingering]);

  const insertHere = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nid = commitInsertion();
    if (nid) {
      setSelection([nid], []);
      setHighlight({ kind: 'node', id: nid });
    }
  };
  const [draft, setDraft] = useState(typeof label === 'string' ? label : '');

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const commit = () => {
    updateEdgeLabel(id, draft);
    setEditing(false);
  };

  // a crease stands in for edges folded inside a card: drawn dashed, merged
  // with a count, and read-only until the card is unfolded
  const folded = data?.folded === true;
  // a preview leg of an edge an insertion would split: drawn, never edited
  const preview = data?.preview === true;
  const inert = folded || preview;
  const count = typeof data?.count === 'number' ? data.count : 1;
  const text = typeof label === 'string' ? label : folded && count > 1 ? `×${count}` : '';

  // concrete CSS from the optional per-edge overrides (unset => theme default)
  const st = (data?.style as ElementStyle | undefined) ?? undefined;
  const strokeWidth = st?.strokeWidth ?? STYLE_DEFAULTS.strokeWidth;
  const ownStyle: React.CSSProperties = { ...EDGE_STYLE_BASE };
  if (st?.stroke) ownStyle.stroke = st.stroke;
  ownStyle.strokeWidth = strokeWidth;
  const dash = dashArray(st?.strokeStyle ?? STYLE_DEFAULTS.strokeStyle, strokeWidth);
  if (dash) ownStyle.strokeDasharray = dash;
  if (st?.opacity != null) ownStyle.opacity = st.opacity;

  // the flow preset marches dashes along the line: force a dash pattern (so the
  // motion reads even on a solid edge) and drive the cycle from the speed
  const flowing = !inert && st?.animation === 'flow';
  if (flowing) {
    const fd = flowDash(st?.strokeStyle ?? STYLE_DEFAULTS.strokeStyle, strokeWidth);
    ownStyle.strokeDasharray = fd.array;
    (ownStyle as Record<string, string | number>)['--mf-flow-period'] = `${fd.period}px`;
    ownStyle.animationDuration = `${st?.animationSpeed ?? STYLE_DEFAULTS.animationSpeed}s`;
  }
  const edgeAnimCls = flowing ? animationClass('flow') : null;

  if (folded) {
    ownStyle.strokeDasharray = '5 5';
    ownStyle.opacity = 0.7;
  }

  // the visible line is ink over the clean bezier (which stays the hitbox),
  // ending in a hand-drawn chevron; dashes need one continuous pass
  const sloppiness = st?.sloppiness ?? STYLE_DEFAULTS.sloppiness;
  const seed = useMemo(() => seedOf(id), [id]);
  const continuous = ownStyle.strokeDasharray != null;
  const inkPath = useMemo(
    () => ink(path, { sloppiness, seed, continuous, pinEnds: true }),
    [path, sloppiness, seed, continuous],
  );
  const arrow = useMemo(
    () => arrowHead(targetX, targetY, targetPosition as Side, { sloppiness, seed: seed + 3, size: 6 + strokeWidth * 2 }),
    [targetX, targetY, targetPosition, sloppiness, seed, strokeWidth],
  );

  const edgeStyle: React.CSSProperties = (highlighted || selected) && !folded
    ? {
        ...ownStyle,
        stroke: 'var(--mf-accent)',
        strokeWidth: Math.max(2.5, strokeWidth),
        filter: 'drop-shadow(0 0 4px var(--mf-glow))',
      }
    : ownStyle;

  // label typography follows the edge's font style when set
  const labelFont: React.CSSProperties = {};
  if (st?.fontFamily) labelFont.fontFamily = fontFamilyCss(st.fontFamily);
  if (st?.fontSize != null) labelFont.fontSize = st.fontSize;
  if (st?.opacity != null) labelFont.opacity = st.opacity;

  return (
    <>
      {/* wide transparent hitbox so hovering anywhere along the edge syncs */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: 'pointer' }}
        onPointerEnter={inert ? undefined : () => setHighlight({ kind: 'edge', id })}
        onPointerLeave={inert ? undefined : () => setHighlight(null)}
      />
      <BaseEdge id={id} path={inkPath} markerEnd={markerEnd} style={edgeStyle} className={edgeAnimCls ?? undefined} />
      <path
        className="mf-edge-arrow"
        d={arrow}
        style={{
          stroke: edgeStyle.stroke,
          strokeWidth: edgeStyle.strokeWidth,
          opacity: edgeStyle.opacity,
          filter: edgeStyle.filter,
          transition: EDGE_STYLE_BASE.transition,
        }}
      />
      <EdgeLabelRenderer>
        {inert ? (
          text && (
            <div
              className="mf-edge-label is-crease nodrag nopan"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                ...labelFont,
              }}
            >
              <span className="mf-edge-text">{text}</span>
            </div>
          )
        ) : (
        <div
          className={`mf-edge-label nodrag nopan${highlighted || selected ? ' mf-linked' : ''}${selected ? ' is-selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            ...labelFont,
          }}
          onPointerEnter={() => setHighlight({ kind: 'edge', id })}
          onPointerLeave={() => setHighlight(null)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(text);
            setEditing(true);
          }}
        >
          {editing ? (
            <input
              autoFocus
              className="mf-edge-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : text ? (
            <span className="mf-edge-text">{text}</span>
          ) : (
            <span className="mf-edge-add" title="Double-click to label">
              +
            </span>
          )}
          {!editing && (highlighted || lingering || splittingMe || selected) && (
            <div className="mf-edge-actions nodrag nopan">
              <button
                className="mf-edge-action"
                aria-label="Add a node on this connection"
                title="Add node"
                onPointerEnter={previewInsert}
                onPointerLeave={() => setInsertion(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={insertHere}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name="plus" size={11} />
                <span className="mf-edge-action-text">Node</span>
              </button>
              {!text && (
                <button
                  className="mf-edge-action"
                  aria-label="Add an inline label on this connection"
                  title="Add inline label"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraft(text);
                    setEditing(true);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Icon name="plus" size={11} />
                  <span className="mf-edge-action-text">Inline</span>
                </button>
              )}
            </div>
          )}
        </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
