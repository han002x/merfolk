import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeShape } from '../types';
import { GHOST_SIZE } from '../layout';

export interface GhostData {
  shape: NodeShape;
  [key: string]: unknown;
}

function shapeStyle(shape: NodeShape): React.CSSProperties {
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
      return { borderRadius: 6, ...GHOST_SIZE };
  }
}

/**
 * A non-interactive placeholder rendered on the canvas while the user hovers an
 * insertion gap in the Mermaid editor. It mirrors the insertion point visually;
 * it is never part of the diagram data.
 */
function GhostNodeInner({ data }: NodeProps) {
  const d = data as GhostData;
  // invisible, inert handles so preview edges (A → ghost → B) can attach
  return (
    <div className="mf-node mf-ghost" style={shapeStyle(d.shape)}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const GhostNode = memo(GhostNodeInner);
