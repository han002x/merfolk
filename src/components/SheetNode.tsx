import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useFoldMotion } from '../foldMotion';
import { useDiagram } from '../store';

export interface SheetData {
  groupId: string;
  width: number;
  height: number;
  depth: number;
  /** an unfolded group has no card, so its sheet shows the group's title */
  title?: string;
  [key: string]: unknown;
}

/**
 * The paper an unfolded group's subtree sits on, standing in for the group:
 * it carries the group's title (double-click to rename) and the edges that
 * point at the group. Dragging the sheet moves the group, and the dog-eared
 * corner folds it into a card.
 */
function SheetNodeInner({ data }: NodeProps) {
  const d = data as SheetData;
  const toggle = useFoldMotion((s) => s.toggle);
  const updateLabel = useDiagram((s) => s.updateLabel);
  const setHighlight = useDiagram((s) => s.setHighlight);
  // the group's `subgraph` line is hovered in the Mermaid editor
  const linked = useDiagram((s) => s.highlight?.kind === 'node' && s.highlight.id === d.groupId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const next = draft.trim();
    if (next !== (d.title ?? '')) updateLabel(d.groupId, next);
    setEditing(false);
  };

  return (
    <div
      className={linked ? 'mf-sheet mf-linked' : 'mf-sheet'}
      data-depth={Math.min(d.depth, 3)}
      style={{ width: d.width, height: d.height }}
    >
      <div className="mf-sheet-paper" />
      {/* edges into the group land on the sheet; it never starts a connection */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="mf-sheet-handle" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="mf-sheet-handle" />
      {editing ? (
          <input
            autoFocus
            className="mf-sheet-title-input nodrag nopan"
            value={draft}
            placeholder="Untitled"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span
            className={`mf-sheet-title ${d.title ? '' : 'is-empty'}`}
            title="Drag to move · Double-click to rename"
            onPointerEnter={() => setHighlight({ kind: 'node', id: d.groupId })}
            onPointerLeave={() => setHighlight(null)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(d.title ?? '');
              setEditing(true);
            }}
          >
            {d.title || 'Untitled'}
          </span>
        )}
      <button
        className="mf-dogear nodrag nopan"
        aria-label="Fold"
        title="Fold  ·  F"
        onClick={(e) => {
          e.stopPropagation();
          toggle(d.groupId);
        }}
      />
    </div>
  );
}

export const SheetNode = memo(SheetNodeInner);
