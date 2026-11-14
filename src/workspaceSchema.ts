import { z } from 'zod';
import { normalizeDiagram } from './pages.ts';
import type { Diagram } from './types.ts';

const id = z.string().min(1);
const style = z.object({
  stroke: z.string().optional(), background: z.string().optional(), strokeWidth: z.number().nonnegative().optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(), sloppiness: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  edges: z.enum(['sharp', 'round']).optional(), fontFamily: z.enum(['sans', 'serif', 'mono', 'hand']).optional(),
  fontSize: z.number().positive().optional(), opacity: z.number().min(0).max(1).optional(),
  animation: z.enum(['none', 'pulse', 'fade', 'draw', 'flow']).optional(), animationSpeed: z.number().positive().optional(),
});
export const nodeSchema = z.object({
  id: id.regex(/^[A-Za-z0-9_]+$/), label: z.string(),
  shape: z.enum(['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'dbl-circle', 'diamond', 'hexagon', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'flag']),
  parentId: id.nullable(), collapsed: z.boolean(), position: z.object({ x: z.number(), y: z.number() }),
  icon: z.string().optional(), pageIds: z.array(id).optional(), deckIds: z.array(id).optional(), pageId: id.optional(),
  image: z.object({ src: z.string(), pos: z.enum(['t', 'b']).optional(), w: z.number().positive().optional(), h: z.number().positive().optional(), constraint: z.boolean().optional() }).optional(),
  style: style.optional(),
});
export const edgeSchema = z.object({ id, source: id, target: id, label: z.string().optional(), order: z.number().int().positive().optional(), style: style.optional() });
export const documentSchema = z.object({ id: id.regex(/^[A-Za-z0-9_-]+$/), title: z.string(), body: z.string(), updatedAt: z.number().nonnegative() });
export const diagramSchema = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema), pages: z.array(documentSchema).default([]), decks: z.array(documentSchema).default([]) });
export const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), diagram: diagramSchema });
export const bootstrapSchema = snapshotSchema.extend({ token: z.string().min(1) });
export const changeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('put_node'), node: nodeSchema }),
  z.object({ kind: z.literal('put_edge'), edge: edgeSchema }),
  z.object({ kind: z.literal('put_page'), document: documentSchema.omit({ updatedAt: true }) }),
  z.object({ kind: z.literal('put_deck'), document: documentSchema.omit({ updatedAt: true }) }),
  z.object({ kind: z.literal('delete_node'), id }), z.object({ kind: z.literal('delete_edge'), id }),
  z.object({ kind: z.literal('delete_page'), id }), z.object({ kind: z.literal('delete_deck'), id }),
]);
export type Change = z.infer<typeof changeSchema>;

export function parseDiagram(value: unknown): Diagram {
  const d = normalizeDiagram(diagramSchema.parse(value));
  for (const list of [d.nodes, d.edges, d.pages ?? [], d.decks ?? []]) {
    if (new Set(list.map(x => x.id)).size !== list.length) throw new Error('Duplicate IDs');
  }
  const nodes = new Map(d.nodes.map(n => [n.id, n]));
  for (const node of d.nodes) {
    const seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent !== null) {
      if (seen.has(parent)) throw new Error('Parent cycle');
      seen.add(parent);
      const target = nodes.get(parent);
      if (!target) throw new Error(`Missing parent: ${parent}`);
      parent = target.parentId;
    }
    for (const [links, docs] of [[node.pageIds, d.pages], [node.deckIds, d.decks]] as const) {
      if (new Set(links).size !== (links?.length ?? 0)) throw new Error('Duplicate document links');
      if (links?.some(link => !docs?.some(doc => doc.id === link))) throw new Error('Missing linked document');
    }
  }
  if (d.edges.some(e => !nodes.has(e.source) || !nodes.has(e.target))) throw new Error('Missing edge endpoint');
  return d;
}
