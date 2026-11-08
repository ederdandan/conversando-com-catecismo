// Tela "Conversar": código de convite, conversa com streaming e citações clicáveis.
import { API_URL } from './config.js';
import { selecionarParagrafos } from './busca.js';
import { avaliarResposta, htmlResposta, MENSAGEM_RECUSA } from './citacoes.js';
import { esc } from './html.js';
import { carregarCompendio, criarIndiceCompendio, htmlRespostaCompendio, responderPeloCompendio } from './compendio.js';

const SUGESTOES = [
  'O que é a graça?',
  'Quais são os sacramentos de cura?',
  'Por que rezamos o Pai-Nosso?',
  'O que acontece depois da morte?',
];
const icone = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
const MAX_HISTORICO_CHARS = 1400;

const armazenamento = {
  ler(k, padrao = null) { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } },
  gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

let conversa = [];
try { conversa = JSON.parse(armazenamento.ler('conversa', '[]')) || []; } catch { conversa = []; }
const salvarConversa = () => armazenamento.gravar('conversa', JSON.stringify(conversa.slice(-30)));

let emAndamento = null; // AbortController da resposta atual
let indiceCompendio = null;

// Sem IA (cota esgotada, IA fora do ar, sem internet): a pergunta oficial mais parecida do Compêndio.
async function respostaCompendio(pergunta, motivo) {
  try {
    indiceCompendio ??= criarIndiceCompendio(await carregarCompendio());
    return { papel: 'assistente', estado: 'compendio', motivo, itens: responderPeloCompendio(indiceCompendio, pergunta) };
  } catch {
    return { papel: 'assistente', texto: motivo, estado: 'erro' };
  }
}

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
    throw Object.assign(new Error('Sem conexão com o servidor do chat.'), { semIA: true });
  }
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { msg = (await r.json()).erro || msg; } catch { /* corpo não-JSON */ }
    const err = new Error(msg);
    err.status = r.status;
    err.semIA = r.status === 429 || r.status >= 500; // cota esgotada ou IA fora do ar → Compêndio
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
  if (m.estado === 'compendio') {
    return `<article class="msg assistente compendio" data-i="${i}">
      <div class="autor"><span class="selo">${icone('livro')}</span>Compêndio do Catecismo</div>
      ${htmlRespostaCompendio(m)}</article>`;
  }
  const aval = m.estado === 'pronto' ? avaliarResposta(m.texto, m.paragrafos || []) : null;
  let corpo;
  if (m.estado === 'erro') corpo = `<p class="msg-erro">${esc(m.texto)}</p>`;
  else if (m.estado === 'local') corpo = `<p>${esc(m.texto)}</p>`;
  else if (aval?.semFonte) {
    corpo = `<p>${esc(MENSAGEM_RECUSA)}</p><p class="nota-sistema">A resposta gerada não citava nenhum parágrafo consultado e foi descartada.</p>`;
  } else if (!m.texto) corpo = '<p class="digitando" aria-label="Escrevendo"><span></span><span></span><span></span></p>';
  else corpo = htmlResposta(m.texto, m.paragrafos || []);

  const fontes = m.paragrafos?.length && m.estado === 'pronto' && !aval?.recusa && !aval?.semFonte
    ? `<div class="fontes"><span class="rotulo">Fontes consultadas · toque para ler</span>
        <div class="fontes-lista">${m.paragrafos.map((n) => `<button type="button" class="cita fonte" data-n="${n}">§ ${n}</button>`).join('')}</div></div>`
    : '';
  return `<article class="msg assistente" data-i="${i}">
    <div class="autor"><span class="selo">${icone('cruz')}</span>Catequista</div>
    <div class="balao">${corpo}</div>${fontes}</article>`;
}

function htmlCodigo(erro = '') {
  return `<header class="cab"><h1>Conversar</h1></header>
  <section class="chat-codigo tela">
    <div class="boas-vindas">
      <span class="selo grande">${icone('chat')}</span>
      <h2>Converse com um catequista</h2>
      <p>Respostas baseadas <strong>somente</strong> no Catecismo da Igreja Católica, sempre com os parágrafos citados.</p>
    </div>
    <form id="form-codigo" class="form-codigo">
      <label for="campo-codigo">Código de convite</label>
      <input id="campo-codigo" name="codigo" type="password" autocomplete="off" required minlength="6" />
      <button type="submit" class="bt-pri">Entrar</button>
    </form>
    ${erro ? `<p class="msg-erro" role="alert">${esc(erro)}</p>` : ''}
    <p class="nota-sistema">O acesso ao chat é por convite. O leitor do Catecismo é livre.</p>
  </section>`;
}

