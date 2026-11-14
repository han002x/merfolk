import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium, expect } from '@playwright/test';

const dir = await mkdtemp(join(tmpdir(), 'marmerlade-mcp-'));
const file = join(dir, 'workspace.marmerlade.json');
const useNpx = process.argv[2] === '--npx';
const executable = resolve(useNpx ? 'marmerlade-0.1.0.tgz' : process.argv[2] ?? 'dist/cli.js');
let client;
let browser;
async function connect() {
  const transport = new StdioClientTransport({ command: useNpx ? 'npx' : process.execPath, args: useNpx ? ['--yes', '--package', executable, 'marmerlade', '--file', file] : [executable, '--file', file], cwd: dir, stderr: 'pipe' });
  transport.stderr?.on('data', data => { if (!data.toString().startsWith('Marmerlade:') && !data.toString().startsWith('Workspace:')) process.stderr.write(data); });
  const next = new Client({ name: 'integration-test', version: '1.0.0' });
  await next.connect(transport); return next;
}
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  const text = result.content.find(c => c.type === 'text');
  return JSON.parse(text.text);
}
try {
  client = await connect();
  assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['apply_changes', 'export_mermaid', 'get_workspace', 'import_mermaid', 'open_workspace']);
  const resources = await client.listResources(); assert.equal(resources.resources.length, 2);
  assert.ok((await client.readResource({ uri: 'marmerlade://guide' })).contents[0].text.includes('ontology'));
  const example = JSON.parse((await client.readResource({ uri: 'marmerlade://example' })).contents[0].text); assert.equal(example.version, 3);
  const initial = await call('get_workspace');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(initial.url);
  await expect(page.locator('.react-flow')).toBeVisible();
  await call('import_mermaid', { revision: 0, source: 'flowchart TD\n A["Agent created"] --> B["Database"]' });
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Agent created' })).toBeVisible();
  const second = await context.newPage(); second.on('pageerror', e => errors.push(e.message)); await second.goto(initial.url);
  await expect(second.locator('.react-flow__node').filter({ hasText: 'Agent created' })).toBeVisible();
  await page.getByRole('tab', { name: 'Mermaid', exact: true }).click();
  await page.getByLabel('Mermaid source', { exact: true }).fill('flowchart TD\n A["Browser edited"] --> B["Database"]');
  await expect.poll(async () => (await call('get_workspace')).diagram.nodes.find(n => n.id === 'A')?.label).toBe('Browser edited');
  await expect(second.locator('.react-flow__node').filter({ hasText: 'Browser edited' })).toBeVisible();
  // Keep a local edit pending, then commit an agent edit before its debounce fires.
  await page.route('**/api/workspace', async route => {
    const latest = await call('get_workspace');
    await call('apply_changes', { revision: latest.revision, changes: [{ kind: 'put_node', node: { ...latest.diagram.nodes.find(n => n.id === 'B'), label: 'Concurrent edit' } }] });
    await route.continue();
  }, { times: 1 });
  await page.getByLabel('Mermaid source', { exact: true }).fill('flowchart TD\n A["Unsaved draft"] --> B["Database"]');
  await expect(page.getByRole('alert')).toContainText('Download your draft');
  assert.equal((await call('get_workspace')).diagram.nodes.find(n => n.id === 'A').label, 'Browser edited');
  await expect(page.getByLabel('Mermaid source', { exact: true })).toContainText('Unsaved draft');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download draft' }).click();
  const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'draft.marmerlade.json');
  await page.getByRole('button', { name: 'Reload latest' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const current = await call('get_workspace');
  await call('apply_changes', { revision: current.revision, changes: [
    { kind: 'put_page', document: { id: 'notes', title: 'Notes', body: '# Wiki from agent' } },
    { kind: 'put_deck', document: { id: 'slides', title: 'Deck', body: '# Slides from agent\n\n---\n\n## Next' } },
    { kind: 'put_node', node: { ...current.diagram.nodes.find(n => n.id === 'A'), pageIds: ['notes'], deckIds: ['slides'] } },
  ] });
  await second.goto(`${initial.url}/#/wiki/notes`); await expect(second.getByLabel('Page content')).toContainText('Wiki from agent');
  await second.getByLabel('Page content').fill('Wiki from browser');
  await expect.poll(async () => (await call('get_workspace')).diagram.pages[0].body).toContain('Wiki from browser');
  await context.setOffline(true);
  await second.getByLabel('Page content').fill('Wiki offline draft');
  await expect(second.getByRole('alert')).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => (await call('get_workspace')).diagram.pages[0].body, { timeout: 10000 }).toContain('Wiki offline draft');
  await second.goto(`${initial.url}/#/slides/slides`); await expect(second.locator('body')).toContainText('Slides from agent');
  const stale = await client.callTool({ name: 'apply_changes', arguments: { revision: 0, changes: [{ kind: 'delete_node', id: 'A' }] } }); assert.equal(stale.isError, true);
  const exported = await call('export_mermaid'); assert.ok(exported.source.includes('Browser edited'));
  assert.equal((await fetch(`${initial.url}/api/workspace`, { method: 'PUT', body: '{}' })).status, 403);
  const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(saved.version, 3); assert.equal(saved.diagram.decks[0].id, 'slides');
  assert.deepEqual(errors, []);
  await browser.close(); browser = undefined;
  await client.close();
  client = await connect(); assert.equal((await call('get_workspace')).diagram.pages[0].body.includes('Wiki offline draft'), true);
  console.log('PASS: real MCP tools/resources, live browser editing both ways, multiple windows, conflicts, draft download, wiki/slides, restart and HTTP protection');
} finally {
  await browser?.close(); await client?.close(); await rm(dir, { recursive: true, force: true });
}
