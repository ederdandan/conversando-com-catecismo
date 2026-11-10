// Perguntas frequentes (data/faq.json): dúvidas comuns de católicos, respondidas com o Catecismo,
// com referências bíblicas e uma analogia. Sem DOM: roda no navegador e nos testes.
import { termos } from './busca.js';
import { esc } from './html.js';
import { criarComparador } from './semelhanca.js';

// Email que recebe os avisos "Reportar erro". Vazio: o botão não aparece.
// Fica visível no código do site: use um endereço só para isso.
export const EMAIL_ERROS = 'catequeseemcancao@gmail.com';

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

// Perguntas frequentes relacionadas a uma resposta do Compêndio: as que tratam do que a pessoa perguntou
// (as palavras dela aparecem na pergunta frequente) e, de preferência, citam os mesmos § do Catecismo.
// refs: § da resposta do Compêndio; excluir: ids já mostrados.
export function relacionadasFaq(faq, pergunta, refs = [], { limite = 3, excluir = [] } = {}) {
  const cita = (q) => q.cic.some(([a, b]) => refs.some((n) => n >= a && n <= b));
  return faq.comparador.todas(pergunta)
    .map((x) => ({ ...x, q: faq.perguntas[x.i] }))
    .filter(({ q, sim, cob }) => !excluir.includes(q.id) && (cita(q) ? cob >= 0.5 : (cob >= 0.99 && sim >= 0.2) || (cob >= 0.8 && sim >= 0.3)))
    .map((x) => ({ ...x, score: x.sim + x.cob + (cita(x.q) ? 0.3 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((x) => x.q);
}

export const htmlCicFaq = (cic) => cic.map(([a, b]) =>
  `<button type="button" class="cita fonte" data-n="${a}">§ ${a}${b > a ? `–${b}` : ''}</button>`).join('');

// "Reportar erro": abre o email do leitor com o código da pergunta (só se EMAIL_ERROS estiver configurado).
function htmlReportar(q, email = EMAIL_ERROS) {
  if (!email) return '';
  const assunto = encodeURIComponent(`Erro na pergunta ${q.id}`);
  const corpo = encodeURIComponent(`Pergunta: ${q.p}\n\nO que está errado:\n\n`);
  return `<a class="bt-reportar" href="mailto:${esc(email)}?subject=${assunto}&amp;body=${corpo}">Reportar erro</a>`;
}

// Aspas tipográficas nos títulos ("'Eu creio'" → "“Eu creio”").
export const aspas = (t) => String(t).replace(/'([^']+)'/g, '“$1”');

export function htmlPergunta(q, opcoes) {
  const aberta = typeof opcoes === 'object' && opcoes?.aberta;
  return `<details class="faq-item" id="${esc(q.id)}"${aberta ? ' open' : ''}>
    <summary><span>${esc(q.p)}</span><svg class="ic" aria-hidden="true"><use href="#i-baixo"/></svg></summary>
    <div class="faq-corpo">
      <p>${esc(q.r)}</p>
      ${q.a ? `<p class="faq-analogia"><strong>Para entender:</strong> ${esc(q.a)}</p>` : ''}
      ${q.b.length ? `<p class="faq-biblia"><strong>Na Bíblia:</strong> ${q.b.map(esc).join(' · ')}</p>` : ''}
      <div class="fontes"><span class="rotulo">No Catecismo · toque para ler</span><div class="fontes-lista">${htmlCicFaq(q.cic)}</div></div>
      <button type="button" class="bt-sec bt-compartilhar" data-compartilhar="${esc(q.id)}"><svg class="ic" aria-hidden="true"><use href="#i-compartilhar"/></svg>Compartilhar</button>
      ${htmlReportar(q)}
    </div>
  </details>`;
}

// No chat: a pergunta frequente como resposta (mesmo visual do item do Compêndio).
// comPergunta: false quando a pergunta já está no título (item que abre e fecha).
export function htmlItemFaq(q, { comPergunta = true } = {}) {
  return `${comPergunta ? `<p class="comp-pergunta"><span class="comp-n">Perguntas frequentes</span> ${esc(q.p)}</p>` : ''}
    <p>${esc(q.r)}</p>
    ${q.a ? `<p class="faq-analogia"><strong>Para entender:</strong> ${esc(q.a)}</p>` : ''}
    ${q.b?.length ? `<p class="faq-biblia"><strong>Na Bíblia:</strong> ${q.b.map(esc).join(' · ')}</p>` : ''}`;
}

export const htmlListaPerguntas = (lista) => `<div class="faq-lista">${lista.map((q) => htmlPergunta(q)).join('')}</div>`;
