import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buscarFaq, htmlPergunta, perguntasDoCapitulo, perguntasDoTema, preparar } from '../web/js/faq.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL(`../web/data/${f}`, import.meta.url), 'utf8'));
const faq = preparar(ler('faq.json'));
const cic = ler('catecismo.json');
const existe = new Set(cic.paragrafos.map((p) => p.n));

test('dados: perguntas únicas, completas e com § existentes', () => {
  assert.ok(faq.perguntas.length >= 500);
  const ids = new Set();
  const textos = new Set();
  for (const q of faq.perguntas) {
    assert.ok(!ids.has(q.id), `id repetido ${q.id}`);
    ids.add(q.id);
    assert.ok(!textos.has(q.p), `pergunta repetida ${q.id}`);
    textos.add(q.p);
    assert.ok(q.p.endsWith('?') && q.r.length > 40 && q.a, q.id);
    assert.ok(q.b.length >= 1, `sem Bíblia ${q.id}`);
    assert.ok(q.cic.length && q.cic.every(([a, b]) => existe.has(a) && existe.has(b) && b >= a), `§ ${q.id}`);
    const s = faq.secoes.find((x) => x.id === q.s);
    assert.ok(s && s.temas.some((t) => t.c === q.c), `seção/tema ${q.id}`);
    assert.doesNotMatch(q.p + q.r + q.a, /\(CIC|\[\d+\]|baptis/i, q.id);
  }
});

test('temas da seção 1 somam 500 e cada um tem perguntas', () => {
  const s1 = faq.secoes.find((s) => s.id === 's1');
  const ns = s1.temas.map((t) => perguntasDoTema(faq, 's1', t.c).length);
  assert.ok(ns.every((n) => n > 0));
  assert.equal(ns.reduce((a, b) => a + b), 500);
});

test('capítulo: pergunta entra pelo § principal', () => {
  // Seção 1, capítulos 1 (26–49), 2 (50–141) e 3 (142–184). As perguntas sobre os artigos do Credo
  // (tema "Nós cremos") citam § da Seção 2 e aparecem nos capítulos que os explicam.
  const caps = [[26, 49], [50, 141], [142, 184]].map(([a, b]) => perguntasDoCapitulo(faq, a, b).length);
  assert.ok(caps.every((n) => n > 30), String(caps));
  assert.ok(caps.reduce((a, b) => a + b) >= 450);
  assert.equal(perguntasDoCapitulo(faq, 1, 2865).length, faq.perguntas.length);
  assert.equal(perguntasDoCapitulo(faq, 1, 25).length, 0); // Prólogo
  const q = faq.perguntas.find((x) => x.id === 'P1-S1-Q431'); // cita 748 e 946 → § principal 748
  assert.equal(q.principal, 748);
});

test('busca encontra pelo assunto e ignora o que não existe', () => {
  const r = buscarFaq(faq, 'Sagrada Escritura inspiração');
  assert.ok(r.length > 0);
  assert.match(r[0].p + r[0].r, /inspir/i); // "inspirou", "inspirados"
  assert.ok(buscarFaq(faq, 'tradição apostólica').length > 0);
  assert.equal(buscarFaq(faq, 'capital da França').length, 0);
  assert.equal(buscarFaq(faq, '   ').length, 0);
});

test('html: escapa o texto e cria botões de § para o painel', () => {
  const q = { id: 'X', p: 'A <b>?', r: 'R & r', a: 'An', b: ['Jo 1,14'], cic: [[27, 27], [101, 104]] };
  const h = htmlPergunta(q);
  assert.match(h, /A &lt;b&gt;\?/);
  assert.match(h, /R &amp; r/);
  assert.match(h, /data-n="27">§ 27</);
  assert.match(h, /data-n="101">§ 101–104</);
  assert.match(h, /Jo 1,14/);
});

// ---------- chat: resposta pronta (Compêndio + perguntas frequentes) ----------
import { criarIndiceCompendio, htmlRespostaCompendio, responderLocal } from '../web/js/compendio.js';
import { criarIndiceFaq } from '../web/js/faq.js';

const comp = criarIndiceCompendio(ler('compendio.json'));
criarIndiceFaq(faq);
const local = (q, o) => responderLocal(comp, faq, q, o);

test('com IA (estrita): só responde pergunta que já existe; o resto vai para a IA', () => {
  assert.equal(local('O que é o purgatório?', { estrita: true }).itens[0].n, 210);
  const f = local('Tradição é a mesma coisa que costume antigo?', { estrita: true });
  assert.equal(f.principal, 'faq');
  assert.equal(f.faq[0].p, 'Tradição é a mesma coisa que costume antigo?');
  // Parecidas, mas não a mesma pergunta: a IA explica.
  for (const q of ['O que é a graça?', 'Por que o ser humano deseja Deus?', 'Como rezar o terço?', 'Quem escreveu a Bíblia?']) {
    assert.equal(local(q, { estrita: true }), null, q);
  }
});

test('sem IA: a mais parecida vira a principal; a outra, "veja também"', () => {
  const a = local('Um ateu pode conhecer que Deus existe?');
  assert.equal(a.principal, 'faq');
  assert.match(a.faq[0].p, /ateu/);
  const b = local('O que é o pecado original?');
  assert.equal(b.principal, 'compendio');
  assert.equal(b.itens[0].pergunta, 'O que é o pecado original?');
  const c = local('capital da França');
  assert.equal(c.itens.length + c.faq.length, 0);
});

test('html da resposta pronta: autor, analogia, botão da IA', () => {
  const r = local('Tradição é a mesma coisa que costume antigo?', { estrita: true });
  const h = htmlRespostaCompendio({ pergunta: 'Tradição é a mesma coisa que costume antigo?', ...r, podeIA: true });
  assert.match(h, /Perguntas frequentes/);
  assert.match(h, /Para entender/);
  assert.match(h, /class="bt-sec pedir-ia"/);
  assert.match(h, /data-n="\d+"/);
  assert.doesNotMatch(htmlRespostaCompendio({ pergunta: 'x', ...r, podeIA: false }), /pedir-ia/);
});

test('resposta do Compêndio traz perguntas frequentes relacionadas, marcadas', () => {
  const r = local('O que é a Tradição?');
  assert.equal(r.principal, 'compendio');
  assert.ok(r.faq.length >= 1 && r.faq.length <= 3);
  assert.ok(r.faq.every((q) => /tradição/i.test(q.p)));
  const h = htmlRespostaCompendio({ pergunta: 'O que é a Tradição?', ...r });
  assert.match(h, /class="faq-relacionadas"/);
  assert.match(h, /Perguntas frequentes relacionadas/);
  assert.ok(h.indexOf('Compêndio,') < h.indexOf('faq-relacionadas')); // o Compêndio vem antes
  // Sem relação real, nada de "relacionadas" por coincidência de uma palavra comum.
  assert.equal(local('O que é a graça?').faq.length, 0);
  // Seção 2: o purgatório agora tem perguntas frequentes próprias.
  const p = local('O que é o purgatório?').faq;
  assert.ok(p.length >= 1 && p.every((q) => /Purgatório/i.test(q.p)));
});
