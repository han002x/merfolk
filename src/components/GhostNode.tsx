import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeShape } from '../types';
import { GHOST_SIZE } from '../layout';
import { shapeCss } from '../shapes';

export interface GhostData {
  shape: NodeShape;
  [key: string]: unknown;
}

// the default rect matches GHOST_SIZE exactly, so the canvas can centre it
const ghostCss = (shape: NodeShape): React.CSSProperties =>
  shape === 'rect' ? { borderRadius: 6, ...GHOST_SIZE } : shapeCss(shape, true);

/**
 * A non-interactive placeholder rendered on the canvas while the user hovers an
 * insertion gap in the Mermaid editor. It mirrors the insertion point visually;
 * it is never part of the diagram data.
 */
function GhostNodeInner({ data }: NodeProps) {
  const d = data as GhostData;
  // invisible, inert handles so preview edges (A → ghost → B) can attach
  return (
    <div className="mf-node mf-ghost" style={ghostCss(d.shape)}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const GhostNode = memo(GhostNodeInner);
