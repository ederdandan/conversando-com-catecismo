// Modo sem IA: responde com a pergunta mais parecida do Compêndio do Catecismo (598 perguntas e respostas
// oficiais), mostrando os parágrafos do Catecismo indicados pelo próprio Compêndio.
import { buscar, criarIndice, expandirPergunta, normalizar, radical, termos } from './busca.js';
import { esc } from './html.js';

const RELATIVO_MINIMO = 0.75; // 2ª sugestão só se estiver perto da 1ª
const SCORE_MINIMO = 3; // abaixo disso a semelhança é casual ("capital da França")

let carregando = null;
export function carregarCompendio(url = 'data/compendio.json') {
  carregando ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).catch((e) => { carregando = null; throw e; });
  return carregando;
}

// Perguntas como "Quais são os efeitos deste sacramento?" dependem da anterior; herdam o texto dela.
const DEPENDE = /\b(dest[ea]s?|nest[ea]s?|ess[ea]s?|dess[ea]s?|nele|nela)\b/;

export function criarIndiceCompendio(dados) {
  const itens = dados.itens;
  const docs = itens.map((x, i) => {
    const contexto = DEPENDE.test(normalizar(x.pergunta)) && i > 0 ? itens[i - 1].pergunta : '';
    // A pergunta pesa o dobro da resposta.
    return { n: x.n, texto: `${x.pergunta} ${x.pergunta} ${contexto} ${x.resposta}` };
  });
  const indice = criarIndice(docs);
  indice.itens = itens;
  indice.perguntasNorm = itens.map((x) => normalizar(x.pergunta).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim());
  return indice;
}

const limparQ = (s) => normalizar(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Fração (ponderada pela raridade) dos termos da pergunta que aparecem no item.
// Evita respostas por coincidência de uma palavra só ("capital da França" → "pecados capitais").
function cobertura(indice, qs, iDoc) {
  let total = 0;
  let achado = 0;
  for (const q of qs) {
    const l = indice.postings.get(q);
    const idf = Math.log(1 + (indice.N - (l?.length || 0) + 0.5) / ((l?.length || 0) + 0.5));
    total += idf;
    if (l?.some(([i]) => i === iDoc)) achado += idf;
  }
  return total ? achado / total : 0;
}
const COBERTURA_MINIMA = 0.5;
// Palavras de pergunta que não dizem o assunto.
const INTERROGATIVAS = new Set(['quem', 'significa', 'significam', 'consiste', 'existe', 'acontece', 'pode', 'deve'].map(radical));

// Termos que medem a cobertura: os da pergunta, menos interrogativas; uma palavra que o Compêndio
// não usa mas que tem sinônimo (amém → ámen) é representada pelo sinônimo.
function termosCobertura(indice, pergunta) {
  const orig = [...new Set(termos(pergunta))].filter((t) => !INTERROGATIVAS.has(t));
  const extras = [...new Set(termos(expandirPergunta(pergunta)))].filter((t) => !orig.includes(t) && !INTERROGATIVAS.has(t));
  if (!extras.length) return orig;
  return [...orig.filter((t) => indice.postings.has(t)), ...extras];
}

// "O que é a graça?" → "graca"; casa com "O que é a graça que justifica?".
const RE_DEF = /^(?:o )?que (?:e|sao|significa|significam) (?:(?:o|a|os|as) )?(.+)$/;

// Até `limite` itens do Compêndio que respondem à pergunta; [] se nada for parecido o bastante.
export function responderPeloCompendio(indice, pergunta, { limite = 2 } = {}) {
  const q = limparQ(pergunta);
  if (!q) return [];
  const qs = termosCobertura(indice, pergunta);
  const exata = indice.perguntasNorm.findIndex((p) => p === q);
  const def = q.match(RE_DEF)?.[1];
  const definicoes = def && def.split(' ').length <= 4
    ? indice.perguntasNorm.flatMap((p, i) => (p.match(RE_DEF)?.[1].startsWith(def) ? [i] : []))
    : [];
  const res = buscar(indice, expandirPergunta(pergunta), 10)
    .map((r) => ({ ...r, cob: cobertura(indice, qs, r.n - 1) }))
    .filter((r) => r.score >= SCORE_MINIMO && r.cob >= COBERTURA_MINIMA);
  const melhor = res[0]?.score || 1;
  const ns = [
    ...(exata >= 0 ? [exata + 1] : []),
    ...definicoes.map((i) => i + 1),
    ...res.filter((r) => r.score / melhor >= RELATIVO_MINIMO).map((r) => r.n),
  ];
  return [...new Set(ns)].slice(0, limite).map((n) => indice.itens[n - 1]);
}

// [1030, 1031, 1054] → [[1030, 1031], [1054, 1054]]
export function agruparRefs(refs) {
  const grupos = [];
  for (const n of refs) {
    const g = grupos.at(-1);
    if (g && n === g[1] + 1) g[1] = n;
    else grupos.push([n, n]);
  }
  return grupos;
}

const htmlRefs = (refs) => agruparRefs(refs).map(([a, b]) =>
  `<button type="button" class="cita fonte" data-n="${a}">§ ${a}${b > a ? `–${b}` : ''}</button>`).join('');

export function htmlItemCompendio(x) {
  return `<p class="comp-pergunta"><span class="comp-n">Compêndio, ${x.n}</span> ${esc(x.pergunta)}</p>
    ${x.resposta.split('\n').map((t) => `<p>${esc(t)}</p>`).join('')}`;
}

// Mensagem do chat no modo sem IA.
export function htmlRespostaCompendio(m) {
  const [primeiro, ...outros] = m.itens || [];
  const aviso = `<p class="nota-sistema comp-aviso">${esc(m.motivo || 'O catequista (IA) está indisponível agora.')}
    Enquanto isso, veja a resposta oficial do <strong>Compêndio do Catecismo</strong>:</p>`;
  if (!primeiro) {
    return `<div class="balao"><p class="nota-sistema">${esc(m.motivo || 'O catequista (IA) está indisponível agora.')}</p>
      <p>Não encontrei no Compêndio do Catecismo uma pergunta parecida com a sua. Tente com outras palavras ou pesquise no Catecismo.</p></div>`;
  }
  const extras = outros.map((x) => `<details class="comp-outro"><summary>Veja também: ${esc(x.pergunta)}</summary>
      ${htmlItemCompendio(x)}<div class="fontes-lista">${htmlRefs(x.refs)}</div></details>`).join('');
  return `<div class="balao">${aviso}${htmlItemCompendio(primeiro)}${extras}</div>
    <div class="fontes"><span class="rotulo">No Catecismo · toque para ler</span>
      <div class="fontes-lista">${htmlRefs(primeiro.refs)}</div></div>`;
}
