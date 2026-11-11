import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow, useStore } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Fragment, Participant, SequenceDiagram, SequenceEvent } from './types';
import { SEQUENCE_ARROWS } from './types';
import { emitSequence, makeSequenceId, parseSequence, walkEvents } from './io';
import { SequenceDrawing } from './SequenceDrawing';
import { sequenceGeometry } from './geometry';
import { useTheme, toggleTheme } from '../theme';
import { usePlayer } from '../flowPlayer';
import { useHash, parseRoute } from '../route';
import './sequence.css';
export { SequenceDrawing } from './SequenceDrawing';

export interface SequenceWorkspaceProps {
  diagram: SequenceDiagram;
  onChange: (next: SequenceDiagram) => void;
  onFlowchart: () => void;
  onOpenPage: (participantId: string) => void;
  onImportFile: () => void;
  onExportFile: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onSourceFlowchart?: (source: string) => { ok: true } | { ok: false; error: string };
}

function updateEvents(events: SequenceEvent[], update: (event: SequenceEvent) => SequenceEvent | null): SequenceEvent[] {
  return events.flatMap((event) => {
    const next = update(event.kind === 'fragment' ? { ...event, branches: event.branches.map((b) => ({ ...b, events: updateEvents(b.events, update) })) } : event);
    return next ? [next] : [];
  });
}
function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const value = next.splice(from, 1)[0];
  if (value !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, value);
  return next;
}
function moveEvent(events: SequenceEvent[], id: string, offset: number): SequenceEvent[] {
  const index = events.findIndex((e) => e.id === id);
  if (index !== -1) return reorder(events, index, index + offset);
  return events.map((e) => e.kind === 'fragment' ? { ...e, branches: e.branches.map((b) => ({ ...b, events: moveEvent(b.events, id, offset) })) } : e);
}
function appendEvent(events: SequenceEvent[], next: SequenceEvent[], after: string | null, target: { id: string; branch: number } | null): SequenceEvent[] {
  if (target) return events.map((e) => e.kind === 'fragment' ? { ...e, branches: e.branches.map((b, i) => ({ ...b, events: e.id === target.id && i === target.branch ? [...b.events, ...next] : appendEvent(b.events, next, after, target) })) } : e);
  const index = events.findIndex((e) => e.id === after);
  if (index !== -1) return [...events.slice(0, index + 1), ...next, ...events.slice(index + 1)];
  if (after && walkEvents(events).some((e) => e.id === after)) return events.map((e) => e.kind === 'fragment' ? { ...e, branches: e.branches.map((b) => ({ ...b, events: appendEvent(b.events, next, after, null) })) } : e);
  return after ? events : [...events, ...next];
}
function eventTitle(e: SequenceEvent): string {
  switch (e.kind) {
    case 'message': return `${e.from} → ${e.to}: ${e.text || 'Message'}`;
    case 'note': return `Note: ${e.text}`;
    case 'activation': return `${e.active ? 'Activate' : 'Deactivate'} ${e.participant}`;
    case 'fragment': return `${e.operator} ${e.branches[0]?.label ?? ''}`;
  }
}

