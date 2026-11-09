// Tela "Conversar": código de convite, conversa com streaming e citações clicáveis.
import { API_URL } from './config.js';
import { selecionarParagrafos } from './busca.js';
import { avaliarResposta, htmlResposta, MENSAGEM_RECUSA } from './citacoes.js';
import { esc } from './html.js';
import { carregarCompendio, criarIndiceCompendio, htmlRespostaCompendio, responderLocal } from './compendio.js';
import { carregarFaq, criarIndiceFaq } from './faq.js';
import { salvarLista } from './historico.js';

const SUGESTOES = [
  'O que é a graça?',
  'Quais são os sacramentos de cura?',
  'Por que rezamos o Pai-Nosso?',
  'O que acontece depois da morte?',
];
// Sem IA: perguntas que o Compêndio responde diretamente (itens 271, 210, 392, 205).
const SUGESTOES_COMPENDIO = [
  'O que é a Eucaristia?',
  'O que é o purgatório?',
  'O que é o pecado?',
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
// A conversa fica guardada neste aparelho até a pessoa tocar em "Nova conversa" (ver historico.js).
const salvarConversa = () => salvarLista(conversa, (txt) => localStorage.setItem('conversa', txt));

let emAndamento = null; // AbortController da resposta atual
let indiceCompendio = null;

// Modo do chat: sem código de convite, responde pelo Compêndio (local, offline, sem cota);
// com código (aba Mais → Entrar), usa o catequista com IA e cai no Compêndio se a IA falhar.
export const temIA = () => Boolean(API_URL && armazenamento.ler('codigo'));

// Resposta já pronta: a pergunta mais parecida do Compêndio (oficial) ou das perguntas frequentes.
// Sem IA (modo Compêndio, cota esgotada, IA fora do ar, sem internet): sempre responde daqui.
// Com IA (estrita): só se a pergunta já existir quase igual; senão retorna null e a IA responde.
async function respostaLocal(pergunta, motivo, { estrita = false } = {}) {
  try {
    indiceCompendio ??= criarIndiceCompendio(await carregarCompendio());
    // As perguntas frequentes são um extra: se não carregarem, segue só com o Compêndio.
    const faq = await carregarFaq().then(criarIndiceFaq).catch(() => null);
    const r = responderLocal(indiceCompendio, faq, pergunta, { estrita });
    if (!r) return null;
    return { papel: 'assistente', estado: 'compendio', motivo, pergunta, ...r, podeIA: estrita };
  } catch {
    return estrita ? null : { papel: 'assistente', texto: motivo, estado: 'erro' };
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
    const faq = m.principal === 'faq' && m.faq?.length;
    return `<article class="msg assistente compendio" data-i="${i}">
      <div class="autor"><span class="selo">${icone(faq ? 'duvida' : 'livro')}</span>${faq ? 'Perguntas frequentes' : 'Compêndio do Catecismo'}</div>
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
  return `<header class="cab"><a class="bt-icone" href="#/sobre" aria-label="Voltar">${icone('esq')}</a><h1>Catequista com IA</h1></header>
  <section class="chat-codigo tela">
    <div class="boas-vindas">
      <span class="selo grande">${icone('chat')}</span>
      <h2>Converse com um catequista</h2>
      <p>Com o código de convite, as respostas são explicadas por um catequista (IA) com base <strong>somente</strong> no Catecismo, sempre com os parágrafos citados. Sem código, o chat continua respondendo pelo Compêndio.</p>
    </div>
    <form id="form-codigo" class="form-codigo">
      <label for="campo-codigo">Código de convite</label>
      <input id="campo-codigo" name="codigo" type="password" autocomplete="off" required minlength="6" enterkeyhint="go" />
      <button type="submit" class="bt-pri">Entrar</button>
    </form>
    ${erro ? `<p class="msg-erro" role="alert">${esc(erro)}</p>` : ''}
    <p class="nota-sistema">O acesso à IA é por convite. O leitor e as respostas do Compêndio são livres.</p>
  </section>`;
}

function htmlChat() {
  const ia = temIA();
  const convite = !ia && API_URL
    ? `<a class="linha-acao convite-ia" href="#/entrar"><span class="icone-caixa">${icone('chat')}</span><span class="t"><strong>Quer respostas explicadas?</strong><small>Entre com um código de convite para usar o catequista com IA</small></span>${icone('dir')}</a>`
    : '';
  const vazio = !conversa.length
    ? `<div class="chat-vazio">
        <div class="boas-vindas">
          <span class="selo grande">${icone(ia ? 'chat' : 'livro')}</span>
          <h2>Qual é a sua dúvida sobre a fé?</h2>
          <p>${ia
    ? 'Um catequista responde usando apenas o Catecismo e mostra de qual parágrafo veio cada resposta. Perguntas que já têm resposta pronta (Compêndio ou perguntas frequentes) são respondidas na hora.'
    : 'A resposta vem do <strong>Compêndio do Catecismo</strong> — as perguntas e respostas oficiais da Igreja — ou das <strong>perguntas frequentes</strong>, com os parágrafos do Catecismo para aprofundar.'}</p>
        </div>${convite}
        <span class="rotulo">Experimente perguntar</span>
        <div class="sugestoes">${(ia ? SUGESTOES : SUGESTOES_COMPENDIO).map((s) => `<button type="button" class="sugestao"><span>${esc(s)}</span>${icone('enviar')}</button>`).join('')}</div>
      </div>` : '';
  return `<header class="cab cab-chat">
      <a class="cab-icone" href="#/" aria-label="Início"><img src="icones/icone-192.png" alt="" width="28" height="28" /></a>
      <h1>Conversar</h1>
      ${ia ? '<span class="cota" id="cota" hidden></span>' : '<span class="cota modo" title="Respostas oficiais do Compêndio do Catecismo">Compêndio</span>'}
      <button type="button" class="bt-icone" id="bt-nova" aria-label="Nova conversa" title="Nova conversa">${icone('novo')}</button>
    </header>
    <section class="chat">
    <div class="mensagens" id="mensagens" aria-live="polite">${vazio}${conversa.map(htmlMensagem).join('')}</div>
    <div class="compositor-area">
      <form class="compositor" id="form-pergunta">
        <textarea name="pergunta" rows="1" maxlength="500" placeholder="Escreva sua pergunta…" aria-label="Sua pergunta" enterkeyhint="send"></textarea>
        <button type="submit" class="bt-enviar" aria-label="Enviar">${icone('enviar')}</button>
      </form>
      <p class="aviso-ia">${ia ? 'Resposta gerada por IA. Confira os parágrafos citados.' : 'Respostas do Compêndio do Catecismo (2005) e das perguntas frequentes.'}</p>
    </div>
  </section>`;
}

function atualizarMensagem(main, i) {
  const el = main.querySelector(`.msg[data-i="${i}"]`);
  if (!conversa[i]) return;
  if (el) el.outerHTML = htmlMensagem(conversa[i], i);
  else main.querySelector('#mensagens')?.insertAdjacentHTML('beforeend', htmlMensagem(conversa[i], i));
}

// O campo de pergunta é fixo embaixo: rolar até o fim da página deixa a última mensagem logo acima dele.
function rolarParaFim(main) {
  if (main.querySelector('#mensagens')) window.scrollTo({ top: document.documentElement.scrollHeight });
}

// O selo só aparece quando restam poucas perguntas no dia (o limite é alto e não precisa ficar à vista).
const AVISAR_COTA_ABAIXO = 10;
function mostrarCota(main, restantes) {
  const el = main.querySelector('#cota');
  if (!el || restantes === null || restantes === undefined) return;
  el.textContent = `${restantes} ${restantes === 1 ? 'pergunta' : 'perguntas'} hoje`;
  el.title = 'Perguntas que você ainda pode fazer hoje';
  el.hidden = restantes > AVISAR_COTA_ABAIXO;
}

// Aviso temporário com "Desfazer" (some sozinho em alguns segundos).
function avisoDesfazer(texto, desfazer, ms = 6000) {
  document.getElementById('aviso-desfazer')?.remove();
  const el = document.createElement('div');
  el.id = 'aviso-desfazer';
  el.className = 'aviso-desfazer';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(texto)}</span><button type="button">Desfazer</button>`;
  const fechar = () => { clearTimeout(t); el.remove(); };
  const t = setTimeout(fechar, ms);
  el.querySelector('button').addEventListener('click', () => { fechar(); desfazer(); });
  window.addEventListener('hashchange', fechar, { once: true });
  document.body.append(el);
}

// ---------- fluxo de pergunta ----------
// forcarIA: "Pedir explicação ao catequista" numa resposta já pronta — vai direto à IA.
async function perguntar(main, texto, ctx, { forcarIA = false } = {}) {
  const pergunta = texto.trim().slice(0, 500);
  if (!pergunta || emAndamento) return;
  main.querySelector('.chat-vazio')?.remove();

  const anteriores = conversa.filter((m) => m.papel === 'usuario');
  conversa.push({ papel: 'usuario', texto: pergunta });
  atualizarMensagem(main, conversa.length - 1);

  // Sem IA, sempre a resposta pronta; com IA, só se a pergunta já existir (não gasta a cota).
  if (!temIA() || !forcarIA) {
    const daqui = conversa;
    const resposta = await respostaLocal(pergunta, '', { estrita: temIA() });
    if (conversa !== daqui) return; // "Nova conversa" no meio do caminho
    if (resposta) {
      const i = conversa.push(resposta) - 1;
      atualizarMensagem(main, i);
      rolarParaFim(main);
      salvarConversa();
      return;
    }
  }

  const d = await ctx.carregar();
  const { paragrafos } = selecionarParagrafos(ctx.obterIndice(d), pergunta, { anterior: anteriores.at(-1)?.texto || '' });
  const i = conversa.push({ papel: 'assistente', texto: '', paragrafos, estado: 'escrevendo' }) - 1;
  const lista = conversa; // se a pessoa tocar em "Nova conversa" durante a resposta, não mistura
  atualizarMensagem(main, i);
  rolarParaFim(main);

  if (!paragrafos.length) {
    Object.assign(lista[i], { texto: MENSAGEM_RECUSA, estado: 'local' });
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
        lista[i].paragrafos = ev.paragrafos;
        lista[i].modelo = ev.modelo;
        mostrarCota(main, ev.restantes);
      } else if (ev.tipo === 'texto') {
        lista[i].texto += ev.t;
        const agora = performance.now();
        if (agora - ultimoDesenho > 60) { atualizarMensagem(main, i); rolarParaFim(main); ultimoDesenho = agora; }
      } else if (ev.tipo === 'erro') {
        throw Object.assign(new Error(ev.mensagem || 'A IA parou de responder.'), { semIA: true });
      }
    });
    lista[i].estado = lista[i].texto ? 'pronto' : 'erro';
    if (!lista[i].texto) lista[i].texto = 'A IA não enviou resposta. Tente novamente.';
  } catch (e) {
    if (e.name === 'AbortError') {
      lista[i].estado = lista[i].texto ? 'pronto' : 'erro';
      if (!lista[i].texto) lista[i].texto = 'Resposta interrompida.';
    } else {
      lista[i] = e.semIA
        ? await respostaLocal(pergunta, e.message)
        : { papel: 'assistente', texto: e.message, estado: 'erro' };
      if (e.status === 401) {
        armazenamento.gravar('codigo', null);
        lista[i] = await respostaLocal(pergunta, 'Seu código de convite não vale mais; para voltar a usar a IA, entre de novo pela aba Mais.');
        main.querySelector('.cab-chat .cota')?.replaceWith(Object.assign(document.createElement('span'), { className: 'cota modo', textContent: 'Compêndio' }));
      }
    }
  } finally {
    emAndamento = null;
    form?.classList.remove('ocupado');
  }
  if (conversa !== lista) return;
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
      await r.json();
      location.hash = '#/conversar';
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
  const enviar = () => {
    // Enquanto a resposta anterior ainda está sendo escrita, mantém o texto no campo (não perde a pergunta).
    if (!caixa.value.trim() || emAndamento) return;
    const t = caixa.value;
    caixa.value = '';
    ajustar();
    perguntar(main, t, ctx);
  };
  // Enter envia; Shift+Enter quebra a linha.
  // Teclado físico: keydown. Teclado do celular (Gboard etc.): o Enter costuma chegar "em composição"
  // (keyCode 229), então também tratamos o beforeinput de quebra de linha.
  let shift = false;
  caixa.addEventListener('keydown', (ev) => {
    shift = ev.shiftKey;
    if (ev.key === 'Enter' && !ev.shiftKey && !(ev.isComposing && ev.keyCode === 229)) { ev.preventDefault(); enviar(); }
  });
  caixa.addEventListener('keyup', () => { shift = false; });
  caixa.addEventListener('beforeinput', (ev) => {
    if ((ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph') && !shift) { ev.preventDefault(); enviar(); }
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
  // Tocar no botão não pode tirar o foco do campo: senão o teclado fecha, as abas voltam,
  // o botão sai de baixo do dedo e o primeiro toque se perde ("precisa tocar duas vezes").
  const manterFoco = (ev) => { if (document.activeElement === caixa) ev.preventDefault(); };
  const btEnviar = form.querySelector('.bt-enviar');
  btEnviar.addEventListener('pointerdown', manterFoco);
  btEnviar.addEventListener('mousedown', manterFoco);
  main.querySelector('#bt-nova').addEventListener('click', () => {
    if (!conversa.length) return;
    emAndamento?.abort();
    const anterior = conversa;
    conversa = [];
    salvarConversa();
    telaChat(main, ctx);
    avisoDesfazer('Conversa apagada', () => {
      conversa = anterior.filter((m) => m.estado !== 'escrevendo');
      salvarConversa();
      if (document.body.contains(main) && main.querySelector('#form-pergunta')) telaChat(main, ctx);
    });
  });
  // Resposta já pronta → a pessoa pode pedir a explicação da IA mesmo assim.
  main.querySelector('#mensagens').addEventListener('click', (ev) => {
    const b = ev.target.closest('.pedir-ia');
    if (!b || emAndamento) return;
    const art = b.closest('.msg');
    const m = conversa[Number(art?.dataset.i)];
    if (m) { m.podeIA = false; atualizarMensagem(main, Number(art.dataset.i)); }
    perguntar(main, b.dataset.pergunta, ctx, { forcarIA: true });
  });
  main.querySelector('.sugestoes')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('.sugestao');
    if (b) perguntar(main, b.textContent.trim(), ctx);
  });
  // No celular, as abas somem enquanto o teclado está aberto.
  caixa.addEventListener('focus', () => document.body.classList.add('digitando'));
  // Ao sair do campo, espera um instante antes de mostrar as abas de novo: um toque em andamento
  // (num botão perto do campo) termina antes de o layout mudar.
  caixa.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== caixa) document.body.classList.remove('digitando');
  }, 200));
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
  if (temIA()) chamarApi('/api/cota').then((r) => r.json()).then((c) => mostrarCota(main, c.restantes)).catch(() => {});
}

export function telaConversar(main, ctx) {
  document.title = 'Conversar · Catecismo';
  telaChat(main, ctx);
}

// Aba Mais → "Usar o catequista com IA".
export function telaEntrar(main, ctx) {
  document.title = 'Catequista com IA · Catecismo';
  if (!API_URL) {
    main.innerHTML = '<header class="cab"><h1>Catequista com IA</h1></header><section class="tela"><div class="aviso"><p>A IA ainda não está disponível neste endereço.</p></div></section>';
    return;
  }
  main.innerHTML = htmlCodigo();
  ligarCodigo(main, ctx);
}

export const sairDaIA = () => { emAndamento?.abort(); armazenamento.gravar('codigo', null); };

export const cancelarResposta = () => emAndamento?.abort();
