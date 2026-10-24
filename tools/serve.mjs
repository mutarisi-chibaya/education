// Tiny static server for local testing (no dependencies, works offline).
// Run: node tools/serve.mjs  →  http://localhost:8080
// Service workers need localhost or HTTPS, so open it via localhost.
// It serves only what serve.py serves (never data/, server code or tools), and only to this
// computer unless HOST is set, e.g. HOST=0.0.0.0 to try it from a phone on the same network.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';
const PUBLIC_DIRS = new Set(['css', 'js', 'i18n', 'icons', 'content', 'portal']);
const PUBLIC_FILES = new Set(['index.html', 'manifest.webmanifest', 'sw.js']);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Judged on the file the address resolves to, so ".." and encoded tricks reach nothing else.
function isPublic(file) {
  const parts = relative(root, file).split(sep);
  if (parts[0] === '..' || parts[0] === '') return false;
  const top = parts[0].toLowerCase();
  return PUBLIC_DIRS.has(top) || (parts.length === 1 && PUBLIC_FILES.has(top));
}

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!isPublic(file)) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`University Simulator → http://localhost:${port}`));
