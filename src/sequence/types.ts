import type { ElementStyle } from '../types.ts';

export interface Participant {
  id: string;
  label: string;
  kind: 'participant' | 'actor';
  pageIds?: string[];
  style?: ElementStyle;
}

interface EventBase {
  id: string;
  style?: ElementStyle;
}

export const SEQUENCE_ARROWS = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)'] as const;

export interface Message extends EventBase {
  kind: 'message';
  from: string;
  to: string;
  text: string;
  arrow: string;
}

export interface Note extends EventBase {
  kind: 'note';
  participants: string[];
  placement: 'left of' | 'right of' | 'over';
  text: string;
}

export interface Activation extends EventBase {
  kind: 'activation';
  participant: string;
  active: boolean;
}

export interface Fragment extends EventBase {
  kind: 'fragment';
  operator: 'alt' | 'opt' | 'loop' | 'par';
  branches: { label: string; events: SequenceEvent[] }[];
  collapsed: boolean;
}

export type SequenceEvent = Message | Note | Activation | Fragment;

export interface SequenceDiagram {
  kind: 'sequence';
  participants: Participant[];
  events: SequenceEvent[];
}

export interface SequenceRef {
  kind: 'participant' | SequenceEvent['kind'];
  id: string;
}

export interface SequenceSource {
  text: string;
  lineRefs: Map<number, SequenceRef>;
}
