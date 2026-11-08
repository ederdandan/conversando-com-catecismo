// Service worker: leitor 100% offline. Nunca intercepta a API do chat (outro domínio / /api/).
// Ao mudar qualquer arquivo do site, troque a VERSAO: os aparelhos baixam tudo de novo e recarregam.
const VERSAO = 'catecismo-v11';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'manifest.webmanifest',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-512.png',
  'icones/apple-touch-icon.png', 'icones/favicon-32.png',
  'js/app.js', 'js/dados.js', 'js/leitor.js', 'js/busca.js', 'js/html.js',
  'js/chat.js', 'js/citacoes.js', 'js/config.js', 'js/compendio.js', 'js/instalar.js',
  'data/catecismo.json', 'data/compendio.json',
];

self.addEventListener('install', (ev) => {
  // cache: 'reload' ignora o cache HTTP do navegador (o GitHub Pages manda guardar por 10 min),
  // senão a versão nova poderia ser montada com arquivos antigos.
  ev.waitUntil(
    caches.open(VERSAO)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate para arquivos do próprio site; o resto passa direto.
// A revalidação usa cache: 'no-cache' (pergunta ao servidor se mudou; resposta 304 é barata).
self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  ev.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const salvo = await cache.match(ev.request, { ignoreSearch: true });
      const rede = fetch(ev.request, { cache: 'no-cache' })
        .then((r) => { if (r.ok) cache.put(ev.request, r.clone()); return r; })
        .catch(() => salvo);
      return salvo || rede;
    }),
  );
});
