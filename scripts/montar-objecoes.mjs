// Junta os lotes de objeções (data/objecoes/fonte-<secao>/loteNN.json), valida e publica web/data/objecoes.json.
// Uso: node scripts/montar-objecoes.mjs [sN]   (sN só filtra os avisos mostrados; o site recebe todas as seções)
// Cada item do lote: {"c":1,"o":"objeção","r":"resposta curta","e":"explicação","b":["Mt 16,18"],
//                     "bt":[{"ref":"Mt 16,18","t":"texto"}],"cic":["881-882"],"a":"analogia"}
// O texto bíblico ("bt") só é aceito se estiver transcrito no Catecismo: é procurado no texto do vatican.va
// e, achado, é trocado pelo trecho exato do Catecismo (com o § de onde veio); se não, é descartado.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grafiaBR } from './grafia-br.mjs';

export const SECOES = {
  s1: { parte: 1, titulo: 'A Revelação, a Bíblia e a fé', faixa: [26, 184], temas: {
    1: 'Deus, fé e razão', 2: 'Revelação, Tradição e Magistério', 3: 'A Bíblia', 4: 'A fé' } },
  s2: { parte: 1, titulo: 'O Credo', faixa: [185, 1065], temas: {
    1: 'Deus e a Trindade', 2: 'Criação, mal e pecado original', 3: 'Jesus Cristo', 4: 'Maria',
    5: 'A Igreja e o Papa', 6: 'Santos, purgatório, céu e inferno' } },
  s3: { parte: 2, titulo: 'A liturgia', faixa: [1066, 1209], temas: {
    1: 'Liturgia e sacramentos', 2: 'Tempos e lugares de culto' } },
  s4: { parte: 2, titulo: 'Os sete sacramentos', faixa: [1210, 1690], temas: {
    1: 'Batismo e Crisma', 2: 'Eucaristia e Missa', 3: 'Confissão e indulgências', 4: 'Unção, Ordem e celibato',
    5: 'Matrimônio e sacramentais' } },
  s5: { parte: 3, titulo: 'A vida no Espírito', faixa: [1691, 2051], temas: {
    1: 'Liberdade e consciência', 2: 'Virtudes e pecado', 3: 'Sociedade e justiça', 4: 'Lei, graça e salvação' } },
  s6: { parte: 3, titulo: 'Os dez mandamentos', faixa: [2052, 2557], temas: {
    1: 'Imagens, idolatria e superstição', 2: 'O nome de Deus e o domingo', 3: 'Família e autoridade',
    4: 'A vida humana', 5: 'Sexualidade e matrimônio', 6: 'Bens, verdade e cobiça' } },
  s7: { parte: 4, titulo: 'A oração', faixa: [2558, 2758], temas: {
    1: 'Intercessão de Maria e dos santos', 2: 'Formas de oração' } },
  s8: { parte: 4, titulo: 'O Pai-Nosso', faixa: [2759, 2865], temas: { 1: 'O Pai-Nosso' } },
};

const LIVROS = new Set(('Gn Ex Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Esd Ne Tb Jt Est 1Mc 2Mc Jó Sl Pr Ecl Ct Sb Eclo ' +
  'Is Jr Lm Br Ez Dn Os Jl Am Ab Jn Mq Na Hab Sf Ag Zc Ml ' +
  'Mt Mc Lc Jo At Rm 1Cor 2Cor Gl Ef Fl Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pd 2Pd 1Jo 2Jo 3Jo Jd Ap').split(' '));
const ALIAS = { Gal: 'Gl', Heb: 'Hb', Jer: 'Jr', Jos: 'Js', Mal: 'Ml', Tit: 'Tt', Fil: 'Fl', Col: 'Cl', Sir: 'Eclo', Apoc: 'Ap',
  '1Pe': '1Pd', '2Pe': '2Pd', '1Co': '1Cor', '2Co': '2Cor', Rom: 'Rm', Gen: 'Gn', Isa: 'Is', Sal: 'Sl', Ps: 'Sl' };
