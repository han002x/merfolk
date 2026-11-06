import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useFoldMotion } from '../foldMotion';
import { useDiagram } from '../store';

export interface SheetData {
  groupId: string;
  width: number;
  height: number;
  depth: number;
  /** a frame group has no card, so its sheet shows the group's title */
  frame?: boolean;
  title?: string;
  [key: string]: unknown;
}

/**
 * The paper an unfolded group's subtree sits on. Purely visual (the canvas
 * pans straight through it) except for the dog-eared corner, which folds the
 * sheet back into its group card, and a frame's title, which renames it.
 */
function SheetNodeInner({ data }: NodeProps) {
  const d = data as SheetData;
  const toggle = useFoldMotion((s) => s.toggle);
  const updateLabel = useDiagram((s) => s.updateLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const next = draft.trim();
    if (next !== (d.title ?? '')) updateLabel(d.groupId, next);
    setEditing(false);
  };

  return (
    <div
      className="mf-sheet"
      data-depth={Math.min(d.depth, 3)}
      style={{ width: d.width, height: d.height }}
    >
      <div className="mf-sheet-paper" />
      {d.frame &&
        (editing ? (
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
            className={`mf-sheet-title nodrag nopan ${d.title ? '' : 'is-empty'}`}
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(d.title ?? '');
              setEditing(true);
            }}
          >
            {d.title || 'Untitled'}
          </span>
        ))}
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
