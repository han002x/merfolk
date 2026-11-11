// Mermaid flowchart <-> merfolk Diagram interop.
//
// We support the common `flowchart`/`graph` subset:
//   - node declarations in every classic bracket shape (see src/shapes.ts):
//       A[Rect]  B(Round)  C([Stadium])  D[[Sub]]  E[(Database)]  F((Circle))
//       G(((Double)))  H{Diamond}  I{{Hexagon}}  J[/Lean/]  K[\Lean\]
//       L[/Trap\]  M[\Trap/]  N>Flag]
//   - v11 shape/icon metadata:  A@{ shape: cyl, label: "DB" }
//                              B@{ icon: "simple-icons:github", form: "square", label: "GitHub" }
//   - edges:  A --> B   A -->|label| B   A --- B
//   - subgraphs:  subgraph Title ... end   (become collapsible group nodes)
//
// This is intentionally a pragmatic parser, not a full mermaid grammar. It
// round-trips what merfolk itself produces and handles hand-written basics.
// Everything merfolk emits is checked against the real mermaid parser by
// scripts/mermaid-compat.ts.

import type { Diagram, DiagramEdge, DiagramNode, NodeShape } from '../types';
import { SHAPES, SHAPE_ALIAS, iconForm, shapeDef, shapeForForm } from '../shapes.ts';

interface ParsedNode {
  id: string;
  label: string;
  shape: NodeShape;
  parentId: string | null;
  icon?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// longest opening delimiter first, so `(((` wins over `((` and `[(` over `[`
const SHAPE_PATTERNS: Array<{ re: RegExp; shape: NodeShape }> = [...SHAPES]
  .sort((a, b) => b.open.length - a.open.length)
  .map(({ open, close, shape }) => ({
    re: new RegExp(`^([A-Za-z0-9_]+)${escapeRe(open)}(.+?)${escapeRe(close)}$`),
    shape,
  }));

/** `id@{ key: value, ... }` (Mermaid v11 shape / icon metadata) */
const META_RE = /^([A-Za-z0-9_]+)\s*@\{(.*)\}$/;
const META_PAIR_RE = /([A-Za-z]+)\s*:\s*("(?:[^"\\]|\\.)*"|[^,]*)/g;

/** Where a node's wiki page lives; shared by the `click` emitter and parser. */
export const PAGE_HREF = '#/wiki/';
const CLICK_RE = /^click\s+([A-Za-z0-9_]+)\s+href\s+"#\/wiki\/([^"]+)"/;

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function parseMeta(id: string, body: string, parentId: string | null): ParsedNode {
  const meta: Record<string, string> = {};
  for (const m of body.matchAll(META_PAIR_RE)) meta[m[1]] = stripQuotes(m[2]);
  const label = meta.label ?? id;
  if (meta.icon) {
    return { id, label, shape: shapeForForm(meta.form), parentId, icon: meta.icon };
  }
  // shapes we don't draw yet still import, as rectangles
  const shape = SHAPE_ALIAS.get((meta.shape ?? 'rect').trim()) ?? 'rect';
  return { id, label, shape, parentId };
}

