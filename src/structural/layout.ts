import Dagre from '@dagrejs/dagre';
import type { Cardinality, ClassCard, ClassMarker, ClassNamespace, ErEntity, StructuralDiagram, StructuralRef } from './types';

export type CardItem = { kind: 'entity'; card: ErEntity } | { kind: 'class'; card: ClassCard } | { kind: 'namespace'; card: ClassNamespace };
export type StructuralMarker = ClassMarker | Cardinality;
export interface CardBox { id: string; item: CardItem; ref: StructuralRef; x: number; y: number; width: number; height: number; frame: boolean }
export interface RelationLine { id: string; source: string; target: string; label: string; sourceLabel: string; targetLabel: string; sourceMarker: StructuralMarker; targetMarker: StructuralMarker; dashed: boolean; originalIds: string[]; summary: boolean }
export const canvasId = (ref: Pick<StructuralRef, 'kind' | 'id'>) => `${ref.kind}:${ref.id}`;
export function cardSize(item: CardItem) {
  if (item.kind === 'namespace') return { width: 220, height: 62 };
  const card = item.card;
  const lines = item.kind === 'entity' ? item.card.attributes.map((a) => `${a.type} ${a.name} ${a.keys.join(', ')} ${a.comment}`) : item.card.members.map((m) => m.signature);
  const width = Math.min(460, Math.max(220, (Math.max(card.label.length, ...lines.map((l) => l.length), 18) * 7.1) + 36));
  return { width, height: 58 + (!card.collapsed ? Math.max(1, lines.length) * 28 : 0) + (item.kind === 'class' && item.card.annotations.length ? 23 : 0) };
}
export function structuralProjection(diagram: StructuralDiagram): { cards: CardBox[]; relationships: RelationLine[] } {
  const cards: CardBox[] = [];
  const namespaces = diagram.kind === 'class' ? diagram.namespaces : [];
  const byNamespace = new Map(namespaces.map((n) => [n.id, n]));
  const hiddenBy = (namespaceId: string | null): ClassNamespace | undefined => {
    let cursor = namespaceId ? byNamespace.get(namespaceId) : undefined;
    let folded: ClassNamespace | undefined;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); if (cursor.collapsed) folded = cursor; cursor = cursor.parentId ? byNamespace.get(cursor.parentId) : undefined; }
    return folded;
  };
  const add = (item: CardItem, frame = false) => { const ref: StructuralRef = { kind: item.kind, id: item.card.id }; cards.push({ id: canvasId(ref), item, ref, ...item.card.position, x: item.card.position.x, y: item.card.position.y, ...cardSize(item), frame }); };
  if (diagram.kind === 'er') diagram.entities.forEach((card) => add({ kind: 'entity', card }));
  else {
    diagram.classes.filter((card) => !hiddenBy(card.namespaceId)).forEach((card) => add({ kind: 'class', card }));
    const pending = namespaces.filter((card) => !hiddenBy(card.parentId));
    const depth = (n: ClassNamespace) => { let d = 0; let p = n.parentId; const seen = new Set<string>(); while (p && !seen.has(p)) { seen.add(p); d++; p = byNamespace.get(p)?.parentId ?? null; } return d; };
    pending.sort((a, b) => depth(b) - depth(a)).forEach((card) => {
      add({ kind: 'namespace', card }, !card.collapsed);
      const box = cards[cards.length - 1];
      if (card.collapsed) return;
      const children = cards.filter((c) => c.id !== box.id && (c.item.kind === 'class' ? c.item.card.namespaceId === card.id : c.item.kind === 'namespace' && c.item.card.parentId === card.id));
      if (children.length) { box.x = Math.min(...children.map((c) => c.x)) - 28; box.y = Math.min(...children.map((c) => c.y)) - 52; box.width = Math.max(...children.map((c) => c.x + c.width)) - box.x + 28; box.height = Math.max(...children.map((c) => c.y + c.height)) - box.y + 28; }
    });
  }
  const proxy = (id: string) => {
    if (diagram.kind === 'er') return `entity:${id}`;
    const card = diagram.classes.find((c) => c.id === id);
    const folded = card ? hiddenBy(card.namespaceId) : undefined;
    return folded ? `namespace:${folded.id}` : `class:${id}`;
  };
  const relationships: RelationLine[] = [];
  for (const relation of diagram.relationships) {
    const source = proxy(relation.source); const target = proxy(relation.target);
    const summary = source.startsWith('namespace:') || target.startsWith('namespace:');
    if (summary && source === target) continue;
    const previous = summary ? relationships.find((r) => r.summary && r.source === source && r.target === target) : undefined;
    if (previous) { previous.originalIds.push(relation.id); previous.label = `×${previous.originalIds.length}`; continue; }
    relationships.push({ id: relation.id, source, target, label: relation.label, sourceLabel: 'sourceMultiplicity' in relation ? relation.sourceMultiplicity : '', targetLabel: 'targetMultiplicity' in relation ? relation.targetMultiplicity : '', sourceMarker: summary ? 'none' : 'sourceCardinality' in relation ? relation.sourceCardinality : relation.sourceMarker, targetMarker: summary ? 'none' : 'targetCardinality' in relation ? relation.targetCardinality : relation.targetMarker, dashed: summary || ('identifying' in relation ? !relation.identifying : relation.lineStyle === 'dashed'), originalIds: [relation.id], summary });
  }
  return { cards, relationships };
}

