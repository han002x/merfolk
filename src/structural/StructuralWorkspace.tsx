import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, ViewportPortal, applyNodeChanges, getBezierPath, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps, type NodeTypes, type EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramMenu from '../components/DiagramMenu';
import { toggleTheme, useTheme } from '../theme';
import { parseRoute, useHash } from '../route';
import type { Cardinality, ClassCard, ClassMarker, ClassNamespace, ClassRelationship, ErEntity, ErRelationship, StructuralDiagram, StructuralRef } from './types';
import { decodeStructural, emitStructural, makeStructuralId, parseStructural } from './io';
import { layoutStructural, structuralProjection, type CardBox, type RelationLine } from './layout';
import { RelationshipInk, RelationshipMarkers } from './StructuralDrawing';
import './structural.css';

export interface StructuralWorkspaceProps {
  diagram: StructuralDiagram;
  onChange: (next: StructuralDiagram) => void;
  onSource: (source: string) => { ok: true } | { ok: false; error: string };
  onOpenPage: (id: string) => void;
  onImportFile: () => void;
  onExportFile: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onNewDiagram: (kind: 'flowchart' | 'sequence' | 'er' | 'class') => void;
}
type CardData = { box: CardBox; selectedRef: StructuralRef | null; select: (ref: StructuralRef) => void; fold: (ref: StructuralRef) => void; openPage: (id: string) => void; [key: string]: unknown };
type CardNode = Node<CardData, 'card'>;
type RelationData = { relation: RelationLine; parallel: number; select: (ref: StructuralRef) => void; [key: string]: unknown };
type RelationEdge = Edge<RelationData, 'relationship'>;
const sameRef = (a: StructuralRef | null, b: StructuralRef | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;
function Card({ data }: NodeProps<CardNode>) {
  const { box, select, fold, openPage, selectedRef } = data;
  const item = box.item;
  const kindLabel = item.kind === 'entity' ? 'Entity' : item.kind === 'class' ? 'Class' : 'Namespace';
  return <section className={`st-card ${box.frame ? 'st-frame-card' : ''} ${sameRef(selectedRef, box.ref) ? 'is-selected' : ''}`} style={{ width: box.width, minHeight: box.height }} role="button" tabIndex={0} aria-label={`${kindLabel} ${item.card.label}`} onClick={() => select(box.ref)} onDoubleClick={() => openPage(item.card.id)} onKeyDown={(event) => { if (event.key === 'Enter') select(box.ref); }}>
    {!box.frame && <><Handle type="target" position={Position.Left} id="left" /><Handle type="target" position={Position.Top} id="top" /><Handle type="source" position={Position.Right} id="right" /><Handle type="source" position={Position.Bottom} id="bottom" /></>}
    <div className="st-card-head"><span>{item.kind === 'namespace' ? '▧ ' : ''}{item.card.label}{item.kind === 'class' && item.card.generics ? `〈${item.card.generics}〉` : ''}</span><button className="nodrag" aria-label={item.card.collapsed ? 'Expand details' : 'Fold details'} title={item.card.collapsed ? 'Expand details' : 'Fold details'} onClick={(event) => { event.stopPropagation(); fold(box.ref); }}>{item.card.collapsed ? '+' : '−'}</button></div>
    {item.kind === 'class' && item.card.annotations.length > 0 && <div className="st-stereotype">«{item.card.annotations.join(', ')}»</div>}
    {!item.card.collapsed && item.kind === 'entity' && <div className="st-card-body">{item.card.attributes.length ? item.card.attributes.map((attribute) => <button key={attribute.id} className={`st-member nodrag ${sameRef(selectedRef, { kind: 'attribute', id: attribute.id }) ? 'is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); select({ kind: 'attribute', id: attribute.id }); }} title={attribute.comment}><span className="st-member-type">{attribute.type}</span><span>{attribute.name}</span><span className="st-key">{attribute.keys.join(',')}</span>{attribute.comment && <span className="st-comment">{attribute.comment}</span>}</button>) : <div className="st-no-members">No attributes</div>}</div>}
    {!item.card.collapsed && item.kind === 'class' && <div className="st-card-body">{item.card.members.length ? item.card.members.map((member, index) => <button key={member.id} className={`st-member st-class-member nodrag ${member.kind === 'method' && item.card.members[index - 1]?.kind !== 'method' ? 'st-method-start' : ''} ${sameRef(selectedRef, { kind: 'member', id: member.id }) ? 'is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); select({ kind: 'member', id: member.id }); }} title={member.signature}>{member.signature}</button>) : <div className="st-no-members">No members</div>}</div>}
  </section>;
}
function Relationship({ id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target, selected }: EdgeProps<RelationEdge>) {
  const prefix = `st-edge-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  if (!data) return null;
  const delta = data.parallel;
  const [bezier, labelX, labelY] = getBezierPath({ sourceX, sourceY: sourceY + delta, targetX, targetY: targetY + delta, sourcePosition, targetPosition });
  const self = source === target;
  const path = self ? `M${sourceX},${sourceY}C${sourceX + 110 + delta},${sourceY - 50} ${sourceX + 110 + delta},${targetY + 90} ${targetX},${targetY}` : bezier;
  return <g className={`st-edge ${selected ? 'is-selected' : ''}`}>
    <RelationshipMarkers prefix={prefix} /><BaseEdge path={path} style={{ stroke: 'transparent', strokeWidth: 20 }} /><RelationshipInk relation={data.relation} path={path} prefix={prefix} />
    <text className="st-end-label" x={sourceX + 18} y={sourceY - 10}>{data.relation.sourceLabel}</text><text className="st-end-label" x={targetX - 20} y={targetY - 10}>{data.relation.targetLabel}</text>
    <EdgeLabelRenderer><button className="st-edge-label nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${self ? sourceX + 90 : labelX}px,${self ? sourceY + 50 : labelY}px)` }} aria-label={`Relationship ${data.relation.label || id}`} onClick={() => data.select({ kind: 'relationship', id: data.relation.originalIds[0] ?? id })}>{data.relation.label || ' '}</button></EdgeLabelRenderer>
  </g>;
}
const nodeTypes: NodeTypes = { card: Card };
const edgeTypes: EdgeTypes = { relationship: Relationship };
export default function StructuralWorkspace(props: StructuralWorkspaceProps) { return <ReactFlowProvider><Workspace {...props} /></ReactFlowProvider>; }
function Workspace({ diagram, onChange, onSource, onOpenPage, onImportFile, onExportFile, onUndo, canUndo, onNewDiagram }: StructuralWorkspaceProps) {
  const generated = useMemo(() => emitStructural(diagram), [diagram]);
  const [source, setSource] = useState(generated.text);
  const lastApplied = useRef(generated.text);
  const sourceRefs = useRef(generated.lineRefs);
  const [selected, setSelected] = useState<StructuralRef | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'source' | 'outline'>('source');
  const sourceEditor = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();
  const hash = useHash();
  const flow = useReactFlow<CardNode, RelationEdge>();
  const projection = useMemo(() => structuralProjection(diagram), [diagram]);
  const entity = diagram.kind === 'er' ? diagram.entities.find((card) => card.id === selected?.id && selected.kind === 'entity') : undefined;
  const klass = diagram.kind === 'class' ? diagram.classes.find((card) => card.id === selected?.id && selected.kind === 'class') : undefined;
  const namespace = diagram.kind === 'class' ? diagram.namespaces.find((card) => card.id === selected?.id && selected.kind === 'namespace') : undefined;
  const ownerEntity = diagram.kind === 'er' ? diagram.entities.find((card) => card.attributes.some((attribute) => selected?.kind === 'attribute' && attribute.id === selected.id)) : undefined;
  const attribute = ownerEntity?.attributes.find((a) => a.id === selected?.id);
  const ownerClass = diagram.kind === 'class' ? diagram.classes.find((card) => card.members.some((member) => selected?.kind === 'member' && member.id === selected.id)) : undefined;
  const member = ownerClass?.members.find((m) => m.id === selected?.id);
  const relationship = selected?.kind === 'relationship' ? diagram.relationships.find((r) => r.id === selected.id) : undefined;
  const note = diagram.kind === 'class' && selected?.kind === 'note' ? diagram.notes.find((n) => n.id === selected.id) : undefined;
  const card = entity ?? klass ?? namespace;
  const change = useCallback((next: StructuralDiagram) => {
    try { decodeStructural(next); } catch (error) { setError(error instanceof Error ? error.message : 'Invalid diagram'); return; }
    onChange(next); setError('');
  }, [onChange]);
  const select = useCallback((ref: StructuralRef) => setSelected(ref), []);
  const fold = useCallback((ref: StructuralRef) => {
    if (diagram.kind === 'er') change({ ...diagram, entities: diagram.entities.map((c) => c.id === ref.id && ref.kind === 'entity' ? { ...c, collapsed: !c.collapsed } : c) });
    else change({ ...diagram, classes: diagram.classes.map((c) => c.id === ref.id && ref.kind === 'class' ? { ...c, collapsed: !c.collapsed } : c), namespaces: diagram.namespaces.map((c) => c.id === ref.id && ref.kind === 'namespace' ? { ...c, collapsed: !c.collapsed } : c) });
  }, [diagram, change]);
  const makeNodes = useCallback((): CardNode[] => projection.cards.map((box) => ({ id: box.id, type: 'card', position: { x: box.x, y: box.y }, data: { box, selectedRef: selected, select, fold, openPage: onOpenPage }, zIndex: box.frame ? -10 : 1, selectable: !box.frame, draggable: !box.frame, style: { width: box.width, height: box.height }, selected: sameRef(selected, box.ref) })), [projection.cards, selected, select, fold, onOpenPage]);
  const [nodes, setNodes] = useState<CardNode[]>(makeNodes);
  useEffect(() => { const frame = requestAnimationFrame(() => setNodes(makeNodes())); return () => cancelAnimationFrame(frame); }, [makeNodes]);
  const edges: RelationEdge[] = useMemo(() => projection.relationships.map((relation) => {
    const siblings = projection.relationships.filter((r) => r.source === relation.source && r.target === relation.target);
    const horizontal = diagram.direction === 'LR' || diagram.direction === 'RL';
    return { id: relation.id, source: relation.source, target: relation.target, type: 'relationship', sourceHandle: horizontal ? 'right' : 'bottom', targetHandle: horizontal ? 'left' : 'top', data: { relation, select, parallel: (siblings.findIndex((r) => r.id === relation.id) - (siblings.length - 1) / 2) * 24 }, selected: selected?.kind === 'relationship' && relation.originalIds.includes(selected.id) };
  }), [projection.relationships, diagram.direction, selected, select]);
  useEffect(() => { if (generated.text !== lastApplied.current) { lastApplied.current = generated.text; sourceRefs.current = generated.lineRefs; setSource(generated.text); setError(''); } }, [generated]);
  useEffect(() => {
    if (!selected || !sourceEditor.current || document.activeElement === sourceEditor.current) return;
    const line = [...sourceRefs.current].find(([, ref]) => sameRef(ref, selected))?.[0];
    if (line === undefined) return;
    const lines = source.split('\n'); const at = lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
    sourceEditor.current.setSelectionRange(at, at + (lines[line]?.length ?? 0));
  }, [selected, source]);
  const fit = useCallback(() => { void flow.fitView({ padding: .2, duration: 200 }); }, [flow]);
  useEffect(() => {
    const route = parseRoute(hash); if (route.kind !== 'node') return;
    const box = projection.cards.find((b) => b.item.card.id === route.id);
    if (!box) return;
    const frame = requestAnimationFrame(() => { setSelected(box.ref); void flow.fitBounds({ x: box.x, y: box.y, width: box.width, height: box.height }, { padding: .5, duration: 200 }); });
    return () => cancelAnimationFrame(frame);
  }, [hash, projection.cards, flow]);
  const cards = diagram.kind === 'er' ? diagram.entities : diagram.classes;
  const cardOptions = cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>);
  const tidy = (direction = diagram.direction) => {
    const measured = new Map(flow.getNodes().flatMap((n) => n.measured?.width && n.measured?.height ? [[n.id, { width: n.measured.width, height: n.measured.height }] as const] : []));
    change(layoutStructural({ ...diagram, direction }, measured)); requestAnimationFrame(fit);
  };
  const updateEntity = (id: string, update: (entity: ErEntity) => ErEntity) => { if (diagram.kind === 'er') change({ ...diagram, entities: diagram.entities.map((c) => c.id === id ? update(c) : c) }); };
  const updateClass = (id: string, update: (card: ClassCard) => ClassCard) => { if (diagram.kind === 'class') change({ ...diagram, classes: diagram.classes.map((c) => c.id === id ? update(c) : c) }); };
  const updateNamespace = (id: string, update: (card: ClassNamespace) => ClassNamespace) => { if (diagram.kind === 'class') change({ ...diagram, namespaces: diagram.namespaces.map((c) => c.id === id ? update(c) : c) }); };
  const addCard = () => {
    const id = makeStructuralId(); const position = flow.screenToFlowPosition({ x: window.innerWidth / 3, y: window.innerHeight / 2 });
    if (diagram.kind === 'er') { change({ ...diagram, entities: [...diagram.entities, { id, label: `Entity ${diagram.entities.length + 1}`, position, collapsed: false, attributes: [] }] }); select({ kind: 'entity', id }); }
    else { change({ ...diagram, classes: [...diagram.classes, { id, label: `Class ${diagram.classes.length + 1}`, position, collapsed: false, generics: '', annotations: [], namespaceId: namespace?.id ?? null, members: [] }] }); select({ kind: 'class', id }); }
  };
  const addNamespace = () => { if (diagram.kind !== 'class') return; const id = makeStructuralId(); change({ ...diagram, namespaces: [...diagram.namespaces, { id, label: `Namespace${diagram.namespaces.length + 1}`, position: { x: 40, y: 60 }, collapsed: false, parentId: namespace?.id ?? null }] }); select({ kind: 'namespace', id }); };
  const addRelationship = (sourceId?: string, targetId?: string) => {
    const source = sourceId ?? cards.find((c) => c.id === card?.id)?.id ?? cards[0]?.id;
    const target = targetId ?? cards.find((c) => c.id !== source)?.id ?? source;
    if (!source || !target) return;
    const id = makeStructuralId();
    if (diagram.kind === 'er') change({ ...diagram, relationships: [...diagram.relationships, { id, source, target, label: 'relates', sourceCardinality: 'one', targetCardinality: 'zero-or-more', identifying: true }] });
    else change({ ...diagram, relationships: [...diagram.relationships, { id, source, target, label: '', sourceMarker: 'none', targetMarker: 'association', lineStyle: 'solid', sourceMultiplicity: '', targetMultiplicity: '' }] });
    select({ kind: 'relationship', id });
  };
  const addAttribute = () => { const target = entity ?? ownerEntity ?? (diagram.kind === 'er' ? diagram.entities[0] : undefined); if (!target) return; const id = makeStructuralId(); updateEntity(target.id, (c) => ({ ...c, collapsed: false, attributes: [...c.attributes, { id, type: 'string', name: `attribute${c.attributes.length + 1}`, keys: [], comment: '' }] })); select({ kind: 'attribute', id }); };
  const addMember = (kind: 'attribute' | 'method') => { const target = klass ?? ownerClass ?? (diagram.kind === 'class' ? diagram.classes[0] : undefined); if (!target) return; const id = makeStructuralId(); updateClass(target.id, (c) => ({ ...c, collapsed: false, members: [...c.members, { id, kind, signature: kind === 'method' ? '+method() void' : '+String field' }] })); select({ kind: 'member', id }); };
  const addNote = () => { if (diagram.kind !== 'class') return; const id = makeStructuralId(); change({ ...diagram, notes: [...diagram.notes, { id, classId: klass?.id ?? ownerClass?.id ?? diagram.classes[0]?.id ?? null, text: 'Note' }] }); select({ kind: 'note', id }); };
  const updateRelationship = (patch: Partial<ErRelationship & ClassRelationship>) => {
    if (!relationship) return;
    if (diagram.kind === 'er') change({ ...diagram, relationships: diagram.relationships.map((r) => r.id === relationship.id ? { ...r, ...patch } : r) });
    else change({ ...diagram, relationships: diagram.relationships.map((r) => r.id === relationship.id ? { ...r, ...patch } : r) });
  };
  const remove = () => {
    if (!selected) return;
    if (diagram.kind === 'er') change({ ...diagram, entities: diagram.entities.filter((e) => !(selected.kind === 'entity' && e.id === selected.id)).map((e) => ({ ...e, attributes: e.attributes.filter((a) => !(selected.kind === 'attribute' && a.id === selected.id)) })), relationships: diagram.relationships.filter((r) => !(selected.kind === 'relationship' && r.id === selected.id) && !(selected.kind === 'entity' && (r.source === selected.id || r.target === selected.id))) });
    else {
      const removedNamespaces = new Set<string>();
      if (selected.kind === 'namespace') { removedNamespaces.add(selected.id); for (let more = true; more;) { more = false; for (const n of diagram.namespaces) if (n.parentId && removedNamespaces.has(n.parentId) && !removedNamespaces.has(n.id)) { removedNamespaces.add(n.id); more = true; } } }
      const removedClasses = new Set(diagram.classes.filter((c) => selected.kind === 'class' && c.id === selected.id || c.namespaceId && removedNamespaces.has(c.namespaceId)).map((c) => c.id));
      change({ ...diagram, namespaces: diagram.namespaces.filter((n) => !removedNamespaces.has(n.id)), classes: diagram.classes.filter((c) => !removedClasses.has(c.id)).map((c) => ({ ...c, members: c.members.filter((m) => !(selected.kind === 'member' && m.id === selected.id)) })), relationships: diagram.relationships.filter((r) => !removedClasses.has(r.source) && !removedClasses.has(r.target) && !(selected.kind === 'relationship' && r.id === selected.id)), notes: diagram.notes.filter((n) => !(selected.kind === 'note' && n.id === selected.id) && !(n.classId && removedClasses.has(n.classId))) });
    }
    setSelected(null);
  };
  const editSource = (value: string) => {
    setSource(value); const parsed = parseStructural(value);
    if (!parsed.ok) {
      if (/^\s*(?:%%[^\n]*\n\s*)*(flowchart|graph|sequenceDiagram)\b/.test(value)) { const result = onSource(value); setError(result.ok ? '' : result.error); return; }
      sourceRefs.current = new Map(); setError(parsed.error); return;
    }
    if (parsed.diagram.kind !== diagram.kind) { const result = onSource(value); setError(result.ok ? '' : result.error); return; }
    const preserve = <T extends { id: string; position: { x: number; y: number }; collapsed: boolean; pageIds?: string[]; style?: import('../types').ElementStyle }>(next: T[], old: T[]): T[] => next.map((c) => { const previous = old.find((p) => p.id === c.id); return previous ? { ...c, position: previous.position, collapsed: previous.collapsed, pageIds: c.pageIds ?? previous.pageIds, style: previous.style } : c; });
    let next: StructuralDiagram = parsed.diagram;
    if (next.kind === 'er' && diagram.kind === 'er') next = { ...next, entities: preserve(next.entities, diagram.entities) };
    if (next.kind === 'class' && diagram.kind === 'class') next = { ...next, classes: preserve(next.classes, diagram.classes), namespaces: preserve(next.namespaces, diagram.namespaces) };
    if (next.kind === 'er') next = { ...next, relationships: next.relationships.map((relationship) => ({ ...relationship, style: diagram.relationships.find((old) => old.id === relationship.id)?.style })) };
    else next = { ...next, relationships: next.relationships.map((relationship) => ({ ...relationship, style: diagram.relationships.find((old) => old.id === relationship.id)?.style })) };
    sourceRefs.current = parsed.lineRefs; lastApplied.current = emitStructural(next).text; setError(''); onChange(next);
  };
  const sourceSelect = () => { if (!sourceEditor.current) return; const line = source.slice(0, sourceEditor.current.selectionStart).split('\n').length - 1; const ref = sourceRefs.current.get(line); if (ref) select(ref); };
  const moveMember = (offset: number) => {
    const reorder = <T extends { id: string }>(items: T[]) => { const index = items.findIndex((i) => i.id === selected?.id); if (index < 0) return items; const next = [...items]; const [value] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + offset)), 0, value); return next; };
    if (attribute && ownerEntity) updateEntity(ownerEntity.id, (c) => ({ ...c, attributes: reorder(c.attributes) }));
    if (member && ownerClass) updateClass(ownerClass.id, (c) => ({ ...c, members: reorder(c.members) }));
  };
  const descendantNamespaces = new Set<string>();
  if (namespace && diagram.kind === 'class') { descendantNamespaces.add(namespace.id); for (let changed = true; changed;) { changed = false; for (const n of diagram.namespaces) if (n.parentId && descendantNamespaces.has(n.parentId) && !descendantNamespaces.has(n.id)) { descendantNamespaces.add(n.id); changed = true; } } }
  const notePositions = diagram.kind === 'class' ? diagram.notes.map((n, index) => { const owner = projection.cards.find((c) => c.ref.kind === 'class' && c.ref.id === n.classId); return { note: n, x: owner ? owner.x + owner.width + 30 : 50, y: owner ? owner.y + index * 60 : 100 + index * 70 }; }) : [];
  return <main className="st-workspace" onKeyDown={(event) => {
    if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); onUndo(); }
    if (event.key.toLowerCase() === 'f' && card && selected) fold(selected);
    if (event.key.toLowerCase() === 'w' && card) onOpenPage(card.id);
  }}>
    <section className="st-canvas" aria-label={diagram.kind === 'er' ? 'ER canvas' : 'Class canvas'}>
      <div className="st-toolbar"><DiagramMenu onNew={onNewDiagram} /><span className="st-kind">{diagram.kind === 'er' ? 'ER diagram' : 'Class diagram'}</span><button onClick={addCard}>{diagram.kind === 'er' ? '+ Entity' : '+ Class'}</button><button onClick={() => addRelationship()} disabled={!cards.length}>+ Relationship</button><button onClick={() => tidy()}>Tidy</button><button aria-label="Undo" disabled={!canUndo} onClick={onUndo}>↶</button><button aria-label="Toggle theme" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button><details className="st-menu"><summary aria-label="More diagram actions">•••</summary><div><button onClick={onImportFile}>Import file</button><button onClick={onExportFile}>Export file</button><button onClick={() => { void navigator.clipboard.writeText(generated.text).then(() => setNotice('Copied Mermaid'), () => setNotice('Copy failed')); }}>Copy Mermaid</button></div></details></div>
      <ReactFlow<CardNode, RelationEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={theme} fitView minZoom={.1} maxZoom={2} deleteKeyCode={null} panOnDrag={[1, 2]} onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))} onNodeDragStop={(_event, node) => {
        const ref = node.data.box.ref;
        if (ref.kind === 'entity') updateEntity(ref.id, (c) => ({ ...c, position: node.position }));
        if (ref.kind === 'class') updateClass(ref.id, (c) => ({ ...c, position: node.position }));
        if (ref.kind === 'namespace') updateNamespace(ref.id, (c) => ({ ...c, position: node.position }));
      }} onNodeClick={(_event, node) => select(node.data.box.ref)} onEdgeClick={(_event, edge) => { const id = edge.data?.relation.originalIds[0]; if (id) select({ kind: 'relationship', id }); }} onPaneClick={() => setSelected(null)} onConnect={(connection) => { const a = projection.cards.find((c) => c.id === connection.source); const b = projection.cards.find((c) => c.id === connection.target); if (a && b && a.ref.kind !== 'namespace' && b.ref.kind !== 'namespace') addRelationship(a.ref.id, b.ref.id); }}>
        <Background gap={20} /><Controls showFitView={false}><button className="react-flow__controls-button" aria-label="Fit diagram" onClick={fit}>⤢</button></Controls><MiniMap pannable zoomable />
        <ViewportPortal>{notePositions.map(({ note: n, x, y }) => <button key={n.id} className="st-canvas-note nodrag nopan" style={{ transform: `translate(${x}px,${y}px)` }} onClick={() => select({ kind: 'note', id: n.id })} aria-label={`Note ${n.text}`}>{n.text}</button>)}</ViewportPortal>
      </ReactFlow>
      {notice && <div className="st-notice" role="status">{notice}</div>}
    </section>
    <aside className="st-panel" aria-label="Diagram editor"><div className="st-tabs" role="tablist"><button role="tab" aria-selected={tab === 'source'} onClick={() => setTab('source')}>Mermaid</button><button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>Outline</button><button className="st-copy" onClick={() => { void navigator.clipboard.writeText(generated.text).then(() => setNotice('Copied Mermaid'), () => setNotice('Copy failed')); }}>Copy</button></div>
      {tab === 'source' ? <textarea className="st-source" ref={sourceEditor} aria-label="Diagram Mermaid source" value={source} onChange={(event) => editSource(event.target.value)} onClick={sourceSelect} onKeyUp={sourceSelect} spellCheck={false} /> : <div className="st-outline">{diagram.kind === 'class' && diagram.namespaces.map((n) => <button key={n.id} onClick={() => select({ kind: 'namespace', id: n.id })}>▧ {n.label}</button>)}{cards.map((c) => <button key={c.id} onClick={() => select({ kind: diagram.kind === 'er' ? 'entity' : 'class', id: c.id })}>{c.label}</button>)}<h4>Relationships</h4>{diagram.relationships.map((r) => <button key={r.id} onClick={() => select({ kind: 'relationship', id: r.id })}>{r.source} → {r.target}{r.label ? ` · ${r.label}` : ''}</button>)}{diagram.kind === 'class' && diagram.notes.map((n) => <button key={n.id} onClick={() => select({ kind: 'note', id: n.id })}>Note: {n.text}</button>)}</div>}
      {error && <div role="alert" className="st-error">{error}</div>}
      <div className="st-add">{diagram.kind === 'er' ? <button disabled={!cards.length} onClick={addAttribute}>+ Attribute</button> : <><button disabled={!cards.length} onClick={() => addMember('attribute')}>+ Field</button><button disabled={!cards.length} onClick={() => addMember('method')}>+ Method</button><button onClick={addNamespace}>+ Namespace</button><button onClick={addNote}>+ Note</button></>}</div>
      <div className="st-direction"><label>Layout<select aria-label="Layout direction" value={diagram.direction} onChange={(event) => { const direction = event.target.value; if (direction === 'TB' || direction === 'BT' || direction === 'LR' || direction === 'RL') tidy(direction); }}><option value="TB">Top down</option><option value="BT">Bottom up</option><option value="LR">Left to right</option><option value="RL">Right to left</option></select></label></div>
      {selected && <section className="st-inspector" aria-label="Selected diagram element"><header><span>{selected.kind}</span><div>{(attribute || member) && <><button aria-label="Move selected earlier" onClick={() => moveMember(-1)}>↑</button><button aria-label="Move selected later" onClick={() => moveMember(1)}>↓</button></>}<button onClick={remove} aria-label="Delete selected element">Delete</button></div></header>
        {card && <><label>Name<input aria-label={entity ? 'Entity name' : klass ? 'Class name' : 'Namespace name'} value={card.label} onChange={(event) => { if (entity) updateEntity(entity.id, (c) => ({ ...c, label: event.target.value })); if (klass) updateClass(klass.id, (c) => ({ ...c, label: event.target.value })); if (namespace) updateNamespace(namespace.id, (c) => ({ ...c, label: event.target.value })); }} /></label><button onClick={() => onOpenPage(card.id)}>{card.pageIds?.length ? 'Open page' : 'Create page'}</button><button onClick={() => fold(selected)}>{card.collapsed ? 'Expand details' : 'Fold details'}</button></>}
        {klass && <><label>Generic parameters<input aria-label="Generic parameters" value={klass.generics} onChange={(event) => updateClass(klass.id, (c) => ({ ...c, generics: event.target.value }))} /></label><label>Stereotypes<input aria-label="Class stereotypes" value={klass.annotations.join(', ')} onChange={(event) => updateClass(klass.id, (c) => ({ ...c, annotations: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))} /></label><label>Namespace<select aria-label="Class namespace" value={klass.namespaceId ?? ''} onChange={(event) => updateClass(klass.id, (c) => ({ ...c, namespaceId: event.target.value || null }))}><option value="">None</option>{diagram.kind === 'class' && diagram.namespaces.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label></>}
        {namespace && diagram.kind === 'class' && <label>Parent namespace<select aria-label="Parent namespace" value={namespace.parentId ?? ''} onChange={(event) => updateNamespace(namespace.id, (n) => ({ ...n, parentId: event.target.value || null }))}><option value="">None</option>{diagram.namespaces.filter((n) => !descendantNamespaces.has(n.id)).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>}
        {attribute && ownerEntity && <><label>Type<input aria-label="Attribute type" value={attribute.type} onChange={(event) => updateEntity(ownerEntity.id, (c) => ({ ...c, attributes: c.attributes.map((a) => a.id === attribute.id ? { ...a, type: event.target.value } : a) }))} /></label><label>Name<input aria-label="Attribute name" value={attribute.name} onChange={(event) => updateEntity(ownerEntity.id, (c) => ({ ...c, attributes: c.attributes.map((a) => a.id === attribute.id ? { ...a, name: event.target.value } : a) }))} /></label><div className="st-key-options">{(['PK', 'FK', 'UK'] as const).map((key) => <label key={key}><input type="checkbox" aria-label={key} checked={attribute.keys.includes(key)} onChange={(event) => updateEntity(ownerEntity.id, (c) => ({ ...c, attributes: c.attributes.map((a) => a.id === attribute.id ? { ...a, keys: event.target.checked ? [...a.keys, key] : a.keys.filter((k) => k !== key) } : a) }))} />{key}</label>)}</div><label>Comment<input aria-label="Attribute comment" value={attribute.comment} onChange={(event) => updateEntity(ownerEntity.id, (c) => ({ ...c, attributes: c.attributes.map((a) => a.id === attribute.id ? { ...a, comment: event.target.value } : a) }))} /></label></>}
        {member && ownerClass && <label>Member signature<input aria-label="Member signature" value={member.signature} onChange={(event) => updateClass(ownerClass.id, (c) => ({ ...c, members: c.members.map((m) => m.id === member.id ? { ...m, signature: event.target.value, kind: event.target.value.includes('(') ? 'method' : 'attribute' } : m) }))} /></label>}
        {relationship && <><div className="st-fields"><label>From<select aria-label="Relationship source" value={relationship.source} onChange={(event) => updateRelationship({ source: event.target.value })}>{cardOptions}</select></label><label>To<select aria-label="Relationship target" value={relationship.target} onChange={(event) => updateRelationship({ target: event.target.value })}>{cardOptions}</select></label></div><label>Label<input aria-label="Relationship label" value={relationship.label} onChange={(event) => updateRelationship({ label: event.target.value })} /></label>{'identifying' in relationship ? <><div className="st-fields"><label>Source cardinality<select aria-label="Source cardinality" value={relationship.sourceCardinality} onChange={(event) => { const cardinality = event.target.value; if (isCardinality(cardinality)) updateRelationship({ sourceCardinality: cardinality }); }}>{cardinalityOptions}</select></label><label>Target cardinality<select aria-label="Target cardinality" value={relationship.targetCardinality} onChange={(event) => { const cardinality = event.target.value; if (isCardinality(cardinality)) updateRelationship({ targetCardinality: cardinality }); }}>{cardinalityOptions}</select></label></div><label className="st-checkbox"><input type="checkbox" aria-label="Identifying relationship" checked={relationship.identifying} onChange={(event) => updateRelationship({ identifying: event.target.checked })} />Identifying</label></> : <><div className="st-fields"><label>Source marker<select aria-label="Source marker" value={relationship.sourceMarker} onChange={(event) => { const marker = event.target.value; if (isMarker(marker)) updateRelationship({ sourceMarker: marker }); }}>{markerOptions}</select></label><label>Target marker<select aria-label="Target marker" value={relationship.targetMarker} onChange={(event) => { const marker = event.target.value; if (isMarker(marker)) updateRelationship({ targetMarker: marker }); }}>{markerOptions}</select></label></div><div className="st-fields"><label>Source multiplicity<input aria-label="Source multiplicity" value={relationship.sourceMultiplicity} onChange={(event) => updateRelationship({ sourceMultiplicity: event.target.value })} /></label><label>Target multiplicity<input aria-label="Target multiplicity" value={relationship.targetMultiplicity} onChange={(event) => updateRelationship({ targetMultiplicity: event.target.value })} /></label></div><label>Line<select aria-label="Relationship line" value={relationship.lineStyle} onChange={(event) => updateRelationship({ lineStyle: event.target.value === 'dashed' ? 'dashed' : 'solid' })}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></label></>}</>}
        {note && diagram.kind === 'class' && <><label>Note<textarea aria-label="Note text" value={note.text} onChange={(event) => change({ ...diagram, notes: diagram.notes.map((n) => n.id === note.id ? { ...n, text: event.target.value } : n) })} /></label><label>Class<select aria-label="Note class" value={note.classId ?? ''} onChange={(event) => change({ ...diagram, notes: diagram.notes.map((n) => n.id === note.id ? { ...n, classId: event.target.value || null } : n) })}><option value="">Diagram</option>{cardOptions}</select></label></>}
      </section>}
    </aside>
  </main>;
}
function isCardinality(value: string): value is Cardinality { return value === 'one' || value === 'zero-or-one' || value === 'one-or-more' || value === 'zero-or-more'; }
function isMarker(value: string): value is ClassMarker { return value === 'none' || value === 'inheritance' || value === 'composition' || value === 'aggregation' || value === 'association'; }
const cardinalityOptions = <><option value="one">Exactly one</option><option value="zero-or-one">Zero or one</option><option value="one-or-more">One or more</option><option value="zero-or-more">Zero or more</option></>;
const markerOptions = <><option value="none">None</option><option value="inheritance">Inheritance</option><option value="composition">Composition</option><option value="aggregation">Aggregation</option><option value="association">Association</option></>;
