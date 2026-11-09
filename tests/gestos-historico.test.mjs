import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abaDaRota, abaVizinha, direcaoDoGesto } from '../web/js/gestos.js';
import { salvarLista, MAX_MENSAGENS } from '../web/js/historico.js';

test('gestos: cada rota pertence a uma aba; o leitor não tem gesto', () => {
  assert.equal(abaDaRota(''), 'inicio');
  assert.equal(abaDaRota('busca'), 'sumario');
  assert.equal(abaDaRota('entrar'), 'sobre');
  assert.equal(abaDaRota('duvidas'), 'duvidas');
  assert.equal(abaDaRota('p'), null);
});

test('gestos: vizinhas na ordem Início → Ler → Dúvidas → Conversar → Mais, sem dar a volta', () => {
  assert.equal(abaVizinha('inicio', 1), 'sumario');
  assert.equal(abaVizinha('sumario', 1), 'duvidas');
  assert.equal(abaVizinha('conversar', -1), 'duvidas');
  assert.equal(abaVizinha('sobre', 1), null);
  assert.equal(abaVizinha('inicio', -1), null);
});

test('gestos: só arrasto horizontal, longo e rápido conta', () => {
  assert.equal(direcaoDoGesto({ dx: -120, dy: 10, dt: 250 }), 1); // para a esquerda → próxima
  assert.equal(direcaoDoGesto({ dx: 120, dy: -15, dt: 250 }), -1); // para a direita → anterior
  assert.equal(direcaoDoGesto({ dx: -40, dy: 0, dt: 200 }), 0); // curto
  assert.equal(direcaoDoGesto({ dx: -120, dy: 100, dt: 250 }), 0); // diagonal (rolagem)
  assert.equal(direcaoDoGesto({ dx: -150, dy: 0, dt: 1200 }), 0); // lento
});

test('histórico: guarda até o teto e, sem espaço, descarta as mais antigas em vez de não salvar', () => {
  const lista = Array.from({ length: 700 }, (_, i) => ({ papel: 'usuario', texto: `m${i}` }));
  let gravado = null;
  assert.equal(salvarLista(lista, (t) => { gravado = JSON.parse(t); }), MAX_MENSAGENS);
  assert.equal(gravado.at(-1).texto, 'm699');

  // "Armazenamento" que só aceita até 100 mensagens.
  const n = salvarLista(lista, (t) => { if (JSON.parse(t).length > 100) throw new Error('QuotaExceeded'); gravado = JSON.parse(t); });
  assert.ok(n > 0 && n <= 100);
  assert.equal(gravado.at(-1).texto, 'm699'); // as mais recentes ficam

  assert.equal(salvarLista(lista, () => { throw new Error('sem armazenamento'); }), 0);
});
