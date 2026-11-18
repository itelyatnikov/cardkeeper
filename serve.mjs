// Tiny static server for dist/ (no deps). Usage: node serve.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = join(import.meta.dirname, 'dist');
const port = Number(process.argv[2] ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(root, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { f = join(root, 'index.html'); }
  try {
    const body = await readFile(f);
    const headers = { 'Content-Type': types[extname(f)] ?? 'application/octet-stream' };
    headers['Cache-Control'] = f.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, headers); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '0.0.0.0', () => console.log(`serving dist on :${port}`));
