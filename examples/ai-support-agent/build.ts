import { readFileSync, writeFileSync } from 'node:fs';
import { childrenOf, foldEdges, groupOrigin, hiddenIds } from '../../src/fold.ts';
import { layout } from '../../src/layout.ts';
import { parseMermaid, toMermaid } from '../../src/mermaid/io.ts';
import { embedNode, extractLinks, pathTo, resolveLink } from '../../src/pages.ts';
import { splitSlides, toMarkdown } from '../../src/slides.ts';
import type { Diagram, DiagramNode, ElementStyle, Page } from '../../src/types.ts';

const here = new URL('./', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, here), 'utf8');
const save = (file: string, body: string) => writeFileSync(new URL(file, here), body);
const updatedAt = Date.UTC(2026, 10, 13);

const sources = [
  { id: 'support_overview', title: 'Support agent overview', file: 'overview', nodes: ['Question', 'Reply'] },
  { id: 'retrieval_design', title: 'Retrieval design', file: 'retrieval', nodes: ['Retrieval'] },
  { id: 'retrieval_runbook', title: 'Retrieval runbook', file: 'retrieval-runbook', nodes: ['Retrieval'] },
  { id: 'hybrid_search', title: 'Hybrid search', file: 'search', nodes: ['Search'] },
  { id: 'answer_generation', title: 'Answer generation', file: 'generation', nodes: ['Generation'] },
  { id: 'answer_checks', title: 'Answer checks', file: 'checks', nodes: ['Quality'] },
  { id: 'human_handoff', title: 'Human handoff', file: 'handoff', nodes: ['Handoff', 'Ticket', 'Human'] },
  { id: 'response_contract', title: 'Response contract', file: 'response-contract', nodes: ['Generation', 'Quality', 'Reply'] },
];

const pages: Page[] = sources.map(({ id, title, file }) => ({
  id, title, body: read(`wiki/${file}.md`), updatedAt,
}));
const deck: Page = {
  id: 'support_walkthrough', title: 'How a support agent answers a customer',
  body: read('slides.md'), updatedAt,
};

const parsed = parseMermaid(read('workflow.mmd'));
if (!parsed.ok) throw new Error(parsed.error);

const palette: Record<string, ElementStyle> = {
  Retrieval: { stroke: '#34658b', background: '#e5eff7' },
  Generation: { stroke: '#70558b', background: '#f0e9f6' },
  Quality: { stroke: '#916418', background: '#fbf0d6' },
  Handoff: { stroke: '#a95034', background: '#f9e5dc' },
  Reply: { stroke: '#31715d', background: '#e2f1e8' },
};

const positions: Record<string, DiagramNode['position']> = {
  Question: { x: 20, y: 120 },
  Rewrite: { x: 260, y: 120 },
  Embed: { x: 260, y: 300 },
  Vector: { x: 260, y: 440 },
  Keyword: { x: 490, y: 300 },
  Merge: { x: 380, y: 590 },
  Rerank: { x: 380, y: 780 },
  Context: { x: 820, y: 120 },
  Prompt: { x: 820, y: 270 },
  Draft: { x: 820, y: 420 },
  Citations: { x: 1110, y: 120 },
  Policy: { x: 1110, y: 270 },
  Supported: { x: 1110, y: 420 },
  Ticket: { x: 1390, y: 430 },
  Human: { x: 1390, y: 610 },
  Reply: { x: 1390, y: 120 },
};

const groupIds = new Set(parsed.diagram.nodes.flatMap((n) => n.parentId ? [n.parentId] : []));
const deckNodes = new Set(['Question', 'Retrieval', 'Quality']);
const nodes: DiagramNode[] = parsed.diagram.nodes.map((node) => {
  const family = pathTo(parsed.diagram.nodes, node.id).find((n) => palette[n.id]);
  const pageIds = sources.filter((source) => source.nodes.includes(node.id)).map((source) => source.id);
  return {
    ...node,
    collapsed: groupIds.has(node.id),
    position: positions[node.id] ?? node.position,
    style: { fontFamily: 'sans', sloppiness: 1, ...palette[family?.id ?? ''] },
    ...(pageIds.length ? { pageIds } : {}),
    ...(deckNodes.has(node.id) ? { deckIds: [deck.id] } : {}),
  };
});
const kids = childrenOf(nodes);
for (const node of nodes) node.position = groupOrigin(node.id, nodes, kids) ?? node.position;

const edges = parsed.diagram.edges.map((edge) => {
  const style: ElementStyle = edge.label === 'no'
    ? { stroke: '#a95034', strokeStyle: 'dashed' }
    : edge.label === 'yes' ? { stroke: '#31715d' } : {};
  return { ...edge, ...(Object.keys(style).length ? { style } : {}) };
});
const diagram: Diagram = { nodes, edges, pages, decks: [deck] };

for (const source of sources) {
  for (const id of source.nodes) {
    if (!nodes.some((node) => node.id === id)) throw new Error(`Missing linked node: ${id}`);
  }
}
for (const doc of [...pages, deck]) {
  for (const target of extractLinks(doc.body)) {
    if (resolveLink(target, nodes, pages).kind === 'none') throw new Error(`Unresolved link in ${doc.title}: ${target}`);
  }
  for (const match of doc.body.matchAll(/^\{\{diagram:([^}\n]+)\}\}/gm)) {
    if (!embedNode(match[1], nodes)) throw new Error(`Missing embed in ${doc.title}: ${match[1]}`);
  }
}

const mermaid = toMermaid(diagram);
const roundtrip = parseMermaid(mermaid);
if (!roundtrip.ok) throw new Error(roundtrip.error);
if (roundtrip.diagram.nodes.length !== nodes.length || roundtrip.diagram.edges.length !== edges.length)
  throw new Error('Mermaid round trip lost diagram elements');

const expandedNodes = nodes.map((node) => ({ ...node, collapsed: false }));
const expandedPositions = layout(expandedNodes, edges, 'TB');
const expanded: Diagram = {
  ...diagram,
  nodes: expandedNodes.map((node) => ({ ...node, position: expandedPositions[node.id] ?? node.position })),
};

save('ai-support-agent.merfolk.json', `${JSON.stringify({ version: 3, diagram }, null, 2)}\n`);
save('ai-support-agent.expanded.merfolk.json', `${JSON.stringify({ version: 3, diagram: expanded }, null, 2)}\n`);
save('ai-support-agent.mmd', `${mermaid}\n`);
save('slides.portable.md', toMarkdown(deck, diagram, 'Question'));

const hidden = hiddenIds(nodes);
const folded = foldEdges(nodes, edges, hidden);
console.log(`Built ${nodes.length} nodes, ${edges.length} connections, ${pages.length} wiki pages, and ${splitSlides(deck.body).slides.length} slides.`);
console.log(`Opening view: ${nodes.length - hidden.size} cards and ${folded.direct.length + folded.folded.length} connections.`);
