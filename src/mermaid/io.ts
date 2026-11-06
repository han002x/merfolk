// Mermaid flowchart <-> merfolk Diagram interop.
//
// We support the common `flowchart`/`graph` subset:
//   - node declarations with shapes:  A[Rect]  B(Round)  C{Diamond}  D((Circle))
//   - edges:  A --> B   A -->|label| B   A --- B
//   - subgraphs:  subgraph Title ... end   (become collapsible group nodes)
//
// This is intentionally a pragmatic parser, not a full mermaid grammar. It
// round-trips what merfolk itself produces and handles hand-written basics.

import type { Diagram, DiagramEdge, DiagramNode, NodeShape } from '../types';

interface ParsedNode {
  id: string;
  label: string;
  shape: NodeShape;
  parentId: string | null;
}

const SHAPE_PATTERNS: Array<{ re: RegExp; shape: NodeShape }> = [
  // order matters: circle (( )) before round ( )
  { re: /^([A-Za-z0-9_]+)\(\((.+?)\)\)$/, shape: 'circle' },
  { re: /^([A-Za-z0-9_]+)\{(.+?)\}$/, shape: 'diamond' },
  { re: /^([A-Za-z0-9_]+)\((.+?)\)$/, shape: 'round' },
  { re: /^([A-Za-z0-9_]+)\[(.+?)\]$/, shape: 'rect' },
];

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function parseNodeToken(
  token: string,
  parentId: string | null,
): ParsedNode | null {
  const t = token.trim();
  for (const { re, shape } of SHAPE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      return { id: m[1], label: stripQuotes(m[2]), shape, parentId };
    }
  }
  // bare id reference (e.g. just `A`)
  if (/^[A-Za-z0-9_]+$/.test(t)) {
    return { id: t, label: t, shape: 'rect', parentId };
  }
  return null;
}

const EDGE_RE =
  /^(.+?)\s*(-->|---|-\.->|==>)\s*(?:\|(.+?)\|\s*)?(.+)$/;

export function fromMermaid(src: string): Diagram {
  const lines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'));

  const nodeMap = new Map<string, ParsedNode>();
  const edges: DiagramEdge[] = [];
  const subgraphStack: string[] = [];
  let edgeSeq = 0;

  const ensureNode = (parsed: ParsedNode) => {
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      nodeMap.set(parsed.id, parsed);
      return;
    }
    // enrich: prefer a real shape/label over a bare reference
    if (existing.label === existing.id && parsed.label !== parsed.id) {
      existing.label = parsed.label;
      existing.shape = parsed.shape;
    }
    if (existing.parentId == null && parsed.parentId != null) {
      existing.parentId = parsed.parentId;
    }
  };

  for (const line of lines) {
    // diagram header
    if (/^(flowchart|graph)\b/i.test(line)) continue;

    // subgraph open: `subgraph id [Title]` or `subgraph Title`
    const sg = line.match(/^subgraph\s+(.+)$/i);
    if (sg) {
      const rest = sg[1].trim();
      const idMatch = rest.match(/^([A-Za-z0-9_]+)\s*\[(.+?)\]$/);
      const id = idMatch ? idMatch[1] : rest.replace(/\s+/g, '_');
      const label = idMatch ? stripQuotes(idMatch[2]) : rest;
      const parentId = subgraphStack.length
        ? subgraphStack[subgraphStack.length - 1]
        : null;
      ensureNode({ id, label, shape: 'rect', parentId });
      subgraphStack.push(id);
      continue;
    }

    if (/^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    const parent = subgraphStack.length
      ? subgraphStack[subgraphStack.length - 1]
      : null;

    // edge line
    const em = line.match(EDGE_RE);
    if (em) {
      const left = parseNodeToken(em[1], parent);
      const right = parseNodeToken(em[4], parent);
      const label = em[3] ? stripQuotes(em[3]) : undefined;
      if (left && right) {
        ensureNode(left);
        ensureNode(right);
        edges.push({
          id: `e${edgeSeq++}`,
          source: left.id,
          target: right.id,
          label,
        });
      }
      continue;
    }

    // standalone node declaration
    const only = parseNodeToken(line, parent);
    if (only) ensureNode(only);
  }

  const nodes: DiagramNode[] = [...nodeMap.values()].map((n, i) => ({
    id: n.id,
    label: n.label,
    shape: n.shape,
    parentId: n.parentId,
    collapsed: false,
    position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
  }));

  return { nodes, edges };
}

function shapeWrap(node: DiagramNode): string {
  const l = node.label;
  switch (node.shape) {
    case 'round':
      return `${node.id}("${l}")`;
    case 'diamond':
      return `${node.id}{"${l}"}`;
    case 'circle':
      return `${node.id}(("${l}"))`;
    default:
      return `${node.id}["${l}"]`;
  }
}

export function toMermaid(diagram: Diagram): string {
  const { nodes, edges } = diagram;
  const children = new Map<string | null, DiagramNode[]>();
  for (const n of nodes) {
    const key = n.parentId;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(n);
  }
  const groupIds = new Set(nodes.filter((n) => hasChildren(n.id)).map((n) => n.id));

  function hasChildren(id: string): boolean {
    return nodes.some((n) => n.parentId === id);
  }

  const out: string[] = ['flowchart TD'];
  const indent = (d: number) => '  '.repeat(d + 1);

  function emit(parentId: string | null, depth: number) {
    const kids = children.get(parentId) ?? [];
    for (const n of kids) {
      if (groupIds.has(n.id)) {
        out.push(`${indent(depth)}subgraph ${n.id} ["${n.label}"]`);
        emit(n.id, depth + 1);
        out.push(`${indent(depth)}end`);
      } else {
        out.push(`${indent(depth)}${shapeWrap(n)}`);
      }
    }
  }

  emit(null, 0);

  for (const e of edges) {
    const arrow = e.label ? `-->|${e.label}|` : '-->';
    out.push(`  ${e.source} ${arrow} ${e.target}`);
  }

  return out.join('\n');
}
