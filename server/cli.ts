#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import open from 'open';
import { changeSchema, parseDiagram } from '../src/workspaceSchema.ts';
import { applyChanges, openWorkspace } from './workspace.ts';
import { serveWorkspace } from './http.ts';
import { mergeDiagram, parseMermaid, toMermaid } from '../src/mermaid/io.ts';
import { layout } from '../src/layout.ts';

async function main() {
  const { values } = parseArgs({ options: { file: { type: 'string', default: './diagram.marmerlade.json' }, help: { type: 'boolean' }, version: { type: 'boolean' } } });
  if (values.help || values.version) {
    process.stderr.write(values.version ? '0.1.0\n' : 'Usage: marmerlade [--file ./diagram.marmerlade.json]\nStarts MCP over stdio and serves a live canvas on localhost.\n'); return;
  }
  const workspace = await openWorkspace(values.file);
  let http: Awaited<ReturnType<typeof serveWorkspace>>;
  try { http = await serveWorkspace(workspace); } catch (error) { await workspace.close(); throw error; }
  const server = new McpServer({ name: 'marmerlade', version: '0.1.0' });
  const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const tool = (fn: () => unknown | Promise<unknown>) => Promise.resolve().then(fn).then(result).catch((error: unknown) => ({ ...result({ error: error instanceof Error ? error.message : String(error) }), isError: true }));
  server.registerTool('get_workspace', { description: 'Read the diagram, wiki pages, slide decks, current revision, file and live canvas URL.' }, () => tool(() => ({ ...workspace.snapshot(), file: workspace.file, url: http.url })));
  server.registerTool('apply_changes', {
    description: 'Atomically edit a workspace. Read its revision first. put operations replace the entity with that ID; delete_node removes its subtree and incident edges, retaining documents. Document deletions unlink every node. Include all related changes in one batch.',
    inputSchema: { revision: z.number().int().nonnegative(), changes: z.array(changeSchema).min(1) },
  }, ({ revision, changes }) => tool(() => workspace.commit(revision, d => applyChanges(d, changes))));
  server.registerTool('import_mermaid', {
    description: 'Replace diagram structure from a Mermaid flowchart, preserving existing content and styling by ID. New document references create empty pages/decks. Optional tidy repositions nodes.',
    inputSchema: { revision: z.number().int().nonnegative(), source: z.string(), tidy: z.boolean().default(true) },
  }, ({ revision, source, tidy }) => tool(() => workspace.commit(revision, current => {
    const parsed = parseMermaid(source); if (!parsed.ok) throw new Error(parsed.error);
    const d = { ...mergeDiagram(parsed.diagram, current), pages: current.pages ?? [], decks: current.decks ?? [] };
    for (const [key, list] of [['pageIds', d.pages], ['deckIds', d.decks]] as const) {
      for (const node of d.nodes) for (const id of node[key] ?? []) if (!list.some(doc => doc.id === id)) list.push({ id, title: node.label, body: '', updatedAt: Date.now() });
    }
    parseDiagram(d);
    if (tidy) { const positions = layout(d.nodes, d.edges); d.nodes = d.nodes.map(n => ({ ...n, position: positions[n.id] ?? n.position })); }
    return d;
  })));
  server.registerTool('export_mermaid', { description: 'Export diagram structure as Mermaid. Use get_workspace for lossless content.' }, () => tool(() => ({ source: toMermaid(workspace.snapshot().diagram) })));
  server.registerTool('open_workspace', {
    description: 'Open the live browser canvas, or a node, wiki page, or slide deck.',
    inputSchema: { view: z.enum(['canvas', 'node', 'wiki', 'slides']).default('canvas'), id: z.string().optional() },
  }, ({ view, id }) => tool(async () => {
    if (view === 'node' && !id) throw new Error('Node view requires an id');
    const url = `${http.url}/#/${view === 'canvas' ? '' : view}${id ? '/' + encodeURIComponent(id) : ''}`;
    await open(url); return { url };
  }));
  for (const [name, filename] of [['guide', 'guide.md'], ['example', 'example.marmerlade.json']] as const) {
    server.registerResource(name, `marmerlade://${name}`, { description: name === 'guide' ? 'Document model, editing rules, wiki and slides syntax' : 'Complete example with diagram, wiki pages and slides', mimeType: name === 'guide' ? 'text/markdown' : 'application/json' }, async uri => ({ contents: [{ uri: uri.href, text: await readFile(new URL(`./${filename}`, import.meta.url), 'utf8') }] }));
  }
  let closing = false;
  async function close() { if (closing) return; closing = true; await server.close(); await http.close(); await workspace.close(); }
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  process.stdin.once('end', () => { void close(); });
  try { await server.connect(new StdioServerTransport()); } catch (error) { await close(); throw error; }
  process.stderr.write(`Marmerlade: ${http.url}\nWorkspace: ${workspace.file}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
