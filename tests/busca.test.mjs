import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarIndice, buscar, numerosCitados, normalizar, trecho, radicaisDaPergunta } from '../web/js/busca.js';

const dados = JSON.parse(fs.readFileSync(new URL('../web/data/catecismo.json', import.meta.url), 'utf8'));
const t0 = performance.now();
const indice = criarIndice(dados.paragrafos);
const tempoIndice = performance.now() - t0;

const top = (q, k = 10) => buscar(indice, q, k).map((r) => r.n);

test('dados completos', () => {
  assert.equal(dados.paragrafos.length, 2865);
  assert.deepEqual(dados.paragrafos.map((p) => p.n), Array.from({ length: 2865 }, (_, i) => i + 1));
});

test('índice é rápido o bastante para o navegador', () => {
  assert.ok(tempoIndice < 1500, `índice levou ${tempoIndice.toFixed(0)} ms`);
});

test('grafia PT-PT e PT-BR equivalem', () => {
  assert.equal(normalizar('acto'), normalizar('ato'));
  assert.equal(normalizar('Baptismo'), normalizar('batismo'));
  assert.equal(normalizar('acção'), normalizar('ação'));
});

test('números de § citados', () => {
  assert.deepEqual(numerosCitados('O que diz o § 2558?'), [2558]);
  assert.deepEqual(numerosCitados('parágrafo 1849'), [1849]);
  assert.deepEqual(numerosCitados('§§ 27-29'), [27, 28, 29]);
  assert.deepEqual(numerosCitados('1849'), [1849]);
  assert.deepEqual(numerosCitados('§ 9999'), []);
  assert.deepEqual(numerosCitados('o que é o pecado?'), []);
});

// [pergunta, início e fim da seção do CIC que trata do tema, mínimo de resultados do top 10 dentro dela]
for (const [pergunta, ini, fim, minimo] of [
  ['O que é o pecado?', 1846, 1876, 3],
  ['batismo', 1213, 1284, 5],
  ['dez mandamentos', 2052, 2082, 5],
  ['o que é a oração', 2558, 2865, 5],
  ['ressurreição de Cristo', 638, 658, 2],
  ['sacramentos de cura', 1420, 1532, 3],
  ['Eucaristia', 1322, 1419, 5],
  ['Maria mãe de Deus', 484, 511, 3],
  ['matrimónio', 1601, 1666, 4],
  ['casamento', 1601, 1666, 1],
  ['mentira', 2482, 2492, 2],
]) {
  test(`busca: "${pergunta}" → ≥${minimo} do top 10 em §${ini}–${fim}`, () => {
    const r = top(pergunta);
    const dentro = r.filter((n) => n >= ini && n <= fim).length;
    assert.ok(dentro >= minimo, `${dentro} dentro; top 10: ${r.join(',')}`);
  });
}

test('pergunta fora do tema tem pontuação baixa ou nenhum resultado', () => {
  const r = buscar(indice, 'linguagem de programação python javascript');
  assert.ok(r.length === 0 || r[0].score < 8, `score ${r[0]?.score}`);
});

test('trecho destaca palavras da pergunta', () => {
  const p = dados.paragrafos.find((x) => x.n === 1849);
  const partes = trecho(p.texto, radicaisDaPergunta('pecado'));
  assert.ok(partes.some((x) => x.destaque && /pecado/i.test(x.texto)));
});