function htmlChat() {
  const vazio = !conversa.length
    ? `<div class="chat-vazio">
        <div class="boas-vindas">
          <span class="selo grande">${icone('chat')}</span>
          <h2>Qual é a sua dúvida sobre a fé?</h2>
          <p>Um catequista responde usando apenas o Catecismo e mostra de qual parágrafo veio cada resposta.</p>
        </div>
        <span class="rotulo">Experimente perguntar</span>
        <div class="sugestoes">${SUGESTOES.map((s) => `<button type="button" class="sugestao"><span>${esc(s)}</span>${icone('enviar')}</button>`).join('')}</div>
      </div>` : '';
  return `<header class="cab cab-chat">
      <h1>Conversar</h1>
      <span class="cota" id="cota" hidden></span>
      <button type="button" class="bt-icone" id="bt-nova" aria-label="Nova conversa" title="Nova conversa">${icone('novo')}</button>
    </header>
    <section class="chat">
    <div class="mensagens" id="mensagens" aria-live="polite">${vazio}${conversa.map(htmlMensagem).join('')}</div>
    <div class="compositor-area">
      <form class="compositor" id="form-pergunta">
        <textarea name="pergunta" rows="1" maxlength="500" placeholder="Escreva sua pergunta…" aria-label="Sua pergunta" required></textarea>
        <button type="submit" class="bt-enviar" aria-label="Enviar">${icone('enviar')}</button>
      </form>
      <p class="aviso-ia">Resposta gerada por IA. Confira os parágrafos citados.</p>
    </div>
  </section>`;
}

function atualizarMensagem(main, i) {
  const el = main.querySelector(`.msg[data-i="${i}"]`);
  if (el) el.outerHTML = htmlMensagem(conversa[i], i);
  else main.querySelector('#mensagens')?.insertAdjacentHTML('beforeend', htmlMensagem(conversa[i], i));
}

// O campo de pergunta é fixo embaixo: rolar até o fim da página deixa a última mensagem logo acima dele.
function rolarParaFim(main) {
  if (main.querySelector('#mensagens')) window.scrollTo({ top: document.documentElement.scrollHeight });
}

function mostrarCota(main, restantes) {
  const el = main.querySelector('#cota');
  if (el && restantes !== null && restantes !== undefined) {
    el.textContent = `${restantes} ${restantes === 1 ? 'pergunta' : 'perguntas'} hoje`;
    el.title = 'Perguntas que você ainda pode fazer hoje';
    el.hidden = false;
  }
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
        throw Object.assign(new Error(ev.mensagem || 'A IA parou de responder.'), { semIA: true });
      }
    });
    conversa[i].estado = conversa[i].texto ? 'pronto' : 'erro';
    if (!conversa[i].texto) conversa[i].texto = 'A IA não enviou resposta. Tente novamente.';
  } catch (e) {
    if (e.name === 'AbortError') {
      conversa[i].estado = conversa[i].texto ? 'pronto' : 'erro';
      if (!conversa[i].texto) conversa[i].texto = 'Resposta interrompida.';
    } else {
      conversa[i] = e.semIA
        ? await respostaCompendio(pergunta, e.message)
        : { papel: 'assistente', texto: e.message, estado: 'erro' };
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
  if (matchMedia('(min-width: 761px)').matches) main.querySelector('input[name="codigo"]').focus();
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
  main.querySelector('.sugestoes')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('.sugestao');
    if (b) perguntar(main, b.textContent.trim(), ctx);
  });
  // No celular, as abas somem enquanto o teclado está aberto.
  caixa.addEventListener('focus', () => document.body.classList.add('digitando'));
  caixa.addEventListener('blur', () => document.body.classList.remove('digitando'));
  // "Perguntar sobre este trecho" (leitor) deixa a pergunta pronta para a pessoa completar ou enviar.
  let rascunho = '';
  try { rascunho = sessionStorage.getItem('rascunho') || ''; sessionStorage.removeItem('rascunho'); } catch { /* sem armazenamento */ }
  rolarParaFim(main);
  if (rascunho) {
    caixa.value = rascunho;
    ajustar();
    caixa.focus();
  } else if (matchMedia('(min-width: 761px)').matches) {
    caixa.focus({ preventScroll: true }); // no celular, não abre o teclado sozinho
  }
  chamarApi('/api/cota').then((r) => r.json()).then((c) => mostrarCota(main, c.restantes)).catch(() => {});
}

export function telaConversar(main, ctx) {
  document.title = 'Conversar · Catecismo';
  if (!API_URL) {
    main.innerHTML = '<header class="cab"><h1>Conversar</h1></header><section class="tela"><div class="aviso"><p>O chat ainda não está disponível neste endereço.</p></div></section>';
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