function parseNodeToken(
  token: string,
  parentId: string | null,
): ParsedNode | null {
  const t = token.trim();
  const meta = t.match(META_RE);
  if (meta) return parseMeta(meta[1], meta[2], parentId);
  for (const { re, shape } of SHAPE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      // a blank `" "` is how an unlabelled node is written (see shapeWrap)
      const label = stripQuotes(m[2]);
      return { id: m[1], label: label.trim() === '' ? '' : label, shape, parentId };
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

/** A line that the parser could not make sense of, for `parseMermaid`. */
export interface ParseIssue {
  /** 0-based line index within the source */
  line: number;
  /** the offending line text (trimmed) */
  text: string;
  reason: string;
}

interface CoreResult {
  diagram: Diagram;
  issues: ParseIssue[];
  /** number of non-blank, non-comment lines seen (excludes the header) */
  meaningfulLines: number;
}

/**
 * The shared parse core. Walks the source once and records, per line, whether
 * it matched a known construct. `fromMermaid` ignores the issue list (lenient);
 * `parseMermaid` uses it to reject text that does not parse cleanly.
 */
function parseCore(src: string): CoreResult {
  // keep original line indices so issues point at the right row in the editor
  const rawLines = src.split('\n');

  const nodeMap = new Map<string, ParsedNode>();
  const edges: DiagramEdge[] = [];
  const subgraphStack: string[] = [];
  const issues: ParseIssue[] = [];
  const pageIds = new Map<string, string>();
  let edgeSeq = 0;
  let meaningfulLines = 0;

  const ensureNode = (parsed: ParsedNode) => {
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      nodeMap.set(parsed.id, parsed);
      return;
    }
    // enrich: prefer a real shape/label over a bare reference
    if (existing.label === existing.id && (parsed.label !== parsed.id || parsed.icon)) {
      existing.label = parsed.label;
      existing.shape = parsed.shape;
      if (parsed.icon) existing.icon = parsed.icon;
    }
    if (existing.parentId == null && parsed.parentId != null) {
      existing.parentId = parsed.parentId;
    }
  };

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx].trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    // diagram header
    if (/^(flowchart|graph)\b/i.test(line)) continue;

    meaningfulLines++;

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
      // a blank title (`[" "]`) is an untitled group
      ensureNode({ id, label: label.trim() === '' ? '' : label, shape: 'rect', parentId });
      subgraphStack.push(id);
      continue;
    }

    if (/^end$/i.test(line)) {
      if (subgraphStack.length === 0) {
        issues.push({ line: idx, text: line, reason: '`end` without a matching `subgraph`' });
      } else {
        subgraphStack.pop();
      }
      continue;
    }

    const parent = subgraphStack.length
      ? subgraphStack[subgraphStack.length - 1]
      : null;

    // wiki link: `click A href "#/wiki/<pageId>"`
    const ck = line.match(CLICK_RE);
    if (ck) {
      pageIds.set(ck[1], ck[2]);
      continue;
    }

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
      } else {
        issues.push({ line: idx, text: line, reason: 'malformed edge endpoint' });
      }
      continue;
    }

    // standalone node declaration
    const only = parseNodeToken(line, parent);
    if (only) {
      ensureNode(only);
    } else {
      issues.push({ line: idx, text: line, reason: 'unrecognized statement' });
    }
  }

  if (subgraphStack.length > 0) {
    issues.push({
      line: rawLines.length - 1,
      text: '',
      reason: `${subgraphStack.length} unterminated subgraph${subgraphStack.length > 1 ? 's' : ''} (missing \`end\`)`,
    });
  }

  const nodes: DiagramNode[] = [...nodeMap.values()].map((n, i) => ({
    id: n.id,
    label: n.label,
    shape: n.shape,
    parentId: n.parentId,
    collapsed: false,
    position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
    ...(n.icon && { icon: n.icon }),
    ...(pageIds.has(n.id) && { pageId: pageIds.get(n.id) }),
  }));

  return { diagram: { nodes, edges }, issues, meaningfulLines };
}

export function fromMermaid(src: string): Diagram {
  return parseCore(src).diagram;
}

/** Outcome of a validating parse: either a clean diagram or a readable error. */
export type ParseResult =
  | { ok: true; diagram: Diagram }
  | { ok: false; error: string };

/**
 * Parse `src` strictly: succeeds only when the text is non-blank, every
 * meaningful line matched a known construct, and the result has at least one
 * node. Powers live editor->canvas sync, which must hold the last good canvas
 * while the text is mid-edit or malformed.
 */
export function parseMermaid(src: string): ParseResult {
  if (src.trim().length === 0) {
    return { ok: false, error: 'empty diagram' };
  }
  const { diagram, issues, meaningfulLines } = parseCore(src);
  if (issues.length > 0) {
    const first = issues[0];
    const where = first.text ? `line ${first.line + 1}: "${first.text}"` : `line ${first.line + 1}`;
    return { ok: false, error: `${where} — ${first.reason}` };
  }
  if (diagram.nodes.length === 0) {
    // e.g. only a `flowchart TD` header and blank lines
    return { ok: false, error: meaningfulLines === 0 ? 'no statements' : 'no nodes' };
  }
  return { ok: true, diagram };
}

