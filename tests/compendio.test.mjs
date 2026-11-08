import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { agruparRefs, criarIndiceCompendio, htmlRespostaCompendio, responderPeloCompendio } from '../web/js/compendio.js';

const dados = JSON.parse(fs.readFileSync(new URL('../web/data/compendio.json', import.meta.url), 'utf8'));
const indice = criarIndiceCompendio(dados);
const primeiro = (q) => responderPeloCompendio(indice, q)[0]?.n;
const ns = (q) => responderPeloCompendio(indice, q).map((x) => x.n);

test('dados: 598 perguntas em ordem, com resposta e parágrafos válidos', () => {
  assert.equal(dados.itens.length, 598);
  dados.itens.forEach((x, i) => {
    assert.equal(x.n, i + 1);
    assert.ok(x.pergunta.length > 5 && x.resposta.length >= 20, `item ${x.n}`);
    assert.ok(x.refs.length && x.refs.every((r) => r >= 1 && r <= 2865), `refs do item ${x.n}`);
    assert.doesNotMatch(x.pergunta + x.resposta, /&[a-z]+;|<\/?[a-z]/i);
  });
  // Erros de digitação da fonte corrigidos (362-356, 15120-1523, 1655-1558, 1928-133, 2746-275).
  assert.deepEqual(dados.itens[68].refs, [362, 363, 364, 365, 382]);
  assert.ok(dados.itens[576].refs.includes(2751));
  // Referências que vinham no fim da resposta (item 555) e resposta que é citação (item 598).
  assert.deepEqual(dados.itens[554].refs, [2637, 2638, 2648]);
  assert.match(dados.itens[597].resposta, /Cirilo/);
});

test('acha a pergunta oficial nas perguntas de definição', () => {
  assert.equal(primeiro('O que é o purgatório?'), 210);
  assert.equal(primeiro('O que é a Eucaristia?'), 271);
  assert.equal(primeiro('o que é o pecado'), 392);
  assert.ok(ns('O que é a graça?').includes(423));
});

test('acha temas com palavras do dia a dia e grafia do Brasil', () => {
  assert.ok(ns('O que acontece depois da morte?').includes(205));
  assert.ok(ns('o que significa amém?').includes(598));
  assert.ok(ns('Quem é Maria?').length);
});

test('não responde perguntas fora do tema', () => {
  for (const q of ['Qual é a capital da França?', 'Me dá uma receita de bolo', 'Quem ganhou a copa de 2022?', 'Como programar em Python?', '']) {
    assert.deepEqual(ns(q), [], q);
  }
});

test('agrupa parágrafos seguidos em intervalos', () => {
  assert.deepEqual(agruparRefs([1030, 1031, 1054]), [[1030, 1031], [1054, 1054]]);
  assert.deepEqual(agruparRefs([]), []);
});

test('renderiza a resposta do Compêndio com citações clicáveis', () => {
  const html = htmlRespostaCompendio({ motivo: 'Cota <esgotada>.', itens: [dados.itens[209]] });
  assert.match(html, /Compêndio, 210/);
  assert.match(html, /Cota &lt;esgotada&gt;\./);
  assert.match(html, /<button type="button" class="cita fonte" data-n="1030">§ 1030–1031<\/button>/);
  assert.match(html, /data-n="1054">§ 1054</);
  const vazio = htmlRespostaCompendio({ motivo: 'Sem conexão.', itens: [] });
  assert.match(vazio, /Não encontrei no Compêndio/);
});
