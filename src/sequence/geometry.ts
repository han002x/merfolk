import type { SequenceDiagram, SequenceEvent } from './types';

export interface SequenceRow {
  id: string;
  event: SequenceEvent;
  y: number;
  height: number;
  depth: number;
  label?: string;
  branch?: number;
  step?: number;
}
interface ActivationBox { participant: string; y: number; height: number; depth: number }
export interface SequenceGeometry {
  width: number;
  height: number;
  rows: SequenceRow[];
  frames: { id: string; y: number; height: number; depth: number }[];
  activations: ActivationBox[];
  steps: number;
}
export const COLUMN_GAP = 220;
export const participantX = (index: number) => 160 + index * COLUMN_GAP;

export function sequenceGeometry(diagram: SequenceDiagram): SequenceGeometry {
  let y = 112;
  let step = 0;
  const rows: SequenceRow[] = [];
  const frames: SequenceGeometry['frames'] = [];
  const activations: ActivationBox[] = [];
  const active = new Map<string, number[]>();
  const activation = (e: SequenceEvent, at: number) => {
    if (e.kind !== 'activation') return;
    const starts = active.get(e.participant) ?? [];
    if (e.active) starts.push(at);
    else {
      const start = starts.pop();
      if (start !== undefined && at - start > 3) activations.push({ participant: e.participant, y: start, height: at - start, depth: starts.length });
    }
    active.set(e.participant, starts);
  };
  const hidden = (events: SequenceEvent[], at: number) => {
    for (const e of events) {
      activation(e, at);
      if (e.kind === 'fragment') e.branches.forEach((b) => hidden(b.events, at));
    }
  };
  const visit = (events: SequenceEvent[], depth: number) => {
    for (const e of events) {
      if (e.kind === 'fragment') {
        const start = y;
        rows.push({ id: e.id, event: e, y, height: 40, depth, label: e.branches[0]?.label ?? '', branch: 0, ...(e.collapsed ? { step: step++ } : {}) });
        y += 48;
        if (e.collapsed) e.branches.forEach((b) => hidden(b.events, start + 24));
        else e.branches.forEach((branch, index) => {
          if (index > 0) {
            rows.push({ id: `${e.id}-branch-${index}`, event: e, y, height: 32, depth, label: branch.label, branch: index });
            y += 40;
          }
          visit(branch.events, depth + 1);
        });
        y += 12;
        frames.push({ id: e.id, y: start - 16, height: y - start + 2, depth });
      } else {
        const height = e.kind === 'message' && e.from === e.to ? 82 : e.kind === 'activation' ? 22 : 68;
        rows.push({ id: e.id, event: e, y, height, depth, ...(e.kind === 'message' ? { step: step++ } : {}) });
        activation(e, y + 20);
        y += height;
      }
    }
  };
  visit(diagram.events, 0);
  for (const [participant, starts] of active) starts.forEach((start, depth) => activations.push({ participant, y: start, height: y - start + 20, depth }));
  return { width: Math.max(480, participantX(diagram.participants.length - 1) + 160), height: Math.max(250, y + 80), rows, frames, activations, steps: step };
}

