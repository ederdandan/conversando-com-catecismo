import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extrairCitacoes, avaliarResposta, htmlResposta, MENSAGEM_RECUSA } from '../web/js/citacoes.js';
import { criarIndice, expandirPergunta, selecionarParagrafos, definicoes } from '../web/js/busca.js';

const dados = JSON.parse(fs.readFileSync(new URL('../web/data/catecismo.json', import.meta.url), 'utf8'));
const indice = criarIndice(dados.paragrafos);

test('extrai citações em vários formatos', () => {
  assert.deepEqual(extrairCitacoes('a [§ 1849]. b [§1850] c [§ 1851, 1852] d [§§ 27-29] e [§ 30; § 31]'),
    [1849, 1850, 1851, 1852, 27, 28, 29, 30, 31]);
  assert.deepEqual(extrairCitacoes('sem citação'), []);
});

test('avalia: citações válidas, inválidas, recusa e sem fonte', () => {
  assert.deepEqual(avaliarResposta('X [§ 1849] Y [§ 9]', [1849, 1850]),
    { validas: [1849], invalidas: [9], recusa: false, semFonte: false });
  assert.equal(avaliarResposta(MENSAGEM_RECUSA, [1]).recusa, true);
  assert.equal(avaliarResposta(MENSAGEM_RECUSA, [1]).semFonte, false);
  assert.equal(avaliarResposta('Paris é a capital da França.', [1]).semFonte, true);
  assert.equal(avaliarResposta('Algo [§ 500]', [1]).semFonte, true);
});

test('HTML: escapa, cria botões só para § enviados, negrito e listas', () => {
  const html = htmlResposta('**Pecado** <b>x</b> [§ 1849] e [§ 9]\n\n- um [§ 1850]\n- dois', [1849, 1850]);
  assert.match(html, /<strong>Pecado<\/strong>/);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.match(html, /<button[^>]*class="cita"[^>]*data-n="1849"/);
  assert.match(html, /class="cita invalida"[^>]*>§ 9</);
  assert.match(html, /<ul><li>um <button[^>]*data-n="1850"[^>]*>§ 1850<\/button><\/li><li>dois<\/li><\/ul>/);
});

test('sinônimos do dia a dia viram vocabulário do Catecismo', () => {
  assert.match(expandirPergunta('casamento pode acabar?'), /matrimonio/);
  assert.match(expandirPergunta('Como fazer uma boa confissão?'), /penitencia/);
  assert.match(expandirPergunta('a missa é obrigatória?'), /eucaristia/);
  assert.equal(expandirPergunta('o que é a fé?'), 'o que é a fé?');
});

for (const [pergunta, ini, fim] of [
  ['casamento pode ser desfeito?', 1601, 1666],
  ['como fazer uma boa confissão?', 1422, 1498],
  ['quem é Maria?', 484, 511],
  ['existe inferno?', 1033, 1037],
  ['horóscopo é pecado?', 2110, 2117],
  ['O que é o pecado?', 1846, 1876],
]) {
  test(`seleção para o chat: "${pergunta}" inclui § de ${ini}–${fim}`, () => {
    const { paragrafos } = selecionarParagrafos(indice, pergunta);
    assert.ok(paragrafos.length >= 1 && paragrafos.length <= 12);
    assert.ok(paragrafos.some((n) => n >= ini && n <= fim), paragrafos.join(','));
  });
}

test('seleção: § citado explicitamente vem primeiro', () => {
  assert.equal(selecionarParagrafos(indice, 'explique o § 2558').paragrafos[0], 2558);
});

test('seleção: pergunta de seguimento usa a pergunta anterior', () => {
  const { paragrafos } = selecionarParagrafos(indice, 'e por quê?', { anterior: 'O batismo é necessário para a salvação?' });
  assert.ok(paragrafos.some((n) => n >= 1213 && n <= 1284), paragrafos.join(','));
});

test('seleção: texto sem nenhuma palavra útil não seleciona nada', () => {
  assert.deepEqual(selecionarParagrafos(indice, '???').paragrafos, []);
});

test('colchetes largos do gpt-oss (【§ N】) contam como citação e viram botão', () => {
  assert.deepEqual(extrairCitacoes('Graça 【§ 1996】 e ［§ 2024］.'), [1996, 2024]);
  assert.equal(avaliarResposta('Graça 【§ 1996】.', [1996]).semFonte, false);
  assert.match(htmlResposta('Graça 【§ 1996】.', [1996]), /<button[^>]*data-n="1996"/);
});

test('perguntas de definição trazem primeiro o § que define o termo', () => {
  const indice = criarIndice(dados.paragrafos);
  const primeiros = (q) => selecionarParagrafos(indice, q).paragrafos.slice(0, 3);
  assert.ok(primeiros('O que é o pecado?').includes(1849), 'pecado → §1849');
  assert.ok(primeiros('O que é a graça?').includes(1996), 'graça → §1996');
  assert.equal(primeiros('O que é a oração?')[0], 2559, 'oração → §2559');
  assert.equal(primeiros('o que e a caridade')[0], 1822, 'sem acento e sem interrogação');
  assert.ok(primeiros('O que são os sacramentos?').includes(1131), 'sacramentos → §1131');
  assert.ok(primeiros('O que é o Batismo?').includes(1213), 'grafia BR acha "Baptismo"');
  assert.deepEqual(definicoes(indice, 'Quais são os sacramentos de cura?'), [], 'só vale para "o que é/são/significa"');
});