/**
 * Merge a freshly parsed diagram with the current one, preserving canvas state
 * for elements that still exist. Nodes are matched by id: a surviving node
 * keeps its `position`, `style`, and `collapsed`, and takes `label`/`shape`/
 * `parentId` from the parsed text. Edges are matched by `source->target` to
 * carry over `style`. Elements absent from `parsed` are dropped; genuinely new
 * nodes keep the parsed (grid) position for the caller to lay out.
 */
export function mergeDiagram(parsed: Diagram, current: Diagram): Diagram {
  const curNodes = new Map(current.nodes.map((n) => [n.id, n]));

  const nodes: DiagramNode[] = parsed.nodes.map((p) => {
    const prev = curNodes.get(p.id);
    if (!prev) return p; // new node: keep parsed grid position
    return {
      ...p,
      position: prev.position,
      collapsed: prev.collapsed,
      style: prev.style,
      ...((p.pageId ?? prev.pageId) && { pageId: p.pageId ?? prev.pageId }),
    };
  });

  // index current edges by endpoint pair (edge ids are not stable across parses)
  const curEdges = new Map<string, DiagramEdge>();
  for (const e of current.edges) curEdges.set(`${e.source}\u0000${e.target}`, e);

  const edges: DiagramEdge[] = parsed.edges.map((p) => {
    const prev = curEdges.get(`${p.source}\u0000${p.target}`);
    return prev ? { ...p, style: prev.style } : p;
  });

  return { nodes, edges };
}

function shapeWrap(node: DiagramNode): string {
  const l = node.label;
  if (node.icon) {
    return `${node.id}@{ icon: "${node.icon}", form: "${iconForm(node.shape)}", label: "${l}" }`;
  }
  const { open, close } = shapeDef(node.shape);
  // mermaid rejects an empty `""` in bracket shapes, so a blank label is `" "`
  return `${node.id}${open}"${l || ' '}"${close}`;
}

/** A ref back to the diagram element a given source line represents. */
export interface LineRef {
  kind: 'node' | 'edge';
  id: string;
}

export interface MermaidResult {
  text: string;
  /** map of 0-based line index -> the element that line renders */
  lineRefs: Map<number, LineRef>;
}

/**
 * Serialize a diagram to Mermaid, also returning a per-line map back to the
 * node/edge each line came from. Powers the editor<->canvas highlight sync.
 */
export function toMermaidWithMap(diagram: Diagram): MermaidResult {
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
  const lineRefs = new Map<number, LineRef>();
  const indent = (d: number) => '  '.repeat(d + 1);

  function emit(parentId: string | null, depth: number) {
    const kids = children.get(parentId) ?? [];
    for (const n of kids) {
      if (groupIds.has(n.id)) {
        // the subgraph opener line represents the group node
        lineRefs.set(out.length, { kind: 'node', id: n.id });
        // an untitled group still needs a (blank) title to stay valid Mermaid
        out.push(`${indent(depth)}subgraph ${n.id} ["${n.label || ' '}"]`);
        emit(n.id, depth + 1);
        out.push(`${indent(depth)}end`);
      } else {
        lineRefs.set(out.length, { kind: 'node', id: n.id });
        out.push(`${indent(depth)}${shapeWrap(n)}`);
      }
    }
  }

  emit(null, 0);

  for (const e of edges) {
    const arrow = e.label ? `-->|${e.label}|` : '-->';
    lineRefs.set(out.length, { kind: 'edge', id: e.id });
    out.push(`  ${e.source} ${arrow} ${e.target}`);
  }

  for (const n of nodes) {
    if (!n.pageId) continue;
    lineRefs.set(out.length, { kind: 'node', id: n.id });
    out.push(`  click ${n.id} href "${PAGE_HREF}${n.pageId}"`);
  }

  return { text: out.join('\n'), lineRefs };
}

export function toMermaid(diagram: Diagram): string {
  return toMermaidWithMap(diagram).text;
}