export default function SequenceWorkspace(props: SequenceWorkspaceProps) {
  return <ReactFlowProvider><Workspace {...props} /></ReactFlowProvider>;
}
function Workspace({ diagram, onChange, onFlowchart, onOpenPage, onImportFile, onExportFile, onUndo, canUndo, onSourceFlowchart }: SequenceWorkspaceProps) {
  const generated = useMemo(() => emitSequence(diagram), [diagram]);
  const [source, setSource] = useState(generated.text);
  const lastApplied = useRef(generated.text);
  const sourceRefs = useRef(generated.lineRefs);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'source' | 'outline'>('source');
  const [target, setTarget] = useState<{ id: string; branch: number } | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();
  const hash = useHash();
  const flow = useReactFlow();
  const viewportSize = useStore((state) => `${state.width}:${state.height}`);
  const geometry = useMemo(() => sequenceGeometry(diagram), [diagram]);
  const participant = diagram.participants.find((p) => p.id === selected);
  const event = walkEvents(diagram.events).find((e) => e.id === selected);
  const player = usePlayer();
  const selectedId = selected;
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (generated.text !== lastApplied.current) {
      lastApplied.current = generated.text;
      sourceRefs.current = generated.lineRefs;
      setSource(generated.text);
      setError('');
    }
  }, [generated]);
  useEffect(() => {
    const signature = geometry.rows.filter((r) => r.step !== undefined).map((r) => r.id).join('|');
    usePlayer.getState().setSchedule(signature, geometry.steps);
  }, [geometry]);
  useEffect(() => () => usePlayer.getState().stop(), []);
  useEffect(() => {
    if (!selectedId || !editor.current || document.activeElement === editor.current) return;
    const line = [...sourceRefs.current].find(([, ref]) => ref.id === selectedId)?.[0];
    if (line === undefined) return;
    const lines = source.split('\n');
    const start = lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0);
    editor.current.setSelectionRange(start, start + (lines[line]?.length ?? 0));
  }, [selectedId, source]);
  const fit = useCallback(() => { void flow.fitBounds({ x: 0, y: 0, width: geometry.width, height: geometry.height }, { padding: .15, duration: 200 }); }, [flow, geometry.width, geometry.height]);
  useEffect(() => {
    const route = parseRoute(hash);
    if (route.kind !== 'node') return;
    const index = diagram.participants.findIndex((p) => p.id === route.id);
    if (index === -1) return;
    const frame = requestAnimationFrame(() => {
      setSelected(route.id);
      void flow.fitBounds({ x: 65 + index * 220, y: 0, width: 190, height: Math.min(geometry.height, 540) }, { padding: .4, duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, diagram.participants, flow, geometry.height]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { fit(); });
    return () => cancelAnimationFrame(frame);
  }, [viewportSize, fit]);
  const change = (next: SequenceDiagram) => {
    const valid = parseSequence(emitSequence(next).text);
    if (!valid.ok) { setError(valid.error); return; }
    onChange(next); setError(''); setNotice('');
  };
  const select = (id: string) => { setSelected(id); setTarget(null); };
  const patchParticipant = (patch: Partial<Participant>) => change({ ...diagram, participants: diagram.participants.map((p) => p.id === selected ? { ...p, ...patch } : p) });
  const patchEvent = (update: (e: SequenceEvent) => SequenceEvent) => change({ ...diagram, events: updateEvents(diagram.events, (e) => e.id === selected ? update(e) : e) });
  const moveParticipant = (id: string, offset: number) => {
    const index = diagram.participants.findIndex((p) => p.id === id);
    if (index !== -1) change({ ...diagram, participants: reorder(diagram.participants, index, index + offset) });
  };
  const move = (id: string, offset: number) => change({ ...diagram, events: moveEvent(diagram.events, id, offset) });
  const fold = (id: string) => change({ ...diagram, events: updateEvents(diagram.events, (e) => e.kind === 'fragment' && e.id === id ? { ...e, collapsed: !e.collapsed } : e) });
  const remove = () => {
    if (participant) {
      const removed = participant.id;
      change({ ...diagram, participants: diagram.participants.filter((p) => p.id !== removed), events: updateEvents(diagram.events, (e) => {
        if (e.kind === 'message' && (e.from === removed || e.to === removed)) return null;
        if (e.kind === 'activation' && e.participant === removed) return null;
        if (e.kind === 'note') { const participants = e.participants.filter((id) => id !== removed); return participants.length ? { ...e, participants } : null; }
        return e;
      }) });
    } else change({ ...diagram, events: updateEvents(diagram.events, (e) => e.id === selected ? null : e) });
    setSelected(null); setTarget(null);
  };
  const addParticipant = () => {
    const id = makeSequenceId();
    change({ ...diagram, participants: [...diagram.participants, { id, label: `Participant ${diagram.participants.length + 1}`, kind: 'participant' }] });
    select(id);
  };
  const add = (kind: SequenceEvent['kind']) => {
    const first = diagram.participants[0]?.id;
    if (!first) return;
    const id = makeSequenceId();
    const second = diagram.participants[1]?.id ?? first;
    let added: SequenceEvent[];
    switch (kind) {
      case 'message': added = [{ kind, id, from: first, to: second, text: 'Message', arrow: '->>' }]; break;
      case 'note': added = [{ kind, id, participants: [first], placement: 'right of', text: 'Note' }]; break;
      case 'activation': added = [{ kind, id, participant: first, active: true }, { kind, id: makeSequenceId(), participant: first, active: false }]; break;
      case 'fragment': added = [{ kind, id, operator: 'opt', branches: [{ label: 'Condition', events: [] }], collapsed: false }]; break;
    }
    const insertion = target ?? (event?.kind === 'fragment' ? { id: event.id, branch: 0 } : null);
    change({ ...diagram, events: appendEvent(diagram.events, added, event ? selected : null, insertion) });
    select(id);
  };
  const editSource = (value: string) => {
    setSource(value);
    if (/^\s*(?:%%[^\n]*\n\s*)*(?:flowchart|graph)\b/.test(value) && onSourceFlowchart) {
      const result = onSourceFlowchart(value);
      setError(result.ok ? '' : result.error);
      return;
    }
    const parsed = parseSequence(value);
    if (!parsed.ok) { sourceRefs.current = new Map(); setError(parsed.error); return; }
    const previous = new Map(walkEvents(diagram.events).map((e) => [e.id, e]));
    const next = { ...parsed.diagram, participants: parsed.diagram.participants.map((p) => ({ ...p, style: diagram.participants.find((old) => old.id === p.id)?.style, pageIds: p.pageIds ?? diagram.participants.find((old) => old.id === p.id)?.pageIds })), events: updateEvents(parsed.diagram.events, (e) => {
      const old = previous.get(e.id);
      return e.kind === 'fragment' && old?.kind === 'fragment' ? { ...e, collapsed: old.collapsed, style: old.style } : { ...e, style: old?.style };
    }) };
    sourceRefs.current = parsed.lineRefs;
    lastApplied.current = emitSequence(next).text;
    setError(''); onChange(next);
  };
  const sourceSelect = () => {
    if (!editor.current) return;
    const line = source.slice(0, editor.current.selectionStart).split('\n').length - 1;
    const ref = sourceRefs.current.get(line);
    if (ref) select(ref.id);
  };
  const options = diagram.participants.map((p) => <option key={p.id} value={p.id}>{p.label}</option>);
  const outline = (events: SequenceEvent[], depth = 0) => events.map((e) => <div key={e.id}>
    <button className={`sq-outline-row ${selected === e.id ? 'is-selected' : ''}`} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => select(e.id)} draggable onDragStart={(drag) => drag.dataTransfer.setData('text/plain', e.id)} onDragOver={(drag) => drag.preventDefault()} onDrop={(drag) => { drag.preventDefault(); const id = drag.dataTransfer.getData('text/plain'); const from = events.findIndex((item) => item.id === id); const to = events.findIndex((item) => item.id === e.id); if (from !== -1 && to !== -1) move(id, to - from); }}>{eventTitle(e)}</button>
    {e.kind === 'fragment' && e.branches.map((branch, index) => <div key={index}><button className={`sq-outline-branch ${target?.id === e.id && target.branch === index ? 'is-selected' : ''}`} style={{ paddingLeft: 24 + depth * 14 }} onClick={() => { setSelected(e.id); setTarget({ id: e.id, branch: index }); }}>{index ? e.operator === 'par' ? 'and' : 'else' : e.operator} {branch.label}</button>{outline(branch.events, depth + 1)}</div>)}
  </div>);
  const patchFragment = (fragment: Fragment) => patchEvent((e) => e.kind === 'fragment' ? fragment : e);
  return <main className="sq-workspace" onKeyDown={(e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (selected) remove(); }
    if (e.key.toLowerCase() === 'f' && event?.kind === 'fragment') fold(event.id);
    if (e.key.toLowerCase() === 'w' && participant) onOpenPage(participant.id);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); onUndo?.(); }
  }}>
    <section className="sq-canvas" aria-label="Sequence canvas">
      <div className="sq-toolbar">
        <button onClick={onFlowchart}>Flowchart</button><span className="sq-toolbar-title">Sequence</span><span className="sq-toolbar-rule" />
        <button onClick={addParticipant}>+ Participant</button><button disabled={!diagram.participants.length} onClick={() => add('message')}>+ Message</button>
        <button disabled={!canUndo} onClick={onUndo} title="Undo · Ctrl/⌘Z">↶</button>
        <button onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
        <details className="sq-menu"><summary aria-label="More sequence actions">•••</summary><div><button onClick={onImportFile}>Import file</button><button onClick={onExportFile}>Export file</button><button onClick={() => { void navigator.clipboard.writeText(generated.text).then(() => setNotice('Copied Mermaid'), () => setNotice('Copy failed')); }}>Copy Mermaid</button></div></details>
      </div>
      <ReactFlow nodes={[]} edges={[]} onInit={() => { fit(); }} colorMode={theme} minZoom={.1} maxZoom={2} panOnDrag={[1, 2]} onPaneClick={() => { setSelected(null); setTarget(null); }}>
        <Background gap={20} />
        <ViewportPortal><SequenceDrawing diagram={diagram} selected={selected} onSelect={select} onParticipant={onOpenPage} onFold={fold} onMoveParticipant={moveParticipant} onMoveEvent={move} interactive /></ViewportPortal>
        <Controls showInteractive={false} showFitView={false}><button className="react-flow__controls-button" aria-label="Fit sequence" onClick={fit}>⤢</button></Controls>
      </ReactFlow>
      <div className="sq-playback"><button aria-label="Previous step" onClick={() => player.stepBy(-1)}>‹</button><button aria-label={player.playing ? 'Pause sequence' : 'Play sequence'} disabled={!geometry.steps} onClick={player.toggle}>{player.playing ? 'Pause' : 'Play'}</button><button aria-label="Next step" onClick={() => player.stepBy(1)}>›</button><button onClick={player.cycleSpeed}>{player.speed}×</button></div>
      {notice && <div role="status" className="sq-notice">{notice}</div>}
    </section>
    <aside className="sq-panel" aria-label="Sequence editor">
      <div className="sq-tabs" role="tablist"><button role="tab" aria-selected={tab === 'source'} onClick={() => setTab('source')}>Mermaid</button><button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>Outline</button><button className="sq-copy" onClick={() => { void navigator.clipboard.writeText(generated.text).then(() => setNotice('Copied Mermaid'), () => setNotice('Copy failed')); }}>Copy</button></div>
      {tab === 'source' ? <textarea ref={editor} className="sq-source" aria-label="Sequence Mermaid source" value={source} spellCheck={false} onChange={(e) => editSource(e.target.value)} onClick={sourceSelect} onKeyUp={sourceSelect} /> : <div className="sq-outline"><div className="sq-outline-heading">Participants</div>{diagram.participants.map((p) => <button className={`sq-outline-row ${selected === p.id ? 'is-selected' : ''}`} key={p.id} onClick={() => select(p.id)}>{p.label}</button>)}<div className="sq-outline-heading">Interactions</div>{outline(diagram.events)}</div>}
      {error && <div className="sq-error" role="alert">{error}</div>}
      <div className="sq-add"><button disabled={!diagram.participants.length} onClick={() => add('note')}>+ Note</button><button disabled={!diagram.participants.length} onClick={() => add('activation')}>+ Activation</button><button disabled={!diagram.participants.length} onClick={() => add('fragment')}>+ Block</button></div>
      {(participant || event) && <section className="sq-inspector" aria-label="Selected sequence element"><div className="sq-inspector-heading"><span>{participant ? 'Participant' : event?.kind}</span><div><button aria-label="Move selected earlier" onClick={() => participant ? moveParticipant(participant.id, -1) : event && move(event.id, -1)}>↑</button><button aria-label="Move selected later" onClick={() => participant ? moveParticipant(participant.id, 1) : event && move(event.id, 1)}>↓</button><button aria-label="Delete selected element" onClick={remove}>Delete</button></div></div>
        {participant && <><label>Name<input aria-label="Participant name" value={participant.label} onChange={(e) => patchParticipant({ label: e.target.value })} /></label><label>Type<select aria-label="Participant type" value={participant.kind} onChange={(e) => patchParticipant({ kind: e.target.value === 'actor' ? 'actor' : 'participant' })}><option value="participant">Participant</option><option value="actor">Actor</option></select></label><button className="sq-page-button" onClick={() => onOpenPage(participant.id)}>{participant.pageIds?.length ? 'Open page' : 'Create page'}</button></>}
        {event?.kind === 'message' && <><div className="sq-field-row"><label>From<select value={event.from} aria-label="Message sender" onChange={(e) => patchEvent((item) => item.kind === 'message' ? { ...item, from: e.target.value } : item)}>{options}</select></label><label>To<select value={event.to} aria-label="Message receiver" onChange={(e) => patchEvent((item) => item.kind === 'message' ? { ...item, to: e.target.value } : item)}>{options}</select></label></div><label>Message<input aria-label="Message text" value={event.text} onChange={(e) => patchEvent((item) => item.kind === 'message' ? { ...item, text: e.target.value } : item)} /></label><label>Arrow<select value={event.arrow} aria-label="Message arrow" onChange={(e) => patchEvent((item) => item.kind === 'message' ? { ...item, arrow: e.target.value } : item)}>{SEQUENCE_ARROWS.map((arrow) => <option value={arrow} key={arrow}>{arrow}</option>)}</select></label></>}
        {event?.kind === 'note' && <><label>Note<input aria-label="Note text" value={event.text} onChange={(e) => patchEvent((item) => item.kind === 'note' ? { ...item, text: e.target.value } : item)} /></label><label>Placement<select aria-label="Note placement" value={event.placement} onChange={(e) => { const placement = e.target.value; if (placement === 'left of' || placement === 'right of' || placement === 'over') patchEvent((item) => item.kind === 'note' ? { ...item, placement, participants: placement === 'over' ? item.participants : item.participants.slice(0, 1) } : item); }}><option>left of</option><option>right of</option><option>over</option></select></label><div className="sq-field-row"><label>Participant<select aria-label="Note participant" value={event.participants[0]} onChange={(e) => patchEvent((item) => item.kind === 'note' ? { ...item, participants: [e.target.value, ...item.participants.slice(1)] } : item)}>{options}</select></label>{event.placement === 'over' && <label>Through<select aria-label="Note second participant" value={event.participants[1] ?? ''} onChange={(e) => patchEvent((item) => item.kind === 'note' ? { ...item, participants: e.target.value ? [item.participants[0], e.target.value] : [item.participants[0]] } : item)}><option value="">One participant</option>{options}</select></label>}</div></>}
        {event?.kind === 'activation' && <><label>Participant<select aria-label="Activation participant" value={event.participant} onChange={(e) => patchEvent((item) => item.kind === 'activation' ? { ...item, participant: e.target.value } : item)}>{options}</select></label><label>Action<select aria-label="Activation action" value={event.active ? 'start' : 'end'} onChange={(e) => patchEvent((item) => item.kind === 'activation' ? { ...item, active: e.target.value === 'start' } : item)}><option value="start">Activate</option><option value="end">Deactivate</option></select></label></>}
        {event?.kind === 'fragment' && <><label>Block<select aria-label="Block type" value={event.operator} onChange={(e) => { const operator = e.target.value; if (operator === 'alt' || operator === 'opt' || operator === 'loop' || operator === 'par') patchFragment({ ...event, operator, branches: operator === 'opt' || operator === 'loop' ? [{ label: event.branches[0]?.label ?? '', events: event.branches.flatMap((b) => b.events) }] : event.branches }); }}><option>alt</option><option>opt</option><option>loop</option><option>par</option></select></label>{event.branches.map((branch, index) => <div className="sq-branch-editor" key={index}><label>{index ? event.operator === 'par' ? 'and' : 'else' : 'Condition'}<input aria-label={`Branch ${index + 1} label`} value={branch.label} onChange={(e) => patchFragment({ ...event, branches: event.branches.map((b, i) => i === index ? { ...b, label: e.target.value } : b) })} /></label><button aria-label={`Insert into branch ${index + 1}`} className={target?.id === event.id && target.branch === index ? 'is-selected' : ''} onClick={() => setTarget({ id: event.id, branch: index })}>Insert here</button>{index > 0 && <button aria-label={`Remove branch ${index + 1}`} onClick={() => patchFragment({ ...event, branches: event.branches.filter((_, i) => i !== index) })}>×</button>}</div>)}{(event.operator === 'alt' || event.operator === 'par') && <button onClick={() => patchFragment({ ...event, branches: [...event.branches, { label: 'Condition', events: [] }] })}>+ Branch</button>}<button onClick={() => fold(event.id)}>{event.collapsed ? 'Unfold block' : 'Fold block'}</button></>}
      </section>}
    </aside>
  </main>;
}
