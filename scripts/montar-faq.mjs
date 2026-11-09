// Junta os lotes de data/fonte-<secao>/loteNN.json no arquivo final da FAQ e valida o conteúdo.
// Uso: node scripts/montar-faq.mjs s1   (Parte I, Seção 1)
//      node scripts/montar-faq.mjs s2   (Parte I, Seção 2)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECOES = {
  s1: {
    prefixoId: 'P1-S1',
    saida: 'faq-parte1-secao1.json',
    faixa: [26, 184],
    secao: "Seção 1: 'Eu creio' – 'Nós cremos'",
    titulo: "Perguntas Frequentes – Parte I, Seção 1: 'Eu creio' – 'Nós cremos'",
    descricao: 'Dúvidas de católicos sobre a Primeira Seção da Primeira Parte do Catecismo da Igreja Católica (§ 26–184): a busca de Deus, a Revelação, a Tradição, a Sagrada Escritura e a resposta da fé. Cada resposta cita os parágrafos do Catecismo e passagens bíblicas, com uma analogia para facilitar a compreensão.',
    categorias: {
      1: { titulo: "Capítulo 1: O homem é 'capaz' de Deus", faixa: '§ 26–49' },
      2: { titulo: 'Capítulo 2, Artigo 1: A Revelação de Deus', faixa: '§ 50–73' },
      3: { titulo: 'Capítulo 2, Artigo 2: A transmissão da Revelação divina', faixa: '§ 74–100' },
      4: { titulo: 'Capítulo 2, Artigo 3: A Sagrada Escritura', faixa: '§ 101–141' },
      5: { titulo: "Capítulo 3, Artigo 1: 'Eu creio'", faixa: '§ 142–165' },
      6: { titulo: "Capítulo 3, Artigo 2: 'Nós cremos'", faixa: '§ 166–184' },
    },
  },
  s2: {
    prefixoId: 'P1-S2',
    saida: 'faq-parte1-secao2.json',
    faixa: [185, 1065],
    secao: 'Seção 2: A profissão da fé cristã',
    titulo: 'Perguntas Frequentes – Parte I, Seção 2: A profissão da fé cristã (o Credo)',
    descricao: 'Dúvidas de católicos sobre a Segunda Seção da Primeira Parte do Catecismo da Igreja Católica (§ 185–1065): os artigos do Credo sobre Deus Pai e a criação, Jesus Cristo, o Espírito Santo, a Igreja e a vida eterna. Cada resposta cita os parágrafos do Catecismo e passagens bíblicas, com uma analogia para facilitar a compreensão.',
    categorias: {
      1: { titulo: 'O Credo e Capítulo 1: Creio em Deus Pai', faixa: '§ 185–421' },
      2: { titulo: 'Capítulo 2: Creio em Jesus Cristo, Filho único de Deus', faixa: '§ 422–682' },
      3: { titulo: 'Capítulo 3, Artigo 8: Creio no Espírito Santo', faixa: '§ 683–747' },
      4: { titulo: 'Capítulo 3, Artigo 9: Creio na santa Igreja católica', faixa: '§ 748–975' },
      5: { titulo: 'Capítulo 3, Artigos 10 a 12: Perdão dos pecados, ressurreição e vida eterna', faixa: '§ 976–1065' },
    },
  },
};

const chave = process.argv[2];
const cfg = SECOES[chave];
if (!cfg) { console.log('Uso: node scripts/montar-faq.mjs s1|s2'); process.exit(1); }

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaLotes = join(raiz, 'data', `fonte-${chave}`);
const saida = join(raiz, 'data', cfg.saida);
if (!existsSync(pastaLotes)) { console.log(`Pasta ${pastaLotes} não existe.`); process.exit(1); }
const catecismo = JSON.parse(readFileSync(join(raiz, 'web', 'data', 'catecismo.json'), 'utf8'));
const paragrafos = new Set(catecismo.paragrafos.map((p) => p.n));

