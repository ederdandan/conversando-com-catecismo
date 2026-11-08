import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarApp, validarEntrada, montarMensagens, prepararTextos, provedores, esperaCotaDiaria, MENSAGEM_RECUSA } from '../src/app.js';
import { Cota } from '../src/cota.js';

const dados = JSON.parse(fs.readFileSync(new URL('../../web/data/catecismo.json', import.meta.url), 'utf8'));
const ORIGEM = 'http://localhost:5173';

// ---------- dublês ----------
function cotaFalsa() {
  const mapa = new Map();
  const storage = {
    async get(k) { return mapa.get(k); },
    async put(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) mapa.set(a, b); else mapa.set(k, v); },
    async deleteAll() { mapa.clear(); },
  };
  const obj = new Cota({ storage });
  return { idFromName: () => 'x', get: () => ({ fetch: (u, init) => obj.fetch(new Request(u, init)) }) };
}

function sseProvedor(pedacos) {
  const corpo = pedacos.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function ambiente(extra = {}) {
  return {
    ORIGENS_PERMITIDAS: ORIGEM,
    PROVEDOR_PRINCIPAL_URL: 'https://principal.test/chat',
    MODELO_PRINCIPAL: 'gemini-teste',
    PROVEDOR_RESERVA_URL: 'https://reserva.test/chat',
    MODELO_RESERVA: '',
    GEMINI_API_KEY: 'chave-gemini',
    CODIGOS_CONVITE: 'eder:codigo-eder-123,maria:codigo-maria-456',
    LIMITE_DIARIO_POR_CODIGO: '3',
    LIMITE_DIARIO_GLOBAL: '100',
    COTA: cotaFalsa(),
    ...extra,
  };
}

const pedir = (corpo, { codigo = 'codigo-eder-123', origem = ORIGEM, metodo = 'POST', caminho = '/api/chat' } = {}) =>
  new Request(`https://api.test${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(codigo ? { Authorization: `Bearer ${codigo}` } : {}), ...(origem ? { Origin: origem } : {}) },
    body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
  });

const corpoOk = { pergunta: 'O que é o pecado?', paragrafos: [1849, 1850, 1849] };

async function eventos(res) {
  const txt = await res.text();
  return txt.split('\n\n').filter(Boolean).map((b) => JSON.parse(b.replace(/^data: /, '')));
}

// ---------- testes ----------
test('validação de entrada', () => {
  assert.equal(validarEntrada(corpoOk), null);
  assert.match(validarEntrada({ pergunta: '', paragrafos: [1] }), /vazia/);
  assert.match(validarEntrada({ pergunta: 'x'.repeat(501), paragrafos: [1] }), /longa/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: [] }), /Nenhum/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: [0] }), /inválido/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: [2866] }), /inválido/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: ['12'] }), /inválido/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: Array.from({ length: 13 }, (_, i) => i + 1) }), /Máximo/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: [1], historico: [{ papel: 'sistema', texto: 'x' }] }), /Histórico/);
  assert.match(validarEntrada({ pergunta: 'a', paragrafos: [1], historico: [{ papel: 'usuario', texto: 'x'.repeat(1501) }] }), /longo/);
});

test('contexto usa o texto do servidor, sem marcadores de nota e sem duplicar §', () => {
  const textos = prepararTextos(dados);
  const { mensagens, paragrafos } = montarMensagens(corpoOk, textos);
  assert.deepEqual(paragrafos, [1849, 1850]);
  const user = mensagens.at(-1).content;
  assert.match(user, /\[§ 1849\] \(Terceira Parte — A Vida em Cristo › A dignidade da pessoa humana\)/);
  assert.match(user, /O pecado é uma falta contra a razão/);
  assert.doesNotMatch(user, /\(\d{1,3}\)/);
  assert.match(mensagens[0].content, /EXCLUSIVAMENTE/);
  assert.ok(mensagens[0].content.includes(MENSAGEM_RECUSA));
});

test('CORS: preflight da origem permitida', async () => {
  const app = criarApp({ dados, fetchFn: async () => { throw new Error('não deveria chamar'); } });
  const r = await app(new Request('https://api.test/api/chat', { method: 'OPTIONS', headers: { Origin: ORIGEM } }), ambiente());
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
});

test('CORS: origem estranha é bloqueada', async () => {
  const app = criarApp({ dados, fetchFn: async () => { throw new Error('não deveria chamar'); } });
  const r = await app(pedir(corpoOk, { origem: 'https://site-malicioso.com' }), ambiente());
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
});

test('sem código ou código errado → 401 (com CORS, para o app ler o erro)', async () => {
  const app = criarApp({ dados, fetchFn: async () => { throw new Error('não deveria chamar'); } });
  for (const codigo of [null, 'errado', 'codigo-eder-12']) {
    const r = await app(pedir(corpoOk, { codigo }), ambiente());
    assert.equal(r.status, 401, `código ${codigo}`);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  }
});

test('fluxo completo: chama a IA com a chave do servidor e devolve SSE simplificado', async () => {
  let pedido;
  const app = criarApp({
    dados,
    fetchFn: async (url, init) => { pedido = { url, init }; return sseProvedor(['O pecado é ', 'uma falta [§ 1849].']); },
  });
  const r = await app(pedir(corpoOk), ambiente());
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /event-stream/);
  assert.equal(pedido.url, 'https://principal.test/chat');
  assert.equal(pedido.init.headers.Authorization, 'Bearer chave-gemini');
  const enviado = JSON.parse(pedido.init.body);
  assert.equal(enviado.model, 'gemini-teste');
  assert.equal(enviado.stream, true);
  const ev = await eventos(r);
  assert.deepEqual(ev[0], { tipo: 'inicio', modelo: 'gemini:gemini-teste', paragrafos: [1849, 1850], restantes: 2 });
  assert.equal(ev.filter((e) => e.tipo === 'texto').map((e) => e.t).join(''), 'O pecado é uma falta [§ 1849].');
  assert.equal(ev.at(-1).tipo, 'fim');
  assert.ok(!JSON.stringify(ev).includes('chave-gemini'));
});

test('limite diário por código (3) e contagem separada por pessoa', async () => {
  const app = criarApp({ dados, fetchFn: async () => sseProvedor(['ok [§ 1849]']) });
  const env = ambiente();
  for (let i = 0; i < 3; i++) assert.equal((await app(pedir(corpoOk), env)).status, 200);
  const bloqueado = await app(pedir(corpoOk), env);
  assert.equal(bloqueado.status, 429);
  assert.match((await bloqueado.json()).erro, /limite de 3/);
  assert.equal((await app(pedir(corpoOk, { codigo: 'codigo-maria-456' }), env)).status, 200);
});

test('limite global', async () => {
  const app = criarApp({ dados, fetchFn: async () => sseProvedor(['ok']) });
  const env = ambiente({ LIMITE_DIARIO_GLOBAL: '1' });
  assert.equal((await app(pedir(corpoOk), env)).status, 200);
  const r = await app(pedir(corpoOk, { codigo: 'codigo-maria-456' }), env);
  assert.equal(r.status, 429);
  assert.match((await r.json()).erro, /limite diário de perguntas do app/);
});

test('reserva assume quando o principal falha (429)', async () => {
  const chamados = [];
  const app = criarApp({
    dados,
    fetchFn: async (url) => {
      chamados.push(url);
      return url.includes('principal') ? new Response('quota', { status: 429 }) : sseProvedor(['da reserva']);
    },
  });
  const r = await app(pedir(corpoOk), ambiente({ GROQ_API_KEY: 'chave-groq', MODELO_RESERVA: 'modelo-groq' }));
  assert.equal(r.status, 200);
  assert.deepEqual(chamados, ['https://principal.test/chat', 'https://reserva.test/chat']);
  assert.equal((await eventos(r))[0].modelo, 'groq:modelo-groq');
});

test('principal demora demais → tempo limite e a reserva assume', async () => {
  const app = criarApp({
    dados,
    fetchFn: (url, init) => (url.includes('principal')
      ? new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado'))))
      : Promise.resolve(sseProvedor(['rápida']))),
  });
  const t0 = Date.now();
  const r = await app(pedir(corpoOk), ambiente({ TEMPO_LIMITE_MS: '200', GROQ_API_KEY: 'k', MODELO_RESERVA: 'm' }));
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal((await eventos(r))[0].modelo, 'groq:m');
});

test('lista de modelos Gemini: tenta o segundo quando o primeiro está sobrecarregado', async () => {
  const modelos = [];
  const app = criarApp({
    dados,
    fetchFn: async (url, init) => {
      const m = JSON.parse(init.body).model;
      modelos.push(m);
      return m === 'g-novo' ? new Response('overloaded', { status: 503 }) : sseProvedor(['ok']);
    },
  });
  const r = await app(pedir(corpoOk), ambiente({ MODELO_PRINCIPAL: 'g-novo, g-lite' }));
  assert.equal(r.status, 200);
  assert.deepEqual(modelos, ['g-novo', 'g-lite']);
  assert.equal((await eventos(r))[0].modelo, 'gemini:g-lite');
});

test('todos os provedores falham → 502 e a cota é devolvida', async () => {
  const app = criarApp({ dados, fetchFn: async () => new Response('erro', { status: 500 }) });
  const env = ambiente();
  for (let i = 0; i < 4; i++) assert.equal((await app(pedir(corpoOk), env)).status, 502);
  // como as falhas devolveram a cota, ainda há perguntas disponíveis
  const app2 = criarApp({ dados, fetchFn: async () => sseProvedor(['ok']) });
  assert.equal((await app2(pedir(corpoOk), env)).status, 200);
});

test('rate limit por IP', async () => {
  const app = criarApp({ dados, fetchFn: async () => sseProvedor(['ok']) });
  const r = await app(pedir(corpoOk), ambiente({ LIMITE_IP: { limit: async () => ({ success: false }) } }));
  assert.equal(r.status, 429);
});

test('saúde e cota', async () => {
  const app = criarApp({ dados, fetchFn: async () => sseProvedor(['ok']) });
  const env = ambiente();
  const s = await app(pedir(null, { metodo: 'GET', caminho: '/api/saude', codigo: null }), env);
  assert.deepEqual(await s.json(), { ok: true, modelos: ['gemini:gemini-teste'] });
  await app(pedir(corpoOk), env);
  const c = await app(pedir(null, { metodo: 'GET', caminho: '/api/cota' }), env);
  assert.deepEqual(await c.json(), { nome: 'eder', usados: 1, limite: 3, restantes: 2 });
});

test('cota zera quando muda o dia', async () => {
  const c = cotaFalsa().get();
  const chamar = (dia) => c.fetch('https://cota/', { method: 'POST', body: JSON.stringify({ acao: 'consumir', chave: 'x', limite: 1, limiteGlobal: 10, dia }) }).then((r) => r.json());
  assert.equal((await chamar('2026-11-07')).ok, true);
  assert.equal((await chamar('2026-11-07')).ok, false);
  assert.equal((await chamar('2026-11-08')).ok, true);
});

test('mensagem de recusa idêntica no Worker e no app (o app depende dela para reconhecer a recusa)', async () => {
  const web = await import('../../web/js/citacoes.js');
  assert.equal(web.MENSAGEM_RECUSA, MENSAGEM_RECUSA);
});

test('modelos com esforço próprio (modelo@esforço) e padrão por provedor', () => {
  const lista = provedores({
    GEMINI_API_KEY: 'g', MODELO_PRINCIPAL: 'a, b@none', ESFORCO_PRINCIPAL: 'low', PROVEDOR_PRINCIPAL_URL: 'u1',
    GROQ_API_KEY: 'q', MODELO_RESERVA: 'openai/gpt-oss-120b@low,qwen/x@none', PROVEDOR_RESERVA_URL: 'u2',
  });
  assert.deepEqual(lista.map((p) => [p.nome, p.modelo, p.esforco]), [
    ['gemini', 'a', 'low'], ['gemini', 'b', 'none'], ['groq', 'openai/gpt-oss-120b', 'low'], ['groq', 'qwen/x', 'none'],
  ]);
  assert.equal(provedores({ GEMINI_API_KEY: 'g', MODELO_PRINCIPAL: 'a', MODELO_RESERVA: 'x' }).length, 1, 'sem GROQ_API_KEY não usa reserva');
});

test('citações no formato do gpt-oss (【§ N】) chegam padronizadas como [§ N]', async () => {
  const app = criarApp({ dados, fetchFn: async () => sseProvedor(['A graça 【§ 1849】', ' e ［§ 1850］.']) });
  const ev = await eventos(await app(pedir(corpoOk), ambiente()));
  assert.equal(ev.filter((e) => e.tipo === 'texto').map((e) => e.t).join(''), 'A graça [§ 1849] e [§ 1850].');
});

test('cota diária esgotada: o modelo é pulado até o horário informado pelo provedor', async () => {
  const erroDia = JSON.stringify([{ error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '600s' }] } }]);
  assert.equal(esperaCotaDiaria(429, erroDia), 600_000);
  assert.equal(esperaCotaDiaria(429, '{"error":"rate limit per minute"}'), 0, '429 por minuto não pula o modelo');
  assert.equal(esperaCotaDiaria(503, erroDia), 0);

  let relogio = 1_000_000;
  const chamados = [];
  const app = criarApp({
    dados, agora: () => relogio,
    fetchFn: async (url, init) => {
      const modelo = JSON.parse(init.body).model;
      chamados.push(modelo);
      return modelo === 'g1' ? new Response(erroDia, { status: 429 }) : sseProvedor(['ok [§ 1849]']);
    },
  });
  const env = () => ambiente({ MODELO_PRINCIPAL: 'g1,g2', LIMITE_DIARIO_POR_CODIGO: '10' });
  await (await app(pedir(corpoOk), env())).text();
  await (await app(pedir(corpoOk), env())).text();
  assert.deepEqual(chamados, ['g1', 'g2', 'g2'], 'segunda pergunta já vai direto ao g2');
  relogio += 601_000;
  await (await app(pedir(corpoOk), env())).text();
  assert.deepEqual(chamados.slice(3), ['g1', 'g2'], 'passado o prazo, tenta o g1 de novo');
});
