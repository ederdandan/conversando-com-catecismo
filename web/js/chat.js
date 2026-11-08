// Tela "Conversar": código de convite, conversa com streaming e citações clicáveis.
import { API_URL } from './config.js';
import { selecionarParagrafos } from './busca.js';
import { avaliarResposta, htmlResposta, MENSAGEM_RECUSA } from './citacoes.js';
import { esc } from './html.js';

const SUGESTOES = [
  'O que é a graça?',
  'Quais são os sacramentos de cura?',
  'O que é o pecado mortal?',
  'Por que rezar o Pai-Nosso?',
  'O que a Igreja ensina sobre o casamento?',
  'O que acontece depois da morte?',
];
const MAX_HISTORICO_CHARS = 1400;

const armazenamento = {
  ler(k, padrao = null) { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } },
  gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

let conversa = [];
try { conversa = JSON.parse(armazenamento.ler('conversa', '[]')) || []; } catch { conversa = []; }
const salvarConversa = () => armazenamento.gravar('conversa', JSON.stringify(conversa.slice(-30)));

let emAndamento = null; // AbortController da resposta atual

// ---------- API ----------
async function chamarApi(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  if (!API_URL) throw new Error('O chat ainda não foi configurado neste site.');
  const codigo = armazenamento.ler('codigo', '');
  let r;
  try {
    r = await fetch(`${API_URL}${caminho}`, {
      method: metodo,
      signal: sinal,
      headers: { Authorization: `Bearer ${codigo}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Sem conexão com o servidor do chat. Verifique sua internet.');
  }
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { msg = (await r.json()).erro || msg; } catch { /* corpo não-JSON */ }
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r;
}

// Lê o SSE do Worker e chama onEvento para cada evento.
async function lerEventos(resposta, onEvento) {
  const reader = resposta.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop();
    for (const b of blocos) {
      const linha = b.split('\n').find((l) => l.startsWith('data:'));
      if (!linha) continue;
      let ev;
      try { ev = JSON.parse(linha.slice(5).trim()); } catch { continue; /* ignora evento inválido */ }
      onEvento(ev);
    }
  }
}

// ---------- renderização ----------
function htmlMensagem(m, i) {
  if (m.papel === 'usuario') return `<div class="msg usuario"><div class="balao">${esc(m.texto)}</div></div>`;
  const aval = m.estado === 'pronto' ? avaliarResposta(m.texto, m.paragrafos || []) : null;
  let corpo;
  if (m.estado === 'erro') corpo = `<p class="msg-erro">${esc(m.texto)}</p>`;
  else if (m.estado === 'local') corpo = `<p>${esc(m.texto)}</p>`;
  else if (aval?.semFonte) {
    corpo = `<p>${esc(MENSAGEM_RECUSA)}</p><p class="nota-sistema">A resposta gerada não citava nenhum parágrafo consultado e foi descartada.</p>`;
  } else if (!m.texto) corpo = '<p class="digitando" aria-label="Escrevendo"><span></span><span></span><span></span></p>';
  else corpo = htmlResposta(m.texto, m.paragrafos || []);

  const consultados = m.paragrafos?.length && m.estado === 'pronto' && !aval?.recusa && !aval?.semFonte
    ? `<details class="consultados"><summary>${m.paragrafos.length} parágrafos consultados</summary>
        <div>${m.paragrafos.map((n) => `<button type="button" class="cita" data-n="${n}">§ ${n}</button>`).join(' ')}</div></details>`
    : '';
  return `<div class="msg assistente" data-i="${i}"><div class="balao">${corpo}${consultados}</div></div>`;
}

function htmlCodigo(erro = '') {
  return `<section class="chat-codigo">
    <h1>Conversar com o Catecismo</h1>
    <p>Faça perguntas e receba respostas baseadas <strong>somente</strong> no Catecismo da Igreja Católica, com os parágrafos citados.</p>
    <form id="form-codigo" class="busca">
      <input name="codigo" type="password" autocomplete="off" placeholder="Código de convite" aria-label="Código de convite" required minlength="6" />
      <button type="submit">Entrar</button>
    </form>
    ${erro ? `<p class="msg-erro" role="alert">${esc(erro)}</p>` : ''}
    <p class="nota-sistema">O acesso ao chat é por convite. O leitor do Catecismo é livre.</p>
  </section>`;
}

function htmlChat() {
  const vazio = !conversa.length
    ? `<div class="chat-vazio">
        <p>Pergunte algo sobre a fé católica. As respostas citam os parágrafos do Catecismo.</p>
        <div class="sugestoes">${SUGESTOES.map((s) => `<button type="button" class="sugestao">${esc(s)}</button>`).join('')}</div>
      </div>` : '';
  return `<section class="chat">
    <div class="chat-topo">
      <h1>Conversar</h1>
      <span class="cota" id="cota"></span>
      <button type="button" class="link" id="bt-nova">Nova conversa</button>
      <button type="button" class="link" id="bt-sair" title="Trocar código de convite">Sair</button>
    </div>
    <div class="mensagens" id="mensagens" aria-live="polite">${vazio}${conversa.map(htmlMensagem).join('')}</div>
    <form class="compositor" id="form-pergunta">
      <textarea name="pergunta" rows="1" maxlength="500" placeholder="Pergunte ao Catecismo…" aria-label="Sua pergunta" required></textarea>
      <button type="submit" aria-label="Enviar">Enviar</button>
    </form>
    <p class="aviso-ia">Respostas geradas por IA com base no Catecismo. Confira sempre os parágrafos citados.</p>
  </section>`;
}

function atualizarMensagem(main, i) {
  const el = main.querySelector(`.msg[data-i="${i}"]`);
  if (el) el.outerHTML = htmlMensagem(conversa[i], i);
  else main.querySelector('#mensagens')?.insertAdjacentHTML('beforeend', htmlMensagem(conversa[i], i));
}

function rolarParaFim(main) {
  const ult = main.querySelector('#mensagens')?.lastElementChild;
  ult?.scrollIntoView({ block: 'end' });
}

function mostrarCota(main, restantes) {
  const el = main.querySelector('#cota');
  if (el && restantes !== null && restantes !== undefined) el.textContent = `${restantes} perguntas restantes hoje`;
}

// ---------- fluxo de pergunta ----------
async function perguntar(main, texto, ctx) {
  const pergunta = texto.trim().slice(0, 500);
  if (!pergunta || emAndamento) return;
  main.querySelector('.chat-vazio')?.remove();

  const anteriores = conversa.filter((m) => m.papel === 'usuario');
  conversa.push({ papel: 'usuario', texto: pergunta });
  atualizarMensagem(main, conversa.length - 1);

  const d = await ctx.carregar();
  const { paragrafos } = selecionarParagrafos(ctx.obterIndice(d), pergunta, { anterior: anteriores.at(-1)?.texto || '' });
  const i = conversa.push({ papel: 'assistente', texto: '', paragrafos, estado: 'escrevendo' }) - 1;
  atualizarMensagem(main, i);
  rolarParaFim(main);

  if (!paragrafos.length) {
    Object.assign(conversa[i], { texto: MENSAGEM_RECUSA, estado: 'local' });
    atualizarMensagem(main, i);
    salvarConversa();
    return;
  }

  // Histórico curto: última troca (pergunta + resposta resumida), dentro do limite do Worker.
  const historico = [];
  const ultResp = conversa.slice(0, -2).reverse().find((m) => m.papel === 'assistente' && m.estado === 'pronto');
  const ultPerg = anteriores.at(-1);
  if (ultPerg && ultResp) {
    historico.push({ papel: 'usuario', texto: ultPerg.texto.slice(0, 400) });
    historico.push({ papel: 'assistente', texto: ultResp.texto.slice(0, MAX_HISTORICO_CHARS - 400) });
  }

  emAndamento = new AbortController();
  const form = main.querySelector('#form-pergunta');
  form?.classList.add('ocupado');
  let ultimoDesenho = 0;
  try {
    const r = await chamarApi('/api/chat', { metodo: 'POST', corpo: { pergunta, paragrafos, historico }, sinal: emAndamento.signal });
    await lerEventos(r, (ev) => {
      if (ev.tipo === 'inicio') {
        conversa[i].paragrafos = ev.paragrafos;
        conversa[i].modelo = ev.modelo;
        mostrarCota(main, ev.restantes);
      } else if (ev.tipo === 'texto') {
        conversa[i].texto += ev.t;
        const agora = performance.now();
        if (agora - ultimoDesenho > 60) { atualizarMensagem(main, i); rolarParaFim(main); ultimoDesenho = agora; }
      } else if (ev.tipo === 'erro') {
        throw new Error(ev.mensagem);
      }
    });
    conversa[i].estado = conversa[i].texto ? 'pronto' : 'erro';
    if (!conversa[i].texto) conversa[i].texto = 'A IA não enviou resposta. Tente novamente.';
  } catch (e) {
    if (e.name === 'AbortError') {
      conversa[i].estado = conversa[i].texto ? 'pronto' : 'erro';
      if (!conversa[i].texto) conversa[i].texto = 'Resposta interrompida.';
    } else {
      conversa[i] = { papel: 'assistente', texto: e.message, estado: 'erro' };
      if (e.status === 401) {
        armazenamento.gravar('codigo', null);
        conversa.splice(i - 1, 2);
        salvarConversa();
        main.innerHTML = htmlCodigo('Código de convite inválido ou revogado.');
        ligarCodigo(main, ctx);
        return;
      }
    }
  } finally {
    emAndamento = null;
    form?.classList.remove('ocupado');
  }
  atualizarMensagem(main, i);
  rolarParaFim(main);
  salvarConversa();
}

// ---------- telas ----------
function ligarCodigo(main, ctx) {
  main.querySelector('#form-codigo').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const codigo = new FormData(ev.target).get('codigo').toString().trim();
    const bt = ev.target.querySelector('button');
    bt.disabled = true;
    armazenamento.gravar('codigo', codigo);
    try {
      const r = await chamarApi('/api/cota');
      const c = await r.json();
      telaChat(main, ctx);
      mostrarCota(main, c.restantes);
    } catch (e) {
      armazenamento.gravar('codigo', null);
      main.innerHTML = htmlCodigo(e.status === 401 ? 'Código de convite inválido.' : e.message);
      ligarCodigo(main, ctx);
    }
  });
  main.querySelector('input[name="codigo"]').focus();
}

function telaChat(main, ctx) {
  main.innerHTML = htmlChat();
  const form = main.querySelector('#form-pergunta');
  const caixa = form.querySelector('textarea');
  const ajustar = () => {
    caixa.style.height = 'auto';
    caixa.style.height = `${Math.min(caixa.scrollHeight, 160)}px`;
    caixa.classList.toggle('cheia', caixa.scrollHeight > 160);
  };
  caixa.addEventListener('input', ajustar);
  caixa.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = caixa.value;
    caixa.value = '';
    ajustar();
    perguntar(main, t, ctx);
  });
  main.querySelector('#bt-nova').addEventListener('click', () => {
    emAndamento?.abort();
    conversa = [];
    salvarConversa();
    telaChat(main, ctx);
  });
  main.querySelector('#bt-sair').addEventListener('click', () => {
    emAndamento?.abort();
    armazenamento.gravar('codigo', null);
    telaConversar(main, ctx);
  });
  main.querySelector('.sugestoes')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('.sugestao');
    if (b) perguntar(main, b.textContent, ctx);
  });
  rolarParaFim(main);
  caixa.focus({ preventScroll: true });
  chamarApi('/api/cota').then((r) => r.json()).then((c) => mostrarCota(main, c.restantes)).catch(() => {});
}

export function telaConversar(main, ctx) {
  document.title = 'Conversar · Catecismo';
  if (!API_URL) {
    main.innerHTML = '<section class="aviso"><h1>Conversar com o Catecismo</h1><p>O chat ainda não está disponível neste endereço.</p></section>';
    return;
  }
  if (!armazenamento.ler('codigo')) {
    main.innerHTML = htmlCodigo();
    ligarCodigo(main, ctx);
    return;
  }
  telaChat(main, ctx);
}

export const cancelarResposta = () => emAndamento?.abort();