const REF_BIBLICA = /^(\S+) (\d+),(\d+)(-\d+)?((?:\.\d+(?:-\d+)?)*)$/;
const REF_CAPITULO_UNICO = /^(Ab|Fm|2Jo|3Jo|Jd) (\d+)(-\d+)?$/;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const catecismo = JSON.parse(readFileSync(join(raiz, 'web', 'data', 'catecismo.json'), 'utf8'));
const paragrafos = new Set(catecismo.paragrafos.map((p) => p.n));

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const palavras = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => { let c = 0; for (const w of a) if (b.has(w)) c++; return c / (a.size + b.size - c || 1); };

// Índice de trigramas de palavras do Catecismo, guardando onde cada palavra começa e termina no texto original.
const toks = catecismo.paragrafos.map((p) => {
  const lista = [];
  for (const m of p.texto.matchAll(/[\p{L}\p{N}]+/gu)) lista.push({ w: norm(m[0]), i: m.index, f: m.index + m[0].length });
  return lista;
});
const tri = new Map();
toks.forEach((lista, pi) => {
  for (let k = 0; k + 2 < lista.length; k++) {
    const chave = `${lista[k].w} ${lista[k + 1].w} ${lista[k + 2].w}`;
    if (!tri.has(chave)) tri.set(chave, []);
    tri.get(chave).push([pi, k]);
  }
});
// Procura a citação no Catecismo; devolve { t: trecho exato, p: § } ou null.
function acharNoCatecismo(texto) {
  const q = norm(texto).split(' ').filter(Boolean);
  if (q.length < 4) return null;
  const votos = new Map();
  const total = q.length - 2;
  for (let k = 0; k < total; k++) {
    for (const [pi, pos] of tri.get(`${q[k]} ${q[k + 1]} ${q[k + 2]}`) || []) {
      if (!votos.has(pi)) votos.set(pi, { n: 0, pos: [] });
      const v = votos.get(pi); v.n++; v.pos.push(pos);
    }
  }
  let melhor = null;
  for (const [pi, v] of votos) if (!melhor || v.n > melhor.v.n) melhor = { pi, v };
  const cobertura = melhor ? melhor.v.n / total : 0;
  if (cobertura < 0.6) return null;
  const pos = melhor.v.pos.sort((a, b) => a - b);
  const mediana = pos[Math.floor(pos.length / 2)];
  const perto = pos.filter((p) => Math.abs(p - mediana) <= q.length * 1.3);
  const lista = toks[melhor.pi];
  const ini = lista[perto[0]].i, fim = lista[Math.min(perto.at(-1) + 2, lista.length - 1)].f;
  const par = catecismo.paragrafos[melhor.pi];
  // Quase igual: fica o texto da IA (o do vatican.va tem erros de digitação, ex.: § 32); senão, o trecho do Catecismo.
  if (cobertura >= 0.75) return { t: grafiaBR(texto.trim()), p: par.n };
  return { t: par.texto.slice(ini, fim).replace(/\s*\(\d+\)\s*/g, ' ').trim(), p: par.n };
}

