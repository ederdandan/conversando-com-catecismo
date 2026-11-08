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
