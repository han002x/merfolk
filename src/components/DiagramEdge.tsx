import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useDiagram } from '../store';

// Custom edge: renders the bezier path plus an editable label. Double-click the
// label (or the pill shown when empty) to rename inline, matching node rename.
export function DiagramEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
}: EdgeProps) {
  const updateEdgeLabel = useDiagram((s) => s.updateEdgeLabel);
  const [editing, setEditing] = useState(false);
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

  const text = typeof label === 'string' ? label : '';

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="mf-edge-label nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
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
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
