import type { Diagram } from '../types.ts';
import { parseMermaid, toMermaidWithMap } from './io.ts';
import { emitSequence, parseSequence } from '../sequence/io.ts';

export function parseDiagram(source: string): { ok: true; diagram: Diagram } | { ok: false; error: string } {
  const header = source.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('%%'))?.trim();
  if (header === 'sequenceDiagram') return parseSequence(source);
  const result = parseMermaid(source);
  return result.ok ? { ok: true, diagram: { ...result.diagram, kind: 'flowchart' } } : result;
}

export function emitDiagram(diagram: Diagram) {
  return diagram.kind === 'sequence' ? emitSequence(diagram) : toMermaidWithMap(diagram);
}