const so = process.argv[2];
const erros = [];
const avisos = [];
const itens = [];
for (const [s, cfg] of Object.entries(SECOES)) {
  const pasta = join(raiz, 'data', 'objecoes', `fonte-${s}`);
  if (!existsSync(pasta)) continue;
  for (const arq of readdirSync(pasta).filter((f) => /^lote\d+\.json$/.test(f)).sort()) {
    let lote;
    try { lote = JSON.parse(readFileSync(join(pasta, arq), 'utf8').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')); }
    catch (e) { erros.push(`${s}/${arq}: JSON inválido (${e.message})`); continue; }
    lote.forEach((it, i) => itens.push({ ...it, s, cfg, origem: `${s}/${arq}#${i + 1}` }));
  }
}

const vistos = { o: new Map(), r: new Map(), a: new Map() };
let btAceitos = 0, btDescartados = 0;
for (const it of itens) {
  const onde = it.origem;
  for (const k of ['c', 'o', 'r', 'e', 'b', 'cic', 'a']) if (it[k] === undefined) erros.push(`${onde}: falta o campo ${k}`);
  if (!it.cfg.temas[it.c]) erros.push(`${onde}: tema inválido ${it.c}`);
  for (const k of ['o', 'r', 'e', 'a']) {
    it[k] = grafiaBR(String(it[k] || '').replace(/\s*\[\d+(?:[,-]\s*\d+)*\]/g, '').replace(/\s*\((?:CIC|§)[^)]*\)/g, '').trim());
    if (/\b(?:CIC|§)\s*\d/.test(it[k])) avisos.push(`${onde}: número de parágrafo no texto (${k})`);
  }
  for (const k of ['o', 'r', 'a']) {
    const n = norm(it[k]);
    if (vistos[k].has(n)) erros.push(`${onde}: campo ${k} idêntico a ${vistos[k].get(n)}`);
    else vistos[k].set(n, onde);
  }
  it.b = (it.b || []).map((ref) => ref.trim().replace(/^(\S+)(?= )/, (l) => ALIAS[l] || l));
  if (!it.b.length) erros.push(`${onde}: sem referência bíblica`);
  for (const ref of it.b) {
    const m = REF_BIBLICA.exec(ref) || REF_CAPITULO_UNICO.exec(ref);
    if (!m) erros.push(`${onde}: referência bíblica fora do formato: ${ref}`);
    else if (!LIVROS.has(m[1])) erros.push(`${onde}: livro bíblico desconhecido: ${ref}`);
  }
  it.bt = (it.bt || []).flatMap((x) => {
    const achado = x && x.t ? acharNoCatecismo(x.t) : null;
    if (!achado) { btDescartados++; return []; }
    btAceitos++;
    return [{ ref: (x.ref || '').trim().replace(/^(\S+)(?= )/, (l) => ALIAS[l] || l), t: achado.t, p: achado.p }];
  });
  if (!it.cic?.length) erros.push(`${onde}: sem referência ao Catecismo`);
  it.faixas = [];
  for (const ref of it.cic || []) {
    const m = /^(?:CIC\s*)?(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(String(ref).trim());
    if (!m) { erros.push(`${onde}: referência CIC inválida: ${ref}`); continue; }
    const ini = +m[1], fim = +(m[2] || m[1]);
    if (fim - ini > 15) avisos.push(`${onde}: faixa larga no CIC (${ref})`);
    let ok = true;
    for (let n = ini; n <= fim; n++) if (!paragrafos.has(n)) { erros.push(`${onde}: § ${n} não existe`); ok = false; break; }
    if (ok) it.faixas.push([ini, fim]);
  }
}

// Objeções muito parecidas dentro da mesma seção.
for (let i = 0; i < itens.length; i++) itens[i].saco = palavras(itens[i].o);
for (let i = 0; i < itens.length; i++)
  for (let j = i + 1; j < itens.length; j++) {
    if (itens[i].s !== itens[j].s) continue;
    const sim = jaccard(itens[i].saco, itens[j].saco);
    if (sim >= 0.55) avisos.push(`parecidas (${sim.toFixed(2)}): ${itens[i].origem} "${itens[i].o}" × ${itens[j].origem} "${itens[j].o}"`);
  }

const porSecao = {};
for (const it of itens) porSecao[it.s] = (porSecao[it.s] || 0) + 1;
console.log(`Objeções: ${itens.length}`, porSecao, `| textos bíblicos aceitos ${btAceitos}, descartados ${btDescartados}`);
avisos.filter((a) => !so || a.includes(`${so}/`)).forEach((a) => console.log('AVISO', a));
erros.forEach((e) => console.log('ERRO ', e));
if (erros.length) { console.log(`\n${erros.length} erro(s); nada publicado.`); process.exit(1); }

const contador = {};
const objecoes = itens.map((it) => {
  contador[it.s] = (contador[it.s] || 0) + 1;
  const o = { id: `O-${it.s.slice(1)}-${String(contador[it.s]).padStart(3, '0')}`, s: it.s, c: it.c, o: it.o, r: it.r, e: it.e, a: it.a, b: it.b, cic: it.faixas };
  if (it.bt.length) o.bt = it.bt;
  return o;
});
const secoes = Object.entries(SECOES).filter(([s]) => porSecao[s]).map(([id, s]) => ({
  id, parte: s.parte, titulo: s.titulo, ini: s.faixa[0], fim: s.faixa[1],
  temas: Object.entries(s.temas).map(([c, titulo]) => ({ c: Number(c), titulo })),
}));
const destino = join(raiz, 'web', 'data', 'objecoes.json');
writeFileSync(destino, JSON.stringify({ secoes, objecoes }) + '\n', 'utf8');
console.log(`Publicado ${destino}: ${secoes.length} seção(ões), ${objecoes.length} objeções.`);
