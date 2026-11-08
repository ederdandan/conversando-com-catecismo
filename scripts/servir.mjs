// Servidor estático mínimo para desenvolvimento: node scripts/servir.mjs [porta]
// Serve web/ em http://localhost:5173/catecismo/ para simular o subcaminho do GitHub Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORTA = Number(process.argv[2] || 5173);
const PREFIXO = '/catecismo/';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: PREFIXO }); return res.end(); }
  if (!url.pathname.startsWith(PREFIXO)) { res.writeHead(404); return res.end('não encontrado'); }
  let rel = decodeURIComponent(url.pathname.slice(PREFIXO.length)) || 'index.html';
  const arquivo = path.resolve(RAIZ, rel);
  if (!arquivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(arquivo, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORTA, () => console.log(`Servindo web/ em http://localhost:${PORTA}${PREFIXO}`));
