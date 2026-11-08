// Gera web/data/catecismo.json a partir do texto oficial do vatican.va (edição em português).
//
// Fonte principal: https://www.vatican.va/archive/cathechism_po/index_new/prima-pagina-cic_po.html
// Verificação cruzada: github.com/ntwkst/catecismo-da-igreja-catolica (catecismo.json),
// usado também para os títulos dos capítulos.
//
// Uso:  node scripts/gerar-catecismo.mjs [--sem-cache]
// As páginas baixadas ficam em .cache/vatican/ (ignorado pelo git).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, '.cache', 'vatican');
const SAIDA = path.join(RAIZ, 'web', 'data', 'catecismo.json');
const BASE = 'https://www.vatican.va/archive/cathechism_po/index_new/';
const INDICE = 'prima-pagina-cic_po.html';
const REPO_JSON = 'https://raw.githubusercontent.com/ntwkst/catecismo-da-igreja-catolica/main/catecismo.json';
const TOTAL = 2865;
const semCache = process.argv.includes('--sem-cache');

// ---------- download com cache ----------
async function baixar(url, arquivo, encoding = 'latin1') {
  const destino = path.join(CACHE, arquivo);
  if (!semCache && fs.existsSync(destino)) return new TextDecoder(encoding).decode(fs.readFileSync(destino));
  const r = await fetch(url, { headers: { 'User-Agent': 'conversando-com-catecismo/1.0 (gerador de dados)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(destino, buf);
  return new TextDecoder(encoding).decode(buf);
}

// ---------- HTML -> texto ----------
const ENT = { nbsp: ' ', shy: '', quot: '"', amp: '&', gt: '>', lt: '<', apos: "'", laquo: '«', raquo: '»',
  sect: '§', ordf: 'ª', ordm: 'º', deg: '°', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', szlig: 'ß' };
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

// Divide o conteúdo em blocos de nível de parágrafo (<p>, <blockquote>, <hr>, texto solto).
function blocos(html) {
  return html
    .split(/(?=<p[\s>])|(?=<blockquote[\s>])|(?=<hr[\s/>])|(?=<\/td>)/i)
    .map((raw) => ({ raw, hr: /^<hr/i.test(raw), centro: /^<p[^>]*align="?center/i.test(raw), texto: limpar(raw) }))
    .filter((b) => b.hr || b.texto);
}

// Marcador de §: número em negrito, com ou sem ponto, às vezes com <i> no meio: <b>45<i>.</i></b>, <b>755 </b>
const MARCA = String.raw`<b>(?:\s|&nbsp;|<\/?i>)*(\d{1,4})(?:\s|&nbsp;|<\/?i>|\.)*<\/b>`;
const RE_MARCA_GLOBAL = new RegExp(MARCA, 'gi');
const RE_MARCA_INICIO = new RegExp(String.raw`^(?:<p[^>]*>)?\s*` + MARCA, 'i');
const RE_NOTA = /^(\d{1,4})\s*\.?\s+(.*)$/s;
const SALTO_MAX = 6; // tolerância para § sem marcador detectável (são reportados)

// Um bloco é título quando todo o texto visível está em negrito (ou centralizado) e não começa com número de §.
function ehTitulo(b) {
  if (b.centro) return true;
  const semEspaco = b.raw.replace(/<p[^>]*>|<\/p>|\s|&nbsp;/gi, '');
  return /^(<font[^>]*>)?<b>.*<\/b>(<\/font>)?$/i.test(semEspaco) && !/<\/b>.*<b>/i.test(semEspaco.slice(3, -4));
}

// ---------- parse de uma página ----------
function parsePagina(html, arquivo, ini, fim) {
  html = html.replace(/<head[\s>][\s\S]*?<\/head>/i, '');
  const iConteudo = html.search(/<td width="609"/i);
  // Força um bloco novo antes de cada marcador de § (alguns § vêm soltos, sem <p>, depois de </p> ou </blockquote>).
  const conteudo = (iConteudo >= 0 ? html.slice(iConteudo) : html).replace(RE_MARCA_GLOBAL, (m) => `<p>${m}`);
  const bs = blocos(conteudo);
  const iHr = bs.findLastIndex((b) => b.hr);
  const corpo = iHr >= 0 ? bs.slice(0, iHr) : bs;
  const rodape = iHr >= 0 ? bs.slice(iHr + 1) : [];

  // Notas: blocos "N. texto" depois do último <hr>. Alguns sites quebram uma nota em mais de um bloco.
  const notas = new Map();
  let notaAtual = null;
  for (const b of rodape) {
    if (/^notas$/i.test(b.texto)) continue;
    const m = b.texto.match(RE_NOTA);
    const cur = notaAtual ?? 0;
    let k = m ? Number(m[1]) : NaN;
    if (m && !(k > cur && k - cur <= SALTO_MAX)) {
      const esp = String(cur + 1), achado = String(k);
      const difs = esp.length === achado.length ? [...esp].filter((d, i) => d !== achado[i]).length : 99;
      k = difs === 1 ? cur + 1 : NaN;
    }
    if (!Number.isNaN(k)) { notaAtual = k; notas.set(k, m[2].trim()); }
    else if (notaAtual !== null) notas.set(notaAtual, `${notas.get(notaAtual)} ${b.texto}`.trim());
  }

  const paragrafos = [];
  let atual = null;
  let titulos = [];
  let emResumo = false;
  const saltos = [];
  const correcoes = [];
  for (const b of corpo) {
    if (b.hr) continue;
    const m = b.raw.match(RE_MARCA_INICIO);
    let n = m ? Number(m[1]) : NaN;
    const anterior = atual ? atual.n : ini - 1;
    // Erros de digitação na fonte (ex.: "2117." no lugar de 2217, "1439." no lugar de 2439):
    // aceita como o esperado quando difere em exatamente um dígito.
    if (m && !(n > anterior && n - anterior <= SALTO_MAX)) {
      const esp = String(anterior + 1), achado = String(n);
      const difs = esp.length === achado.length ? [...esp].filter((d, i) => d !== achado[i]).length : 99;
      if (difs === 1) { correcoes.push(`${achado}→${esp}`); n = anterior + 1; }
    }
    // Aceita como novo § só um número logo à frente na sequência (evita confundir com listas numeradas no texto).
    if (m && n > anterior && n - anterior <= SALTO_MAX && n <= fim) {
      for (let k = anterior + 1; k < n; k++) saltos.push(k);
      const resto = limpar(b.raw.slice(m.index + m[0].length).replace(/^\s*\.\s*/, ''));
      atual = { n, titulos, resumo: emResumo, blocos: [resto.replace(/^[.\s]+/, '')] };
      paragrafos.push(atual);
      titulos = [];
      continue;
    }
    if (ehTitulo(b) && !/^\(\d+\)$/.test(b.texto)) {
      const t = b.texto.replace(/:$/, '');
      if (/^resumindo$/i.test(t)) { emResumo = true; continue; }
      emResumo = false;
      titulos.push(t);
      continue;
    }
    if (atual) atual.blocos.push(b.texto);
    // texto antes do primeiro § da página (epígrafes, citações iniciais) vira título/epígrafe
    else titulos.push(b.texto);
  }

  // Associa as notas: marcadores "(N)" no texto.
  for (const p of paragrafos) {
    p.texto = p.blocos.join('\n');
    delete p.blocos;
    const refs = [...p.texto.matchAll(/\((\d{1,3})\)/g)].map((x) => Number(x[1])).filter((x) => notas.has(x));
    p.notas = [...new Set(refs)].map((x) => ({ n: x, texto: notas.get(x) }));
  }
  const ultimo = atual ? atual.n : ini - 1;
  for (let k = ultimo + 1; k <= fim; k++) saltos.push(k);
  return { arquivo, paragrafos, saltos, correcoes, totalNotas: notas.size };
}

// ---------- principal ----------
const indice = await baixar(BASE + INDICE, 'indice.html');
const paginas = [...new Set([...indice.matchAll(/href="([^"#]+?_(\d+)-(\d+)_po\.html)"/gi)].map((m) => m[1]))]
  .map((href) => { const [, a, b] = href.match(/_(\d+)-(\d+)_po\.html$/); return { href, ini: Number(a), fim: Number(b) }; })
  .sort((x, y) => x.ini - y.ini);
// O índice traz o prólogo como "prologo%201-25_po.html" (espaço em vez de "_").
if (!paginas.some((p) => p.ini === 1)) {
  const pr = indice.match(/href="(prologo[^"]*?1-25_po\.html)"/i);
  if (pr) paginas.unshift({ href: pr[1], ini: 1, fim: 25 });
}

const paragrafos = [];
const avisos = [];
for (const pg of paginas) {
  const arquivo = decodeURIComponent(pg.href).replace(/\s+/g, '_');
  const html = await baixar(BASE + pg.href, arquivo);
  const r = parsePagina(html, arquivo, pg.ini, pg.fim);
  if (r.saltos.length) avisos.push(`${arquivo}: sem marcador para § ${r.saltos.join(',')}`);
  if (r.correcoes.length) avisos.push(`${arquivo}: número corrigido (erro na fonte) ${r.correcoes.join(', ')}`);
  const parte = arquivo.startsWith('prologo') ? 0 : Number(arquivo.match(/^p(\d)/)[1]);
  for (const p of r.paragrafos) paragrafos.push({ ...p, parte, pagina: pg.href });
}

// Verificação cruzada e títulos de capítulo com o JSON do repositório ntwkst.
let repo = null;
try { repo = JSON.parse(await baixar(REPO_JSON, 'repo-ntwkst.json', 'utf-8')); }
catch (e) { avisos.push(`Não foi possível baixar o JSON do repo para verificação: ${e.message}`); }

const capituloDe = new Map();
const textoRepo = new Map();
const partes = [];
if (repo) {
  for (const pt of repo.partes) {
    partes.push({ numero: pt.numero, titulo: pt.titulo, capitulos: pt.capitulos.map((c) => c.titulo) });
    pt.capitulos.forEach((c, ic) => {
      // O repo repete alguns § no fim de todo capítulo; vale a primeira ocorrência coerente com a parte.
      const nums = c.paragrafos.map((p) => p.numero);
      const ini = nums[0];
      for (const p of c.paragrafos) {
        if (p.numero < ini) continue;
        if (!capituloDe.has(p.numero)) capituloDe.set(p.numero, { parte: pt.numero, capitulo: ic });
        if (!textoRepo.has(p.numero)) textoRepo.set(p.numero, p.texto);
      }
    });
  }
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
let divergentes = [];
for (const p of paragrafos) {
  const c = capituloDe.get(p.n);
  p.capitulo = c && c.parte === p.parte ? c.capitulo : null;
  const r = textoRepo.get(p.n);
  if (r) {
    const sem = (s) => norm(s.replace(/\(\s*\d+\s*\)/g, ''));
    if (!sem(r).includes(sem(p.texto).slice(0, 40))) divergentes.push(p.n);
  }
}

// § que o repo não posiciona bem (os que ele duplica): herdam o capítulo do vizinho na mesma parte.
paragrafos.forEach((p, i) => {
  if (p.capitulo !== null) return;
  const viz = [paragrafos[i + 1], paragrafos[i - 1]].find((q) => q && q.parte === p.parte && q.capitulo !== null);
  // primeiro § de capítulo (tem títulos próprios) herda do seguinte; os demais, do anterior
  const ant = paragrafos[i - 1], seg = paragrafos[i + 1];
  const escolha = p.titulos.length ? seg : ant;
  p.capitulo = (escolha && escolha.parte === p.parte && escolha.capitulo !== null ? escolha : viz)?.capitulo ?? null;
});

// Validação final
const nums = paragrafos.map((p) => p.n);
const faltam = [];
for (let i = 1; i <= TOTAL; i++) if (!nums.includes(i)) faltam.push(i);
const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
const vazios = paragrafos.filter((p) => p.texto.length < 40).map((p) => p.n);
const semCapitulo = paragrafos.filter((p) => p.capitulo === null).map((p) => p.n);

const saida = {
  titulo: 'Catecismo da Igreja Católica',
  fonte: BASE + INDICE,
  edicao: 'Texto integral em português (vatican.va)',
  geradoEm: new Date().toISOString().slice(0, 10),
  totalParagrafos: paragrafos.length,
  partes,
  paragrafos: paragrafos.map(({ n, parte, capitulo, titulos, resumo, texto, notas }) =>
    ({ n, parte, capitulo, ...(titulos.length ? { titulos } : {}), ...(resumo ? { resumo } : {}), texto, ...(notas.length ? { notas } : {}) })),
};
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(saida));

console.log(`Páginas: ${paginas.length}  Parágrafos: ${paragrafos.length}/${TOTAL}`);
console.log(`Faltando: ${faltam.length ? faltam.join(',') : 'nenhum'}`);
console.log(`Duplicados: ${dup.length ? dup.join(',') : 'nenhum'}`);
console.log(`Muito curtos (<40 chars): ${vazios.length ? vazios.join(',') : 'nenhum'}`);
console.log(`Sem capítulo: ${semCapitulo.length ? semCapitulo.slice(0, 50).join(',') : 'nenhum'}`);
console.log(`Com notas: ${paragrafos.filter((p) => p.notas.length).length}  Resumos: ${paragrafos.filter((p) => p.resumo).length}`);
console.log(`Divergem do repo ntwkst (início do texto): ${divergentes.length} ${divergentes.slice(0, 60).join(',')}`);
if (desconhecidas.size) console.log(`Entidades HTML não tratadas: ${[...desconhecidas].join(' ')}`);
for (const a of avisos) console.log('AVISO:', a);
console.log(`Gerado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)`);
if (faltam.length || dup.length) process.exitCode = 1;
