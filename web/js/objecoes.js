// Objeções à fé católica (data/objecoes.json), respondidas com o Catecismo: resposta curta, explicação,
// analogia, Bíblia (com o texto quando o próprio Catecismo o transcreve) e os § do Catecismo. Sem DOM.
import { esc } from './html.js';
import { buscarFaq, htmlCicFaq, htmlReportar } from './faq.js';

let carregando = null;
export function carregarObjecoes(url = 'data/objecoes.json') {
  carregando ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Falha ao carregar as objeções (HTTP ${r.status})`);
    return r.json();
  }).then(prepararObjecoes).catch((e) => { carregando = null; throw e; });
  return carregando;
}

// Mesmo formato das perguntas frequentes (p, r, a, principal), para reaproveitar a busca e o agrupamento.
export function prepararObjecoes(dados) {
  const secao = new Map(dados.secoes.map((s) => [s.id, s]));
  for (const o of dados.objecoes) {
    const s = secao.get(o.s);
    const dentro = o.cic.find(([a]) => a >= s.ini && a <= s.fim);
    o.principal = (dentro || o.cic[0])[0];
    o.p = o.o;
  }
  dados.perguntas = dados.objecoes;
  return dados;
}

export const objecoesDoTema = (d, s, c) => d.objecoes.filter((o) => o.s === s && o.c === c);
export const objecoesDoCapitulo = (d, ini, fim) => d.objecoes.filter((o) => o.principal >= ini && o.principal <= fim);
export const buscarObjecoes = (d, consulta, limite) => buscarFaq(d, consulta, limite);

const htmlVersos = (bt = []) => bt.map((v) => `<blockquote class="obj-verso"><p>“${esc(v.t)}”</p>
      <cite>${esc(v.ref)} · <button type="button" class="cita" data-n="${v.p}">citado no § ${v.p}</button></cite></blockquote>`).join('');

export function htmlObjecao(o, opcoes) {
  const aberta = typeof opcoes === 'object' && opcoes?.aberta;
  const comTexto = new Set((o.bt || []).map((v) => v.ref));
  const outras = o.b.filter((r) => !comTexto.has(r));
  return `<details class="faq-item obj-item" id="${esc(o.id)}"${aberta ? ' open' : ''}>
    <summary><span>“${esc(o.o)}”</span><svg class="ic" aria-hidden="true"><use href="#i-baixo"/></svg></summary>
    <div class="faq-corpo">
      <p class="obj-curta"><span class="rotulo">Resposta curta</span>${esc(o.r)}</p>
      <p>${esc(o.e)}</p>
      ${o.a ? `<p class="faq-analogia"><strong>Para entender:</strong> ${esc(o.a)}</p>` : ''}
      ${htmlVersos(o.bt)}
      ${outras.length ? `<p class="faq-biblia"><strong>Na Bíblia:</strong> ${outras.map(esc).join(' · ')}</p>` : ''}
      <div class="fontes"><span class="rotulo">No Catecismo · toque para ler</span><div class="fontes-lista">${htmlCicFaq(o.cic)}</div></div>
      <button type="button" class="bt-sec bt-compartilhar" data-compartilhar-obj="${esc(o.id)}"><svg class="ic" aria-hidden="true"><use href="#i-compartilhar"/></svg>Compartilhar</button>
      ${htmlReportar({ id: o.id, p: o.o }, undefined, 'objeção')}
    </div>
  </details>`;
}

export const htmlListaObjecoes = (lista) => `<div class="faq-lista">${lista.map((o) => htmlObjecao(o)).join('')}</div>`;
