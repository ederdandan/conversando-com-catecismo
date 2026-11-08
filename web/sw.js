// Service worker: leitor 100% offline. Nunca intercepta a API do chat (outro domínio / /api/).
const VERSAO = 'catecismo-v3';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'icone.svg', 'manifest.webmanifest',
  'js/app.js', 'js/dados.js', 'js/leitor.js', 'js/busca.js', 'js/html.js',
  'js/chat.js', 'js/citacoes.js', 'js/config.js',
  'data/catecismo.json',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate para arquivos do próprio site; o resto passa direto.
self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  ev.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const salvo = await cache.match(ev.request, { ignoreSearch: true });
      const rede = fetch(ev.request)
        .then((r) => { if (r.ok) cache.put(ev.request, r.clone()); return r; })
        .catch(() => salvo);
      return salvo || rede;
    }),
  );
});
