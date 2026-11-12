import { equivalent } from './equivalent.ts';
import type { SequenceDiagram, SequenceEvent } from './sequence/types.ts';
import type { StructuralDiagram } from './structural/types.ts';

function semantic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantic);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id', 'position', 'collapsed', 'style'].includes(key))
    .map(([key, item]) => [key, semantic(item)]));
}

function sourceMatcher(source: string, parsed: unknown) {
  const reserved = new Set<string>();
  const collect = (value: unknown) => {
    if (value === null || typeof value !== 'object') return;
    if ('id' in value && typeof value.id === 'string') reserved.add(value.id);
    Object.values(value).forEach(collect);
  };
  collect(parsed);
  const explicit = new Set([...source.matchAll(/^\s*%%\s+merfolk-id\s+"?([^"\s]+)"?\s*$/gm)].map((match) => match[1]));
  const ids = new Map<string, string>();
  function retain<T extends { id: string }>(items: T[], previous: T[]): T[] {
    const matches = new Map<T, T>();
    const consumed = new Set<T>();
    for (const item of items) {
      const old = previous.find((candidate) => candidate.id === item.id);
      if (old) { matches.set(item, old); consumed.add(old); }
    }
    for (const exact of [true, false]) for (const item of items) {
      if (matches.has(item) || explicit.has(item.id)) continue;
      const old = previous.find((candidate) => !consumed.has(candidate) && !reserved.has(candidate.id) && (exact
        ? equivalent(semantic(candidate), semantic(item))
        : ['kind', 'from', 'to', 'source', 'target', 'classId'].every((key) => Reflect.get(candidate, key) === Reflect.get(item, key))));
      if (old) { matches.set(item, old); consumed.add(old); }
    }
    return items.map((item) => {
      const old = matches.get(item);
      if (!old || old.id === item.id) return item;
      ids.set(item.id, old.id);
      reserved.add(old.id);
      return { ...item, id: old.id };
    });
  }
  return { retain, ids };
}

/** Keep occurrence identity when editing pasted source without merfolk metadata. */
export function retainSequenceSourceIds(parsed: SequenceDiagram, current: SequenceDiagram, source: string) {
  const matcher = sourceMatcher(source, parsed);
  const events = (items: SequenceEvent[], previous: SequenceEvent[]): SequenceEvent[] => matcher.retain(items, previous).map((event) => {
    if (event.kind !== 'fragment') return event;
    const old = previous.find((candidate) => candidate.id === event.id);
    return { ...event, branches: event.branches.map((branch, index) => ({ ...branch,
      events: events(branch.events, old?.kind === 'fragment' ? old.branches[index]?.events ?? [] : []),
    })) };
  });
  return { diagram: { ...parsed, events: events(parsed.events, current.events) }, ids: matcher.ids };
}

export function retainStructuralSourceIds(parsed: StructuralDiagram, current: StructuralDiagram, source: string) {
  const matcher = sourceMatcher(source, parsed);
  let diagram = parsed;
  if (parsed.kind === 'er' && current.kind === 'er') diagram = { ...parsed,
    entities: parsed.entities.map((entity) => ({ ...entity, attributes: matcher.retain(entity.attributes, current.entities.find((old) => old.id === entity.id)?.attributes ?? []) })),
    relationships: matcher.retain(parsed.relationships, current.relationships),
  };
  if (parsed.kind === 'class' && current.kind === 'class') diagram = { ...parsed,
    classes: parsed.classes.map((card) => ({ ...card, members: matcher.retain(card.members, current.classes.find((old) => old.id === card.id)?.members ?? []) })),
    relationships: matcher.retain(parsed.relationships, current.relationships), notes: matcher.retain(parsed.notes, current.notes),
  };
  return { diagram, ids: matcher.ids };
}

export function remapSourceRefs<T extends { id: string }>(refs: Map<number, T>, ids: Map<string, string>): Map<number, T> {
  return new Map([...refs].map(([line, ref]) => [line, { ...ref, id: ids.get(ref.id) ?? ref.id }]));
}
