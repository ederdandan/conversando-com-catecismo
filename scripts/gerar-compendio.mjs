// Gera web/data/compendio.json a partir do Compêndio do Catecismo da Igreja Católica (vatican.va, português).
//
// Fonte: https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_po.html
// Cada item do Compêndio é "N. Pergunta?", seguido dos parágrafos do Catecismo e da resposta oficial.
// Serve de modo sem IA: quando o chat não está disponível, o app mostra a resposta oficial mais próxima.
//
// Uso:  node scripts/gerar-compendio.mjs [--sem-cache]
// A página baixada fica em .cache/compendio/ (ignorado pelo git).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, '.cache', 'compendio', 'po.html');
const SAIDA = path.join(RAIZ, 'web', 'data', 'compendio.json');
const URL_FONTE = 'https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_po.html';
const TOTAL = 598;
const MAX_CIC = 2865;

async function baixar() {
  if (!process.argv.includes('--sem-cache') && fs.existsSync(CACHE)) return fs.readFileSync(CACHE);
  const r = await fetch(URL_FONTE, { headers: { 'User-Agent': 'conversando-com-catecismo/1.0 (gerador de dados)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${URL_FONTE}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, buf);
  return buf;
}

// ---------- HTML -> texto ----------
const ENT = { nbsp: ' ', shy: '', quot: '"', amp: '&', gt: '>', lt: '<', apos: "'", laquo: '«', raquo: '»',
  sect: '§', ordf: 'ª', ordm: 'º', deg: '°', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', szlig: 'ß', copy: '©', aelig: 'æ', AElig: 'Æ' };
const ACENTO = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', cedil: '̧', uml: '̈', ring: '̊' };
const desconhecidas = new Set();

function decodificar(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => {
      if (nome in ENT) return ENT[nome];
      const k = nome.slice(1);
      if (k in ACENTO) return (nome[0] + ACENTO[k]).normalize('NFC');
      desconhecidas.add(m);
      return m;
    });
}
const limpar = (html) => decodificar(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
  .replace(/[\s ]+/g, ' ').trim();

// Erros de digitação da página em português, conferidos com as outras edições oficiais do Compêndio.
const CORRECOES = { '362-356': '362-365', '15120-1523': '1520-1523', '1655-1558': '1655-1658', '1928-133': '1928-1933', '2746-275;': '2746-2751;' };

// "1030 – 1031 1054" / "1033–1035. 1056–1057" / "27-30 44-45" → [1030, 1031, 1054, 1033, 1034, ...]
export function expandirRefs(texto) {
  let t = texto.replace(/[–—‑-]/g, '-').replace(/\s*-\s*/g, '-');
  for (const [errado, certo] of Object.entries(CORRECOES)) t = t.replace(errado, certo);
  const nums = [];
  for (const m of t.matchAll(/(\d{1,4})(?:-(\d{1,4}))?/g)) {
    const a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    // Forma abreviada: "142-43" = 142–143.
    if (b < a && m[2].length < m[1].length) b = Number(m[1].slice(0, m[1].length - m[2].length) + m[2]);
    if (b < a || b - a > 200) throw new Error(`intervalo estranho: "${texto}"`);
    for (let n = a; n <= b; n++) nums.push(n);
  }
  return [...new Set(nums)].sort((x, y) => x - y);
}
const ehRefs = (t) => /^[\d\s.,;:–—‑-]+$/.test(t) && /\d/.test(t);

// ---------- análise ----------
function analisar(html) {
  // Citações de santos (blockquote) e títulos centralizados não fazem parte das respostas.
  // Exceção: no item 598 a resposta é a própria citação (S. Cirilo), logo após as referências.
  const semCitacoes = html.replace(/<blockquote[\s\S]*?<\/blockquote>/gi,
    (bq) => `<p data-citacao>${bq.replace(/<\/?(?:p|blockquote)[^>]*>/gi, ' ')}</p><p align="center"></p>`);
  const blocos = semCitacoes.split(/(?=<p[\s>])/i).slice(1);
  const itens = [];
  let atual = null;
  for (const b of blocos) {
    if (b.startsWith('<p data-citacao>')) {
      if (atual && atual.refs.length && !atual.resposta.length) atual.resposta.push(limpar(b));
      continue;
    }
    const centro = /^<p[^>]*align\s*=\s*"?center/i.test(b);
    const texto = limpar(b);
    const q = !centro && /^<p[^>]*>\s*(?:<[^>]+>\s*)*<b>/i.test(b) && texto.match(/^(\d{1,3})\.\s+(.+)$/);
    if (q) {
      atual = { n: Number(q[1]), pergunta: q[2].trim(), refs: [], resposta: [] };
      itens.push(atual);
      continue;
    }
    if (!atual || !texto) continue;
    if (centro) { atual = null; continue; } // começou outra seção
    if (!atual.resposta.length && !atual.refs.length && ehRefs(texto)) { atual.refs = expandirRefs(texto); continue; }
    atual.resposta.push(texto);
  }
  return itens.map((x) => {
    let resposta = x.resposta.join('\n');
    let { refs } = x;
    // Em poucos itens as referências vêm no fim da resposta: "… ação de graças. ( 2637-2638; 2648 )"
    const fim = !refs.length && resposta.match(/\s*\(\s*([\d\s.,;:–—‑-]+)\)\s*$/);
    if (fim) { refs = expandirRefs(fim[1]); resposta = resposta.slice(0, fim.index).trim(); }
    return { n: x.n, pergunta: x.pergunta, resposta, refs };
  });
}

// ---------- validação ----------
function validar(itens) {
  const erros = [];
  if (itens.length !== TOTAL) erros.push(`esperava ${TOTAL} itens, achei ${itens.length}`);
  itens.forEach((x, i) => {
    if (x.n !== i + 1) erros.push(`fora de ordem: posição ${i + 1} tem n=${x.n}`);
    if (!x.resposta || x.resposta.length < 20) erros.push(`${x.n}: resposta vazia/curta`);
    if (!x.refs.length) erros.push(`${x.n}: sem parágrafos do Catecismo`);
    if (x.refs.some((r) => r < 1 || r > MAX_CIC)) erros.push(`${x.n}: referência fora de 1–${MAX_CIC}`);
    if (/&[a-z]+;|<|>/i.test(x.pergunta + x.resposta)) erros.push(`${x.n}: sobrou HTML`);
  });
  if (desconhecidas.size) erros.push(`entidades desconhecidas: ${[...desconhecidas].join(' ')}`);
  return erros;
}

const html = new TextDecoder('latin1').decode(await baixar());
const itens = analisar(html);
const erros = validar(itens);
if (erros.length) {
  console.error(erros.slice(0, 40).join('\n'));
  process.exit(1);
}
fs.writeFileSync(SAIDA, JSON.stringify({ fonte: URL_FONTE, total: itens.length, itens }));
console.log(`ok: ${itens.length} perguntas → ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)`);
