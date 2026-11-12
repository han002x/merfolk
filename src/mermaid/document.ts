import type { Diagram } from '../types.ts';
import { parseMermaid, toMermaidWithMap } from './io.ts';
import { emitSequence, parseSequence } from '../sequence/io.ts';
import { emitStructural, parseStructural } from '../structural/io.ts';

export function parseDiagram(source: string): { ok: true; diagram: Diagram } | { ok: false; error: string } {
  const header = source.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('%%'))?.trim();
  if (header === 'sequenceDiagram') return parseSequence(source);
  if (header === 'erDiagram' || header === 'classDiagram') return parseStructural(source);
  const result = parseMermaid(source);
  return result.ok ? { ok: true, diagram: { ...result.diagram, kind: 'flowchart' } } : result;
}
export function emitDiagram(diagram: Diagram) {
  switch (diagram.kind) {
    case 'flowchart': return toMermaidWithMap(diagram);
    case 'sequence': return emitSequence(diagram);
    case 'er': case 'class': return emitStructural(diagram);
  }
}