// Abreviações bíblicas aceitas (padrão brasileiro) e variações que as IAs costumam usar.
const LIVROS = new Set(('Gn Ex Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Esd Ne Tb Jt Est 1Mc 2Mc Jó Sl Pr Ecl Ct Sb Eclo ' +
  'Is Jr Lm Br Ez Dn Os Jl Am Ab Jn Mq Na Hab Sf Ag Zc Ml ' +
  'Mt Mc Lc Jo At Rm 1Cor 2Cor Gl Ef Fl Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pd 2Pd 1Jo 2Jo 3Jo Jd Ap').split(' '));
const ALIAS = { Gal: 'Gl', Heb: 'Hb', Jer: 'Jr', Jos: 'Js', Mal: 'Ml', Esdr: 'Esd', Jude: 'Jd', Act: 'At', Fil: 'Fl', Col: 'Cl',
  Ecle: 'Ecl', Sir: 'Eclo', Apoc: 'Ap', Job: 'Jó', '1Pe': '1Pd', '2Pe': '2Pd', '1Co': '1Cor', '2Co': '2Cor' };
const REF_BIBLICA = /^(\S+) (\d+),(\d+)(-\d+)?$/;
const REF_CAPITULO_UNICO = /^(Ab|Fm|2Jo|3Jo|Jd) (\d+)(-\d+)?$/;

