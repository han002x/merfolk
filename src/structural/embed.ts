import type { StructuralDiagram } from './types';
export function embedStructural(diagram: StructuralDiagram, rootId: string): StructuralDiagram {
  const keep = new Set([rootId]);
  if (diagram.kind === 'class' && diagram.namespaces.some((n) => n.id === rootId)) {
    for (let changed = true; changed;) {
      changed = false;
      for (const n of diagram.namespaces) if (n.parentId && keep.has(n.parentId) && !keep.has(n.id)) { keep.add(n.id); changed = true; }
    }
    for (const c of diagram.classes) if (c.namespaceId && keep.has(c.namespaceId)) keep.add(c.id);
  } else {
    for (const r of diagram.relationships) {
      if (r.source === rootId) keep.add(r.target);
      if (r.target === rootId) keep.add(r.source);
    }
  }
  if (diagram.kind === 'er') return { ...diagram, entities: diagram.entities.filter((e) => keep.has(e.id)).map((e) => ({ ...e, collapsed: false })), relationships: diagram.relationships.filter((r) => keep.has(r.source) && keep.has(r.target)) };
  const classes = diagram.classes.filter((c) => keep.has(c.id)).map((c) => ({ ...c, collapsed: false }));
  for (const c of classes) {
    let id = c.namespaceId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) { seen.add(id); keep.add(id); id = diagram.namespaces.find((n) => n.id === id)?.parentId ?? null; }
  }
  return { ...diagram, classes, namespaces: diagram.namespaces.filter((n) => keep.has(n.id)).map((n) => ({ ...n, collapsed: false })), relationships: diagram.relationships.filter((r) => keep.has(r.source) && keep.has(r.target)), notes: diagram.notes.filter((n) => !n.classId || keep.has(n.classId)) };
}
