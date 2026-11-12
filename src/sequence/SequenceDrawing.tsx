import { useId } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Participant, SequenceDiagram, SequenceEvent } from './types';

import { participantX, COLUMN_GAP, sequenceGeometry } from './geometry';

function wrapped(text: string, max = 34) {
  const lines: string[] = [];
  for (const explicit of text.split(/<br\s*\/?\s*>|\n/i)) {
    let line = '';
    for (const word of explicit.split(/\s+/)) {
      if (line.length + word.length > max && line) { lines.push(line); line = word; }
      else line += `${line ? ' ' : ''}${word}`;
    }
    lines.push(line);
  }
  return lines.slice(0, 4);
}
function Label({ text, x, y, max = 34, className = '' }: { text: string; x: number; y: number; max?: number; className?: string }) {
  return <text x={x} y={y} className={className} textAnchor="middle">{wrapped(text, max).map((line, index) => <tspan key={index} x={x} dy={index ? 17 : 0}>{line}</tspan>)}</text>;
}
function motion(step: number | undefined): CSSProperties & { '--sq-progress'?: string } {
  return step === undefined ? {} : { '--sq-progress': `clamp(0, calc(var(--mf-flow-t, -1) - ${step}), 1)` };
}
export interface DrawingProps {
  diagram: SequenceDiagram;
  selected?: string | null;
  onSelect?: (id: string) => void;
  onParticipant?: (id: string) => void;
  onFold?: (id: string) => void;
  onMoveParticipant?: (id: string, offset: number) => void;
  onMoveEvent?: (id: string, offset: number) => void;
  interactive?: boolean;
}
export function SequenceDrawing({ diagram, selected, onSelect, onParticipant, onFold, onMoveParticipant, onMoveEvent, interactive = false }: DrawingProps) {
  const marker = useId().replace(/:/g, '');
  const geometry = sequenceGeometry(diagram);
  const x = (id: string) => participantX(Math.max(0, diagram.participants.findIndex((p) => p.id === id)));
  const drag = (event: PointerEvent<SVGGElement>, id: string, participant: boolean) => {
    if (!interactive || event.button !== 0) return;
    const element = event.currentTarget;
    const scale = element.getScreenCTM()?.a ?? 1;
    const start = participant ? event.clientX : event.clientY;
    element.setPointerCapture(event.pointerId);
    const finish = (up: globalThis.PointerEvent) => {
      const delta = ((participant ? up.clientX : up.clientY) - start) / scale;
      const offset = Math.round(delta / (participant ? COLUMN_GAP : 68));
      if (offset) (participant ? onMoveParticipant : onMoveEvent)?.(id, offset);
      element.removeEventListener('pointerup', finish);
    };
    element.addEventListener('pointerup', finish);
  };
  const participant = (p: Participant, index: number) => <g key={p.id} data-sequence-participant={p.id} role="button" tabIndex={0} aria-label={`Participant ${p.label}`} className={`sq-participant nopan ${selected === p.id ? 'is-selected' : ''}`} onClick={() => onSelect?.(p.id)} onDoubleClick={() => onParticipant?.(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onParticipant?.(p.id); }} onPointerDown={(e) => drag(e, p.id, true)}>
    <title>{`${p.label}${p.pageIds?.length ? ' · Open page' : ''}`}</title>
    {p.kind === 'actor' ? <g transform={`translate(${participantX(index)},26)`}><circle r="9" /><path d="M0 9V35 M-17 21H17 M0 35L-15 48 M0 35L15 48" /><Label text={p.label} x={0} y={69} max={20} /></g> : <><rect x={participantX(index) - 72} y="26" width="144" height="54" rx="5" /><Label text={p.label} x={participantX(index)} y={50} max={18} /></>}
  </g>;
  return <svg xmlns="http://www.w3.org/2000/svg" className={`sq-drawing ${interactive ? 'is-interactive' : ''}`} width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Sequence diagram">
    <defs>
      <marker id={`${marker}-filled`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="var(--mf-ink)" stroke="none" /></marker>
      <marker id={`${marker}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 0L9 5L1 10" fill="none" /></marker>
      <marker id={`${marker}-cross`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1L9 9M1 9L9 1" /></marker>
    </defs>
    {diagram.participants.map((p, i) => <line key={p.id} className="sq-lifeline" x1={participantX(i)} x2={participantX(i)} y1="90" y2={geometry.height - 30} />)}
    {geometry.frames.map((f) => <rect className={`sq-fragment-frame ${selected === f.id ? 'is-selected' : ''}`} key={f.id} x={32 + f.depth * 8} y={f.y} width={geometry.width - 64 - f.depth * 16} height={f.height} rx="3" />)}
    {geometry.activations.map((a, i) => <rect key={i} className="sq-activation" x={x(a.participant) - 6 + a.depth * 5} y={a.y} width="12" height={a.height} />)}
    {geometry.rows.map((row) => {
      const e = row.event;
      const cls = `sq-event nopan ${selected === e.id ? 'is-selected' : ''}`;
      if (e.kind === 'fragment') return <g key={row.id} className={cls} style={motion(row.step)} onClick={() => onSelect?.(e.id)}>
        {row.branch !== 0 && <line className="sq-divider" x1="36" x2={geometry.width - 36} y1={row.y - 14} y2={row.y - 14} />}
        <rect className="sq-fragment-tab" x={36 + row.depth * 8} y={row.y - 15} width="88" height="27" />
        <text x={44 + row.depth * 8} y={row.y + 3}>{row.branch === 0 ? e.operator : e.operator === 'par' ? 'and' : 'else'}</text>
        <text x={138 + row.depth * 8} y={row.y + 3}>{row.label ? `[${row.label}]` : ''}{e.collapsed ? `  · ${countEvents(e.branches.flatMap((b) => b.events))} events` : ''}</text>
        {row.branch === 0 && onFold && <g role="button" tabIndex={0} aria-label={`${e.collapsed ? 'Unfold' : 'Fold'} ${e.operator}`} onClick={(event) => { event.stopPropagation(); onFold(e.id); }} onKeyDown={(event) => { if (event.key === 'Enter') onFold(e.id); }}><rect className="sq-fold-hit" x={geometry.width - 72} y={row.y - 16} width="30" height="28" /><text x={geometry.width - 62} y={row.y + 3}>{e.collapsed ? '+' : '−'}</text></g>}
      </g>;
      if (e.kind === 'activation') return interactive ? <g key={row.id} className={cls} onClick={() => onSelect?.(e.id)}><circle cx={x(e.participant)} cy={row.y + 20} r="5" className="sq-activation-handle" /><title>{`${e.active ? 'Activate' : 'Deactivate'} ${e.participant}`}</title></g> : null;
      if (e.kind === 'note') {
        const positions = e.participants.map(x);
        let center = (Math.min(...positions) + Math.max(...positions)) / 2;
        if (e.placement === 'left of') center -= 95;
        if (e.placement === 'right of') center += 95;
        const width = Math.max(150, Math.max(...positions) - Math.min(...positions) + 100);
        return <g key={row.id} className={cls} onClick={() => onSelect?.(e.id)} onPointerDown={(event) => drag(event, e.id, false)}><rect className="sq-note" x={center - width / 2} y={row.y - 5} width={width} height="51" rx="2" /><Label text={e.text} x={center} y={row.y + 15} max={Math.floor(width / 8)} /></g>;
      }
      const from = x(e.from);
      const to = x(e.to);
      const self = from === to;
      const path = self ? `M${from} ${row.y + 28}h62v28h-62` : `M${from} ${row.y + 28}H${to}`;
      const head = e.arrow.endsWith('x') ? 'cross' : e.arrow.endsWith('>>') ? 'filled' : 'open';
      return <g key={row.id} className={cls} style={motion(row.step)} onClick={() => onSelect?.(e.id)} onPointerDown={(event) => drag(event, e.id, false)} role="button" tabIndex={interactive ? 0 : undefined} aria-label={`Message ${e.text}`} onKeyDown={(event) => { if (event.key === 'Enter') onSelect?.(e.id); }}>
        <path d={path} className="sq-message-hit" /><path d={path} className="sq-message-line" strokeDasharray={e.arrow.startsWith('--') ? '7 5' : undefined} markerEnd={e.arrow === '->' || e.arrow === '-->' ? undefined : `url(#${marker}-${head})`} />
        <Label text={e.text} x={self ? from + 84 : (from + to) / 2} y={row.y + 11} max={self ? 18 : Math.max(12, Math.floor(Math.abs(from - to) / 8))} />
      </g>;
    })}
    {diagram.participants.map(participant)}
    {!diagram.participants.length && <Label text="Add a participant to begin" x={geometry.width / 2} y={110} />}
  </svg>;
}
function countEvents(events: SequenceEvent[]): number {
  return events.reduce((count, e) => count + (e.kind === 'fragment' ? countEvents(e.branches.flatMap((b) => b.events)) : 1), 0);
}
