import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';

// The live "join preview": the line drawn from the source handle to the
// cursor while the user is dragging a new connection. Styled to match edges
// and animated so it reads as a pending action, not a committed edge.
export function JoinPreview({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <g className="mf-join">
      <path className="mf-join-path" d={path} fill="none" />
      <circle className="mf-join-dot" cx={toX} cy={toY} r={4} />
    </g>
  );
}
