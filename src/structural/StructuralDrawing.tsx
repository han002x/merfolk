import { useId } from 'react';
import type { StructuralDiagram } from './types';
import { relationPath, structuralProjection } from './layout';
import type { RelationLine, StructuralMarker } from './layout';

function wrap(text: string, width = 26): string[] { return text.split('\n').flatMap((paragraph) => { const lines: string[] = []; let line = ''; for (const word of paragraph.split(/\s+/)) { if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; } else line += `${line ? ' ' : ''}${word}`; } lines.push(line); return lines; }); }
const markers: StructuralMarker[] = ['none', 'inheritance', 'composition', 'aggregation', 'association', 'one', 'zero-or-one', 'one-or-more', 'zero-or-more'];
export function RelationshipMarkers({ prefix }: { prefix: string }) {
  return <defs>{markers.filter((marker) => marker !== 'none').map((marker) => <marker key={marker} id={`${prefix}-${marker}`} viewBox="0 0 24 16" refX="20" refY="8" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
    {marker === 'inheritance' ? <path d="M2 1L20 8L2 15Z" fill="var(--mf-node)" />
      : marker === 'composition' || marker === 'aggregation' ? <path d="M2 8L11 1L20 8L11 15Z" fill={marker === 'composition' ? 'var(--mf-ink)' : 'var(--mf-node)'} />
        : marker === 'association' ? <path d="M4 1L20 8L4 15" fill="none" />
          : <>{(marker === 'one' || marker === 'zero-or-one') && <path d="M18 1V15" />}{marker === 'one' && <path d="M12 1V15" />}{(marker === 'zero-or-one' || marker === 'zero-or-more') && <circle cx="7" cy="8" r="4" fill="var(--mf-node)" />}{marker === 'one-or-more' && <path d="M5 1V15" />}{(marker === 'one-or-more' || marker === 'zero-or-more') && <path d="M20 1L11 8L20 15M11 8H20" />}</>}
  </marker>)}</defs>;
}
export function RelationshipInk({ relation, path, prefix }: { relation: RelationLine; path: string; prefix: string }) {
  return <path d={path} className="st-relationship-line" fill="none" strokeDasharray={relation.dashed ? '7 5' : undefined} markerStart={relation.sourceMarker === 'none' ? undefined : `url(#${prefix}-${relation.sourceMarker})`} markerEnd={relation.targetMarker === 'none' ? undefined : `url(#${prefix}-${relation.targetMarker})`} />;
}
export function StructuralDrawing({ diagram }: { diagram: StructuralDiagram }) {
  const prefix = `st-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const projection = structuralProjection(diagram);
  const byId = new Map(projection.cards.map((card) => [card.id, card]));
  const notes = diagram.kind === 'class' ? diagram.notes.map((note, index) => { const box = byId.get(`class:${note.classId}`); const lines = wrap(note.text); return { note, lines, x: box ? box.x + box.width + 24 : 40, y: box ? box.y : 80 + index * 90, width: 210, height: Math.max(52, 22 + lines.length * 18) }; }) : [];
  const minX = Math.min(0, ...projection.cards.map((card) => card.x - 30));
  const minY = Math.min(0, ...projection.cards.map((card) => card.y - 30));
  const width = Math.max(400, ...projection.cards.map((card) => card.x + card.width + 140), ...notes.map((n) => n.x + n.width + 30)) - minX;
  const height = Math.max(240, ...projection.cards.map((card) => card.y + card.height + 80), ...notes.map((n) => n.y + n.height + 30)) - minY;
  return <svg xmlns="http://www.w3.org/2000/svg" className="st-drawing" viewBox={`${minX} ${minY} ${width} ${height}`} width={width} height={height} role="img" aria-label={diagram.kind === 'er' ? 'ER diagram' : 'Class diagram'}>
    <RelationshipMarkers prefix={prefix} />
    {projection.cards.filter((card) => card.frame).map((box) => <g key={box.id} data-diagram-element={box.item.card.id}><rect className="st-namespace-frame" x={box.x} y={box.y} width={box.width} height={box.height} rx="6" /><text x={box.x + 14} y={box.y + 24}>{box.item.card.label}</text></g>)}
    {projection.relationships.map((relation, index) => {
      const source = byId.get(relation.source); const target = byId.get(relation.target);
      if (!source || !target) return null;
      const siblings = projection.relationships.filter((r) => r.source === relation.source && r.target === relation.target);
      const offset = (siblings.findIndex((r) => r.id === relation.id) - (siblings.length - 1) / 2) * 24;
      const geometry = relationPath(source, target, offset);
      return <g key={`${relation.id}-${index}`}><RelationshipInk relation={relation} path={geometry.path} prefix={prefix} /><text textAnchor="middle" x={geometry.labelX} y={geometry.labelY}>{relation.label}</text><text x={geometry.sx + 14} y={geometry.sy - 10}>{relation.sourceLabel}</text><text x={geometry.tx - 20} y={geometry.ty - 10}>{relation.targetLabel}</text></g>;
    })}
    {projection.cards.filter((card) => !card.frame).map((box) => {
      const item = box.item;
      const lines = item.kind === 'entity' ? item.card.attributes.map((a) => `${a.type} ${a.name}${a.keys.length ? `  ${a.keys.join(',')}` : ''}${a.comment ? `  ${a.comment}` : ''}`) : item.kind === 'class' ? item.card.members.map((m) => m.signature) : [];
      return <g key={box.id} data-diagram-element={item.card.id} className="st-drawing-card"><rect x={box.x} y={box.y} width={box.width} height={box.height} rx="6" /><text x={box.x + box.width / 2} y={box.y + 31} textAnchor="middle">{item.card.label}{item.kind === 'class' && item.card.generics ? `〈${item.card.generics}〉` : ''}</text>{item.kind === 'class' && item.card.annotations.length > 0 && <text x={box.x + box.width / 2} y={box.y + 53} textAnchor="middle" className="st-drawing-stereotype">{`«${item.card.annotations.join(', ')}»`}</text>}{!item.card.collapsed && item.kind !== 'namespace' && <><line x1={box.x} x2={box.x + box.width} y1={box.y + 51 + (item.kind === 'class' && item.card.annotations.length ? 23 : 0)} y2={box.y + 51 + (item.kind === 'class' && item.card.annotations.length ? 23 : 0)} />{lines.map((line, index) => <text key={index} x={box.x + 12} y={box.y + 76 + index * 28 + (item.kind === 'class' && item.card.annotations.length ? 23 : 0)} className="st-drawing-member">{line}</text>)}</>}</g>;
    })}
    {notes.map(({ note, x, y, width: noteWidth, height: noteHeight, lines }) => <g key={note.id}><rect className="st-note" x={x} y={y} width={noteWidth} height={noteHeight} rx="3" /><text x={x + 12} y={y + 24}>{lines.map((line, index) => <tspan key={index} x={x + 12} dy={index ? 18 : 0}>{line}</tspan>)}</text></g>)}
  </svg>;
}