const erros = [];
const avisos = [];
const itens = [];
for (const arq of readdirSync(pastaLotes).filter((f) => /^lote\d+\.json$/.test(f)).sort()) {
  let lote;
  // Tolera o bloco ```json que o NotebookLM às vezes coloca em volta do array.
  try { lote = JSON.parse(readFileSync(join(pastaLotes, arq), 'utf8').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')); }
  catch (e) { erros.push(`${arq}: JSON inválido (${e.message})`); continue; }
  lote.forEach((it, i) => itens.push({ ...it, origem: `${arq}#${i + 1}` }));
}

const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const palavras = (s) => new Set(normalizar(s).split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => { let c = 0; for (const w of a) if (b.has(w)) c++; return c / (a.size + b.size - c || 1); };

const vistos = { p: new Map(), r: new Map(), a: new Map() };
for (const it of itens) {
  const onde = it.origem;
  for (const k of ['c', 'p', 'r', 'b', 'cic', 'a']) if (it[k] === undefined) erros.push(`${onde}: falta o campo ${k}`);
  if (!cfg.categorias[it.c]) erros.push(`${onde}: categoria inválida ${it.c}`);
  // Remove números de parágrafo que a IA às vezes coloca dentro da pergunta: "... (CIC 95, 113)?"
  it.p = (it.p || '').replace(/\s*\((?:CIC|§)[^)]*\)/g, '').replace(/\s+\?$/, '?').trim();
  if (!/\?$/.test(it.p)) erros.push(`${onde}: pergunta sem '?'`);
  for (const [campo, nome] of [['p', 'pergunta'], ['r', 'resposta'], ['a', 'analogia']]) {
    const n = normalizar(it[campo] || '');
    if (vistos[campo].has(n)) erros.push(`${onde}: ${nome} idêntica a ${vistos[campo].get(n)}`);
    else vistos[campo].set(n, onde);
  }
  if (/aptism|\[\d+\]/.test(`${it.p} ${it.r} ${it.a}`)) avisos.push(`${onde}: grafia de Portugal ("baptism...") ou marca de citação [n] no texto`);
  it.b = (it.b || []).map((ref) => ref.trim().replace(/^(\S+)(?= )/, (l) => ALIAS[l] || l));
  if (!it.b.length) erros.push(`${onde}: sem referência bíblica`);
  for (const ref of it.b) {
    const m = REF_BIBLICA.exec(ref) || REF_CAPITULO_UNICO.exec(ref);
    if (!m) erros.push(`${onde}: referência bíblica fora do formato "Livro cap,vers": ${ref}`);
    else if (!LIVROS.has(m[1])) erros.push(`${onde}: livro bíblico desconhecido: ${ref}`);
  }
  if (!it.cic?.length) erros.push(`${onde}: sem referência ao Catecismo`);
  for (const ref of it.cic || []) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(String(ref).trim());
    if (!m) { erros.push(`${onde}: referência CIC inválida: ${ref}`); continue; }
    const ini = +m[1], fim = +(m[2] || m[1]);
    if (fim - ini > 15) avisos.push(`${onde}: faixa larga demais no CIC (${ref})`);
    for (let n = ini; n <= fim; n++) if (!paragrafos.has(n)) erros.push(`${onde}: § ${n} não existe`);
    if (ini < cfg.faixa[0] || fim > cfg.faixa[1]) avisos.push(`${onde}: cita § ${ref}, fora da seção (${cfg.faixa.join('–')})`);
  }
}

// Perguntas muito parecidas (possível duplicidade de sentido).
const sacos = itens.map((it) => palavras(it.p));
for (let i = 0; i < itens.length; i++)
  for (let j = i + 1; j < itens.length; j++) {
    const s = jaccard(sacos[i], sacos[j]);
    if (s >= 0.6) avisos.push(`perguntas parecidas (${s.toFixed(2)}): ${itens[i].origem} "${itens[i].p}" × ${itens[j].origem} "${itens[j].p}"`);
  }

const contagem = {};
for (const it of itens) contagem[it.c] = (contagem[it.c] || 0) + 1;

const perguntas = itens.map((it, i) => ({
  id: `${cfg.prefixoId}-Q${String(i + 1).padStart(itens.length > 999 ? 4 : 3, '0')}`,
  categoria: `${cfg.secao} (${cfg.categorias[it.c]?.titulo})`,
  pergunta: it.p,
  resposta_texto: it.r,
  referencias: { biblia: it.b, cic: (it.cic || []).map((n) => `CIC ${n}`) },
  analogias: [it.a],
}));

const doc = {
  titulo: cfg.titulo,
  descricao: cfg.descricao,
  fonte: 'Catecismo da Igreja Católica (texto integral em vatican.va)',
  total_perguntas: perguntas.length,
  categorias: Object.entries(cfg.categorias).map(([k, v]) => ({ categoria: `${cfg.secao} (${v.titulo})`, paragrafos: v.faixa, quantidade: contagem[k] || 0 })),
  partes: [{ parte: 'Parte I: A Profissão da Fé', secao: cfg.secao, quantidade: perguntas.length, perguntas }],
};

console.log(`Itens: ${itens.length} | por categoria:`, contagem);
avisos.forEach((a) => console.log('AVISO', a));
erros.forEach((e) => console.log('ERRO ', e));
if (erros.length) { console.log(`\n${erros.length} erro(s); arquivo NÃO gerado.`); process.exit(1); }
writeFileSync(saida, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`\nGerado ${saida} com ${perguntas.length} perguntas. ${avisos.length} aviso(s).`);
publicarNoSite();

// Versão enxuta para o site (web/data/faq.json), com todas as seções que já têm arquivo final.
// Formato: { secoes: [{ id, parte, titulo, ini, fim, temas: [{ c, titulo, faixa }] }],
//            perguntas: [{ id, s, c, p, r, a, b: [...], cic: [[ini, fim], ...] }] }
function publicarNoSite() {
  const secoes = [];
  const lista = [];
  for (const [id, s] of Object.entries(SECOES)) {
    const arq = join(raiz, 'data', s.saida);
    if (!existsSync(arq)) continue;
    const final = JSON.parse(readFileSync(arq, 'utf8'));
    const cDoTitulo = new Map(Object.entries(s.categorias).map(([c, v]) => [`${s.secao} (${v.titulo})`, Number(c)]));
    secoes.push({
      id, parte: 1, titulo: s.secao, ini: s.faixa[0], fim: s.faixa[1],
      temas: Object.entries(s.categorias).map(([c, v]) => ({ c: Number(c), titulo: v.titulo, faixa: v.faixa })),
    });
    for (const q of final.partes[0].perguntas) {
      lista.push({
        id: q.id, s: id, c: cDoTitulo.get(q.categoria), p: q.pergunta, r: q.resposta_texto, a: q.analogias[0],
        b: q.referencias.biblia,
        cic: q.referencias.cic.map((t) => { const [a, b] = t.replace('CIC ', '').split('-').map(Number); return [a, b || a]; }),
      });
    }
  }
  const destino = join(raiz, 'web', 'data', 'faq.json');
  writeFileSync(destino, JSON.stringify({ secoes, perguntas: lista }) + '\n', 'utf8');
  console.log(`Publicado ${destino}: ${secoes.length} seção(ões), ${lista.length} perguntas.`);
}
