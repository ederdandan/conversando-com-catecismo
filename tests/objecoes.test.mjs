import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buscarObjecoes, htmlObjecao, objecoesDoCapitulo, objecoesDoTema, prepararObjecoes } from '../web/js/objecoes.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL(`../web/data/${f}`, import.meta.url), 'utf8'));
const ob = prepararObjecoes(ler('objecoes.json'));
const existe = new Set(ler('catecismo.json').paragrafos.map((p) => p.n));

test('dados: objeções únicas, completas, com tema válido e § existentes', () => {
  assert.ok(ob.objecoes.length >= 25);
  const ids = new Set();
  for (const o of ob.objecoes) {
    assert.ok(!ids.has(o.id), `id repetido ${o.id}`);
    ids.add(o.id);
    assert.ok(o.o && o.r && o.e.length > 60 && o.a && o.b.length, o.id);
    const s = ob.secoes.find((x) => x.id === o.s);
    assert.ok(s?.temas.some((t) => t.c === o.c), `tema inválido ${o.id}`);
    for (const [a, b] of o.cic) for (let n = a; n <= b; n++) assert.ok(existe.has(n), `${o.id}: § ${n}`);
    for (const v of o.bt || []) assert.ok(existe.has(v.p) && v.t.length > 10, `${o.id}: texto bíblico`);
    assert.ok(Number.isInteger(o.principal));
  }
});

test('tema, capítulo e busca', () => {
  const o = ob.objecoes[0];
  assert.ok(objecoesDoTema(ob, o.s, o.c).includes(o));
  assert.ok(objecoesDoCapitulo(ob, o.principal, o.principal).includes(o));
  assert.ok(buscarObjecoes(ob, 'Bíblia Tradição').length > 0);
});

test('html: objeção entre aspas, resposta curta, § clicáveis e reportar', () => {
  const comVerso = ob.objecoes.find((o) => o.bt?.length) || ob.objecoes[0];
  const h = htmlObjecao(comVerso, { aberta: true });
  assert.match(h, /<details class="faq-item obj-item" id="O-/);
  assert.match(h, / open>/);
  assert.match(h, /Resposta curta/);
  assert.match(h, /class="cita fonte" data-n="\d+"/);
  assert.match(h, /Erro%20na%20obje%C3%A7%C3%A3o/);
  if (comVerso.bt?.length) assert.match(h, /obj-verso/);
});