export function layoutStructural(diagram: StructuralDiagram, measured = new Map<string, { width: number; height: number }>()): StructuralDiagram {
  const projection = structuralProjection(diagram);
  const run = (compound: boolean) => {
    const graph = new Dagre.graphlib.Graph({ compound, multigraph: true });
    graph.setGraph({ rankdir: diagram.direction, nodesep: 65, ranksep: 110, marginx: 60, marginy: 90 });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const box of projection.cards) {
      const hasChildren = box.item.kind === 'namespace' && projection.cards.some((child) => child.item.kind === 'class' ? child.item.card.namespaceId === box.item.card.id : child.item.kind === 'namespace' && child.item.card.parentId === box.item.card.id);
      graph.setNode(box.id, box.frame && compound && hasChildren ? {} : measured.get(box.id) ?? { width: box.width, height: box.height });
    }
    if (compound && diagram.kind === 'class') for (const box of projection.cards) {
      const parentId = box.item.kind === 'class' ? box.item.card.namespaceId : box.item.kind === 'namespace' ? box.item.card.parentId : null;
      if (parentId && graph.hasNode(`namespace:${parentId}`)) graph.setParent(box.id, `namespace:${parentId}`);
    }
    for (const edge of projection.relationships) if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target, {}, edge.id);
    Dagre.layout(graph);
    return graph;
  };
  let graph: ReturnType<typeof run>;
  try { graph = run(true); } catch { graph = run(false); }
  const move = <T extends { id: string; position: { x: number; y: number } }>(cards: T[], kind: StructuralRef['kind']) => cards.map((card) => {
    const node = graph.node(canvasId({ kind, id: card.id }));
    return node && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.width) && Number.isFinite(node.height) ? { ...card, position: { x: node.x - node.width / 2, y: node.y - node.height / 2 } } : card;
  });
  return diagram.kind === 'er' ? { ...diagram, entities: move(diagram.entities, 'entity') } : { ...diagram, classes: move(diagram.classes, 'class'), namespaces: move(diagram.namespaces, 'namespace') };
}

export function relationPath(source: CardBox, target: CardBox, parallel = 0) {
  const self = source.id === target.id;
  const horizontal = Math.abs(target.x - source.x) > Math.abs(target.y - source.y);
  const sign = horizontal ? target.x >= source.x ? 1 : -1 : target.y >= source.y ? 1 : -1;
  const sx = self ? source.x + source.width : horizontal ? source.x + (sign > 0 ? source.width : 0) : source.x + source.width / 2 + parallel;
  const sy = self ? source.y + 28 : horizontal ? source.y + source.height / 2 + parallel : source.y + (sign > 0 ? source.height : 0);
  const tx = self ? source.x + source.width : horizontal ? target.x + (sign > 0 ? 0 : target.width) : target.x + target.width / 2 + parallel;
  const ty = self ? source.y + source.height - 18 : horizontal ? target.y + target.height / 2 + parallel : target.y + (sign > 0 ? 0 : target.height);
  const path = self ? `M${sx},${sy} C${sx + 100 + parallel},${sy - 35} ${tx + 100 + parallel},${ty + 35} ${tx},${ty}` : horizontal ? `M${sx},${sy} C${(sx + tx) / 2},${sy + parallel} ${(sx + tx) / 2},${ty + parallel} ${tx},${ty}` : `M${sx},${sy} C${sx + parallel},${(sy + ty) / 2} ${tx + parallel},${(sy + ty) / 2} ${tx},${ty}`;
  return { path, sx, sy, tx, ty, labelX: self ? sx + 90 : (sx + tx) / 2, labelY: (sy + ty) / 2 - 8 };
}

/** Arrange newly parsed cards while keeping all manually positioned cards fixed. */
export function placeNewStructuralCards(next: StructuralDiagram, previous: StructuralDiagram): StructuralDiagram {
  const existing = new Set(structuralProjection(previous).cards.filter((box) => !box.frame).map((box) => box.id));
  const oldBoxes = structuralProjection(previous).cards.filter((box) => !box.frame);
  const hasNew = structuralProjection(next).cards.some((box) => !box.frame && !existing.has(box.id));
  if (!hasNew) return next;
  const arranged = layoutStructural(next);
  const candidates = new Map(structuralProjection(arranged).cards.filter((box) => !box.frame).map((box) => [box.id, box]));
  const occupied = oldBoxes.map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height }));
  const place = <T extends { id: string; position: { x: number; y: number } }>(cards: T[], kind: StructuralRef['kind']): T[] => cards.map((card) => {
    const id = canvasId({ kind, id: card.id }); const box = candidates.get(id);
    if (existing.has(id) || !box) return card;
    let x = box.x; let y = box.y;
    const overlap = () => occupied.some((old) => x < old.x + old.width + 40 && x + box.width + 40 > old.x && y < old.y + old.height + 40 && y + box.height + 40 > old.y);
    if (overlap()) { x = Math.max(40, ...occupied.map((old) => old.x + old.width + 80)); y = Math.min(80, ...occupied.map((old) => old.y)); }
    occupied.push({ x, y, width: box.width, height: box.height });
    return { ...card, position: { x, y } };
  });
  return next.kind === 'er' ? { ...next, entities: place(next.entities, 'entity') } : { ...next, classes: place(next.classes, 'class'), namespaces: place(next.namespaces, 'namespace') };
}
