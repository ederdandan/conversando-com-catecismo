// Modo sem IA: responde com a pergunta mais parecida do Compêndio do Catecismo (598 perguntas e respostas
// oficiais), mostrando os parágrafos do Catecismo indicados pelo próprio Compêndio.
import { buscar, criarIndice, expandirPergunta, normalizar, numerosCitados, radical, termos } from './busca.js';
import { esc } from './html.js';
import { htmlCicFaq, htmlItemFaq } from './faq.js';
import { criarComparador } from './semelhanca.js';

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
  indice.comparador = criarComparador(itens.map((x) => x.pergunta));
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
  // "Explique o § 1849" (botão do leitor): perguntas do Compêndio que citam esse §, das mais específicas.
  const citados = numerosCitados(pergunta);
  if (citados.length) {
    const achados = indice.itens.filter((x) => citados.some((n) => x.refs.includes(n)))
      .sort((a, b) => a.refs.length - b.refs.length);
    if (achados.length) return achados.slice(0, limite);
  }
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
  const todos = buscar(indice, pergunta, 40).map((r) => r.n);
  const posicao = (n) => (todos.includes(n) ? todos.indexOf(n) : Infinity);
  const ns = [
    ...(exata >= 0 ? [exata + 1] : []),
    // Várias definições ("graça sacramental", "graça que justifica"): a mais relevante na busca primeiro.
    ...definicoes.map((i) => i + 1).sort((a, b) => posicao(a) - posicao(b)),
    ...res.filter((r) => r.score / melhor >= RELATIVO_MINIMO).map((r) => r.n),
  ];
  return [...new Set(ns)].slice(0, limite).map((n) => indice.itens[n - 1]);
}

// ---------- resposta sem IA: Compêndio + perguntas frequentes ----------
// Semelhança (0–1, ver semelhanca.js) a partir da qual a pergunta é "a mesma" já respondida:
// com o catequista (IA), só nesse caso a resposta sai daqui, sem gastar a cota.
export const MESMA_PERGUNTA = 0.85;
const FAQ_PRINCIPAL = 0.45; // pergunta frequente parecida o bastante para aparecer junto do Compêndio
const FAQ_SOZINHA = 0.35; // ... ou sozinha, quando o Compêndio não tem nada

// faq: dados de faq.js com comparador (criarIndiceFaq), ou null se não carregou.
// estrita: só responde se a pergunta já existir (quase igual); senão retorna null.
// Retorno: { principal: 'compendio' | 'faq', itens: [itens do Compêndio], faq: [perguntas frequentes] }.
export function responderLocal(indice, faq, pergunta, { estrita = false } = {}) {
  const mf = faq?.comparador.melhores(pergunta, 1)[0];
  const qFaq = mf && faq.perguntas[mf.i];
  const simFaq = mf?.sim || 0;
  if (estrita) {
    const mc = indice.comparador.melhores(pergunta, 1)[0];
    const simComp = mc?.sim || 0;
    if (Math.max(simComp, simFaq) < MESMA_PERGUNTA) return null;
    if (simFaq > simComp) return { principal: 'faq', itens: [], faq: [qFaq] };
    return { principal: 'compendio', itens: [indice.itens[mc.i]], faq: simFaq >= FAQ_PRINCIPAL ? [qFaq] : [] };
  }
  const itens = responderPeloCompendio(indice, pergunta);
  const simComp = itens[0] ? indice.comparador.sim(pergunta, itens[0].n - 1) : 0;
  const faqOk = simFaq >= (itens.length ? FAQ_PRINCIPAL : FAQ_SOZINHA);
  return {
    principal: faqOk && simFaq > simComp ? 'faq' : 'compendio',
    itens,
    faq: faqOk ? [qFaq] : [],
  };
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

// Mensagem do chat respondida sem IA (Compêndio e/ou perguntas frequentes).
// m: { motivo, pergunta, itens, faq, principal, podeIA }
export function htmlRespostaCompendio(m) {
  const comp = (m.itens || []).map((x) => ({ titulo: x.pergunta, html: htmlItemCompendio(x), fontes: htmlRefs(x.refs) }));
  const faq = (m.faq || []).map((q) => ({ titulo: q.p, html: htmlItemFaq(q), fontes: htmlCicFaq(q.cic) }));
  const [primeiro, ...outros] = m.principal === 'faq' ? [...faq, ...comp] : [...comp, ...faq];
  // Sem motivo = resposta local normal; com motivo = a IA falhou e a resposta local a substitui.
  const aviso = m.motivo
    ? `<p class="nota-sistema comp-aviso">${esc(m.motivo)} Enquanto isso, veja a resposta já pronta:</p>`
    : '';
  if (!primeiro) {
    const busca = m.pergunta ? ` ou <a href="#/busca/${encodeURIComponent(m.pergunta.slice(0, 120))}">pesquise no Catecismo</a>` : ' ou pesquise no Catecismo';
    return `<div class="balao">${m.motivo ? `<p class="nota-sistema">${esc(m.motivo)}</p>` : ''}
      <p>Não encontrei no Compêndio do Catecismo nem nas perguntas frequentes uma pergunta parecida com a sua. Tente com outras palavras${busca}.</p></div>`;
  }
  const extras = outros.map((x) => `<details class="comp-outro"><summary>Veja também: ${esc(x.titulo)}</summary>
      ${x.html}<div class="fontes-lista">${x.fontes}</div></details>`).join('');
  const ia = m.podeIA && m.pergunta
    ? `<button type="button" class="bt-sec pedir-ia" data-pergunta="${esc(m.pergunta)}">Pedir explicação ao catequista (IA)</button>`
    : '';
  return `<div class="balao">${aviso}${primeiro.html}${extras}</div>
    <div class="fontes"><span class="rotulo">No Catecismo · toque para ler</span>
      <div class="fontes-lista">${primeiro.fontes}</div></div>${ia}`;
}
