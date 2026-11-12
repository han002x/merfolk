import { useDiagram } from './store.ts';
import type { Diagram, PageEntity } from './types.ts';
const cache = new WeakMap<Diagram, PageEntity[]>();
export function entitiesOf(diagram: Diagram): PageEntity[] {
  const old = cache.get(diagram);
  if (old) return old;
  let entities: PageEntity[];
  switch (diagram.kind) {
    case 'flowchart': entities = diagram.nodes; break;
    case 'sequence': entities = diagram.participants; break;
    case 'er': entities = diagram.entities; break;
    case 'class': entities = [...diagram.namespaces, ...diagram.classes.map((c) => ({ ...c, parentId: c.namespaceId }))]; break;
  }
  cache.set(diagram, entities);
  return entities;
}
export function mapPageEntities(diagram: Diagram, update: (entity: PageEntity) => PageEntity): Diagram {
  const apply = <T extends PageEntity>(items: T[]) => items.map((item) => {
    const next = update(item);
    return next === item ? item : { ...item, label: next.label, pageIds: next.pageIds };
  });
  switch (diagram.kind) {
    case 'flowchart': return { ...diagram, nodes: apply(diagram.nodes) };
    case 'sequence': return { ...diagram, participants: apply(diagram.participants) };
    case 'er': return { ...diagram, entities: apply(diagram.entities) };
    case 'class': return { ...diagram, namespaces: apply(diagram.namespaces), classes: apply(diagram.classes) };
  }
}
export function usePageEntities() { return useDiagram((state) => entitiesOf(state.diagram)); }
export function pageEntities() { return entitiesOf(useDiagram.getState().diagram); }
