// Citações [§ N] nas respostas da IA: extração, validação e HTML. Sem DOM (testável no Node).
import { esc } from './html.js';

export const MENSAGEM_RECUSA =
  'Não encontrei no Catecismo da Igreja Católica uma resposta para essa pergunta. '
  + 'Tente reformular ou pesquisar no leitor.';

// Alguns modelos (ex.: gpt-oss) citam com colchetes largos: 【§ 1849】 / ［§ 1849］.
export const normalizarColchetes = (t) => t.replace(/[【［]/g, '[').replace(/[】］]/g, ']');

// Aceita [§ 1849], [§1849], [§ 1849, 1850], [§§ 1849-1850] e [§ 1849; § 1850].
const RE_CITACAO = /\[\s*§+\s*([\d\s,;§–-]+?)\s*\]/g;

function numerosDoGrupo(grupo) {
  const nums = [];
  for (const parte of grupo.replace(/§/g, '').split(/[,;]/)) {
    const m = parte.trim().match(/^(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= Math.min(b, a + 20); n++) nums.push(n);
  }
  return nums;
}

export function extrairCitacoes(texto) {
  const nums = [];
  for (const m of normalizarColchetes(texto).matchAll(RE_CITACAO)) nums.push(...numerosDoGrupo(m[1]));
  return [...new Set(nums)];
}

export const ehRecusa = (texto) => texto.replace(/\s+/g, ' ').trim().startsWith(MENSAGEM_RECUSA.slice(0, 60));

// enviados: números de § que foram como contexto para a IA.
export function avaliarResposta(texto, enviados) {
  const enviadosSet = new Set(enviados);
  const citadas = extrairCitacoes(texto);
  const validas = citadas.filter((n) => enviadosSet.has(n));
  const invalidas = citadas.filter((n) => !enviadosSet.has(n));
  const recusa = ehRecusa(texto);
  // Resposta sem nenhuma citação válida (e que não é a recusa padrão) não é confiável.
  const semFonte = !recusa && texto.trim().length > 0 && validas.length === 0;
  return { validas, invalidas, recusa, semFonte };
}

// Texto da IA → HTML seguro: parágrafos, **negrito**, listas simples e [§ N] como botões.
// Citações de § que não estavam no contexto viram texto riscado (não clicável).
export function htmlResposta(texto, enviados) {
  const enviadosSet = new Set(enviados);
  const citar = (grupo) => numerosDoGrupo(grupo).map((n) => (enviadosSet.has(n)
    ? `<button type="button" class="cita" data-n="${n}" aria-label="Abrir parágrafo ${n}">§ ${n}</button>`
    : `<span class="cita invalida" title="Este parágrafo não estava entre os consultados">§ ${n}</span>`)).join(' ');

  const inline = (linha) => esc(linha)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\s*§+\s*([\d\s,;§–-]+?)\s*\]/g, (_, g) => citar(g));

  return normalizarColchetes(texto).trim().split(/\n{2,}/).map((bloco) => {
    const linhas = bloco.split('\n');
    if (linhas.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ordenada = /^\s*\d/.test(linhas[0]);
      const itens = linhas.map((l) => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`).join('');
      return ordenada ? `<ol>${itens}</ol>` : `<ul>${itens}</ul>`;
    }
    // Analogia do catequista ("**Para entender:** …"): mesmo destaque das perguntas frequentes.
    const analogia = /^\s*\*\*Para entender:?\*\*/i.test(linhas[0]);
    return `<p${analogia ? ' class="faq-analogia"' : ''}>${linhas.map(inline).join('<br>')}</p>`;
  }).join('');
}
