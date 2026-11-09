// Perguntas frequentes (data/faq.json): dúvidas comuns de católicos, respondidas com o Catecismo,
// com referências bíblicas e uma analogia. Sem DOM: roda no navegador e nos testes.
import { termos } from './busca.js';
import { esc } from './html.js';
import { criarComparador } from './semelhanca.js';

let carregando = null;
export function carregarFaq(url = 'data/faq.json') {
  carregando ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Falha ao carregar as perguntas frequentes (HTTP ${r.status})`);
    return r.json();
  }).then(preparar).catch((e) => { carregando = null; throw e; });
  return carregando;
}

// § principal de cada pergunta: a 1ª referência dentro da faixa da sua seção (às vezes a resposta
// cita antes um § de outra parte). É ele que decide em que capítulo do leitor a pergunta aparece.
export function preparar(dados) {
  const secao = new Map(dados.secoes.map((s) => [s.id, s]));
  for (const q of dados.perguntas) {
    const s = secao.get(q.s);
    const dentro = q.cic.find(([a]) => a >= s.ini && a <= s.fim);
    q.principal = (dentro || q.cic[0])[0];
  }
  return dados;
}

export const perguntasDoTema = (faq, s, c) => faq.perguntas.filter((q) => q.s === s && q.c === c);
export const perguntasDoCapitulo = (faq, ini, fim) => faq.perguntas.filter((q) => q.principal >= ini && q.principal <= fim);

// Palavras comparadas pelo começo (6 letras): "inspiração" casa com "inspirada" e "inspirou".
const chave = (t) => t.slice(0, 6);
const chaves = (texto) => new Set(termos(texto).map(chave));

// Busca simples: termos do usuário presentes na pergunta (peso 3) ou na resposta/analogia (peso 1),
// valendo mais os termos raros. Só entram as que têm ao menos metade do peso dos termos.
export function buscarFaq(faq, consulta, limite = 30) {
  const qs = [...new Set(termos(consulta).map(chave))];
  if (!qs.length) return [];
  faq.termos ??= faq.perguntas.map((q) => ({ p: chaves(q.p), r: chaves(`${q.r} ${q.a}`) }));
  const N = faq.perguntas.length;
  const idf = qs.map((t) => {
    const df = faq.termos.filter(({ p, r }) => p.has(t) || r.has(t)).length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });
  const total = idf.reduce((a, b) => a + b, 0);
  const res = [];
  faq.perguntas.forEach((q, i) => {
    const { p, r } = faq.termos[i];
    let score = 0;
    let cobre = 0;
    qs.forEach((t, k) => {
      if (p.has(t)) { score += 3 * idf[k]; cobre += idf[k]; } else if (r.has(t)) { score += idf[k]; cobre += idf[k]; }
    });
    // Quem cobre todos os termos fica à frente de quem repete só os mais comuns.
    if (score && cobre / total >= 0.5) res.push({ q, score: score * (cobre / total) ** 2 });
  });
  return res.sort((a, b) => b.score - a.score).slice(0, limite).map((x) => x.q);
}

// Comparador de perguntas, para o chat reconhecer uma pergunta que já está aqui.
export function criarIndiceFaq(faq) {
  faq.comparador ??= criarComparador(faq.perguntas.map((q) => q.p));
  return faq;
}

export const htmlCicFaq = (cic) => cic.map(([a, b]) =>
  `<button type="button" class="cita fonte" data-n="${a}">§ ${a}${b > a ? `–${b}` : ''}</button>`).join('');

// Uma pergunta, em sanfona: a resposta, a analogia, a Bíblia e os § (que abrem o painel do leitor).
export function htmlPergunta(q) {
  return `<details class="faq-item" id="${esc(q.id)}">
    <summary><span>${esc(q.p)}</span><svg class="ic" aria-hidden="true"><use href="#i-baixo"/></svg></summary>
    <div class="faq-corpo">
      <p>${esc(q.r)}</p>
      ${q.a ? `<p class="faq-analogia"><strong>Para entender:</strong> ${esc(q.a)}</p>` : ''}
      ${q.b.length ? `<p class="faq-biblia"><strong>Na Bíblia:</strong> ${q.b.map(esc).join(' · ')}</p>` : ''}
      <div class="fontes"><span class="rotulo">No Catecismo · toque para ler</span><div class="fontes-lista">${htmlCicFaq(q.cic)}</div></div>
    </div>
  </details>`;
}

// No chat: a pergunta frequente como resposta (mesmo visual do item do Compêndio).
export function htmlItemFaq(q) {
  return `<p class="comp-pergunta"><span class="comp-n">Perguntas frequentes</span> ${esc(q.p)}</p>
    <p>${esc(q.r)}</p>
    ${q.a ? `<p class="faq-analogia"><strong>Para entender:</strong> ${esc(q.a)}</p>` : ''}
    ${q.b?.length ? `<p class="faq-biblia"><strong>Na Bíblia:</strong> ${q.b.map(esc).join(' · ')}</p>` : ''}`;
}

export const htmlListaPerguntas = (lista) => `<div class="faq-lista">${lista.map(htmlPergunta).join('')}</div>`;
