import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlCapitulo, htmlSumario, htmlParagrafo, htmlNota } from '../web/js/leitor.js';

const bruto = JSON.parse(fs.readFileSync(new URL('../web/data/catecismo.json', import.meta.url), 'utf8'));

// Mesmo preparo de web/js/dados.js, sem fetch.
const porN = new Map(bruto.paragrafos.map((p) => [p.n, p]));
const capitulos = [];
for (const p of bruto.paragrafos) {
  const ult = capitulos.at(-1);
  if (ult && ult.parte === p.parte && ult.capitulo === p.capitulo) { ult.fim = p.n; continue; }
  const parte = bruto.partes.find((x) => x.numero === p.parte);
  capitulos.push({ indice: capitulos.length, parte: p.parte, capitulo: p.capitulo, tituloParte: parte.titulo, titulo: parte.capitulos[p.capitulo], ini: p.n, fim: p.n });
}
const d = { ...bruto, porN, capitulos };

test('capítulos cobrem 1..2865 sem buracos', () => {
  assert.equal(capitulos[0].ini, 1);
  assert.equal(capitulos.at(-1).fim, 2865);
  for (let i = 1; i < capitulos.length; i++) assert.equal(capitulos[i].ini, capitulos[i - 1].fim + 1);
  assert.equal(capitulos.length, 26);
});

test('todos os capítulos renderizam com todos os §', () => {
  for (const c of capitulos) {
    const html = htmlCapitulo(d, c);
    const ids = [...html.matchAll(/id="p(\d+)"/g)].length;
    assert.equal(ids, c.fim - c.ini + 1, `capítulo ${c.indice}`);
  }
});

test('sumário lista os 26 capítulos', () => {
  assert.equal([...htmlSumario(d).matchAll(/<li>/g)].length, 26);
});

test('texto é escapado', () => {
  const html = htmlParagrafo({ n: 1, texto: '<script>x</script> & "a"', titulos: ['<b>t</b>'] });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<b>t</b>'));
});

test('marcadores de nota viram botões e a nota é exibida', () => {
  const p = porN.get(27);
  const html = htmlParagrafo(p);
  assert.match(html, /class="nota-ref"[^>]*data-nota="1"/);
  assert.match(htmlNota(p, '1'), /Gaudium et Spes/);
});

test('sumário em sanfona: abre a parte pedida e marca onde a pessoa parou', async () => {
  const { nomeParte } = await import('../web/js/leitor.js');
  assert.deepEqual(nomeParte(3, 'Terceira Parte — A Vida em Cristo'), { curto: 'A Vida em Cristo', rotulo: '3ª Parte' });
  assert.deepEqual(nomeParte(0, 'Prólogo'), { curto: 'Prólogo', rotulo: 'Prólogo' });
  const html = htmlSumario(d, { aberta: 3, ultimo: 1995 });
  assert.equal([...html.matchAll(/<details/g)].length, 5, 'prólogo + 4 partes');
  assert.match(html, /<details class="parte" data-parte="3" open>/);
  assert.equal([...html.matchAll(/ open>/g)].length, 1, 'só uma parte aberta');
  assert.match(html, /href="#\/p\/1995" class="atual"/);
  assert.match(html, /Você parou aqui · § 1995/);
});

test('capítulo tem cabeçalho com voltar, progresso e barra de leitura', () => {
  const cap = capitulos.find((c) => c.ini <= 1849 && c.fim >= 1849);
  const html = htmlCapitulo(d, cap, { comIA: true });
  assert.match(html, /href="#\/sumario\/3" aria-label="Voltar ao sumário"/);
  assert.match(html, /<small>3ª Parte · A Vida em Cristo<\/small>/);
  assert.match(html, /class="progresso"/);
  assert.match(html, /data-perguntar/);
  assert.match(html, /aria-label="Próximo capítulo: /);
});

test('sem IA, a barra de leitura não oferece "Perguntar sobre este trecho" (leva ao sumário)', () => {
  const cap = d.capitulos[10];
  const html = htmlCapitulo(d, cap);
  assert.doesNotMatch(html, /data-perguntar|Perguntar sobre este trecho/);
  assert.match(html, new RegExp(`class="perguntar" href="#/sumario/${cap.parte}"`));
});
