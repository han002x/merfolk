import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeShape } from '../types';
import { useDiagram } from '../store';

export interface NodeData {
  label: string;
  shape: NodeShape;
  isGroup: boolean;
  collapsed: boolean;
  childCount: number;
  [key: string]: unknown;
}

function shapeStyle(shape: NodeShape): React.CSSProperties {
  switch (shape) {
    case 'round':
      return { borderRadius: 24 };
    case 'circle':
      return { borderRadius: '50%', width: 90, height: 90 };
    case 'diamond':
      return { transform: 'rotate(45deg)', width: 90, height: 90 };
    default:
      return { borderRadius: 6 };
  }
}

function DiagramNodeInner({ id, data, selected }: NodeProps) {
  const d = data as NodeData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label);
  const updateLabel = useDiagram((s) => s.updateLabel);
  const toggleCollapse = useDiagram((s) => s.toggleCollapse);

  const commit = () => {
    updateLabel(id, draft.trim() || 'Untitled');
    setEditing(false);
  };

  const diamond = d.shape === 'diamond';

  return (
    <div
      className={`mf-node ${d.isGroup ? 'is-group' : ''} ${selected ? 'selected' : ''}`}
      style={shapeStyle(d.shape)}
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
          <span className="mf-node-label">{d.label}</span>
        )}
        {d.isGroup && (
          <button
            className="mf-collapse"
            title={d.collapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(id);
            }}
          >
            {d.collapsed ? `▸ ${d.childCount}` : '▾'}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const DiagramNode = memo(DiagramNodeInner);
