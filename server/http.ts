import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { snapshotSchema } from '../src/workspaceSchema.ts';
import { Conflict, type Workspace } from './workspace.ts';

export async function serveWorkspace(workspace: Workspace) {
  const token = randomBytes(32).toString('hex');
  const root = fileURLToPath(new URL('./web/', import.meta.url));
  let origin = '';
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ token, ...workspace.snapshot() })); return;
      }
      if (url.pathname === '/api/workspace' && req.method === 'PUT') {
        if (req.headers['x-marmerlade-token'] !== token || req.headers.origin !== origin) { res.writeHead(403).end(); return; }
        const input = snapshotSchema.parse(JSON.parse(await body(req)));
        const saved = await workspace.commit(input.revision, () => input.diagram);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(saved)); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : extname(file) === '.html' ? data.toString('utf8').replace('<head>', '<head><meta name="marmerlade-workspace" content="live">') : data);
    } catch (error) {
      res.writeHead(error instanceof Conflict ? 409 : error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request failed' }));
    }
  });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', origin);
    if (req.headers.host !== new URL(origin).host || req.headers.origin !== origin || url.pathname !== '/events' || url.searchParams.get('token') !== token) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, client => { client.send(JSON.stringify(workspace.snapshot())); });
  });
  const unsubscribe = workspace.subscribe(() => {
    const payload = JSON.stringify(workspace.snapshot());
    for (const client of sockets.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  origin = `http://127.0.0.1:${address.port}`;
  return { url: origin, async close() {
    unsubscribe(); for (const client of sockets.clients) client.terminate(); sockets.close();
    await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  } };
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 20 * 1024 * 1024) throw new Error('Workspace exceeds 20 MB');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
