// Roteamento, telas e preferências.
import { carregar } from './dados.js';
import { htmlSumario, htmlCapitulo, htmlNota, htmlParagrafo } from './leitor.js';
import { telaConversar } from './chat.js';
import { criarIndice, buscar, numerosCitados, radicaisDaPergunta, trecho } from './busca.js';
import { esc, partesHtml } from './html.js';

const $ = (s, el = document) => el.querySelector(s);
const main = $('#conteudo');

// ---------- preferências (localStorage pode falhar: modo privado etc.) ----------
const pref = {
  ler(k, padrao) { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } },
  gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

function aplicarFonte(delta = 0) {
  const atual = Math.min(1.5, Math.max(0.85, Number(pref.ler('fonte', '1')) + delta));
  document.documentElement.style.setProperty('--escala', String(atual));
  pref.gravar('fonte', atual.toFixed(2));
}
function aplicarTema(tema) {
  if (tema === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
  pref.gravar('tema', tema);
  const icone = { auto: '◐', light: '☀', dark: '☾' }[tema];
  $('#bt-tema').textContent = icone;
  $('#bt-tema').title = `Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[tema]}`;
}
aplicarFonte();
aplicarTema(pref.ler('tema', 'auto'));
$('#bt-menor').addEventListener('click', () => aplicarFonte(-0.05));
$('#bt-maior').addEventListener('click', () => aplicarFonte(0.05));
$('#bt-tema').addEventListener('click', () => {
  const ordem = ['auto', 'light', 'dark'];
  aplicarTema(ordem[(ordem.indexOf(pref.ler('tema', 'auto')) + 1) % 3]);
});

// ---------- índice de busca (criado sob demanda) ----------
let indice = null;
const obterIndice = (d) => (indice ??= criarIndice(d.paragrafos));

// ---------- telas ----------
function telaCarregando() {
  main.innerHTML = '<div class="carregando" role="status"><span class="spinner"></span> Carregando o Catecismo…</div>';
}

function telaErro(e) {
  main.innerHTML = `<div class="aviso erro"><p>${esc(e.message)}</p><button type="button" id="bt-repetir">Tentar de novo</button></div>`;
  $('#bt-repetir').addEventListener('click', rotear);
}

function formBusca(valor = '') {
  return `<form class="busca" id="form-busca" role="search">
    <input type="search" name="q" value="${esc(valor)}" placeholder="Buscar no Catecismo ou digite um nº de §" aria-label="Buscar no Catecismo" autocomplete="off" />
    <button type="submit">Buscar</button>
  </form>`;
}

function ligarFormBusca() {
  $('#form-busca')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = new FormData(ev.target).get('q').toString().trim();
    if (!q) return;
    const so = q.match(/^§?\s*(\d{1,4})$/);
    location.hash = so ? `#/p/${so[1]}` : `#/busca/${encodeURIComponent(q)}`;
  });
}

function telaInicio(d) {
  const ultimo = Number(pref.ler('ultimo', '0'));
  const cont = ultimo && d.porN.has(ultimo)
    ? `<a class="cartao continuar" href="#/p/${ultimo}"><small>Continuar a leitura</small><strong>§ ${ultimo} · ${esc(d.capituloDe(ultimo)?.titulo || '')}</strong></a>`
    : '';
  main.innerHTML = `
    <section class="inicio">
      <h1>Catecismo da Igreja Católica</h1>
      <p class="sub">${d.totalParagrafos.toLocaleString('pt-BR')} parágrafos · texto integral do vatican.va</p>
      ${formBusca()}
      <div class="cartoes">
        ${cont}
        <a class="cartao" href="#/p/1"><small>Começar do início</small><strong>Prólogo · § 1</strong></a>
        <a class="cartao" href="#/conversar"><small>Perguntar</small><strong>Conversar com o Catecismo</strong></a>
      </div>
    </section>
    ${htmlSumario(d)}`;
  ligarFormBusca();
}

function telaSumario(d) {
  main.innerHTML = `${formBusca()}${htmlSumario(d)}`;
  ligarFormBusca();
}

let capituloAtual = null;
function telaLeitor(d, n) {
  const p = d.porN.get(n);
  if (!p) { main.innerHTML = `<div class="aviso">O Catecismo tem parágrafos de 1 a ${d.totalParagrafos}. ${formBusca(String(n))}</div>`; ligarFormBusca(); return; }
  const cap = d.capituloDe(n);
  if (capituloAtual !== cap || !$('.texto', main)) {
    main.innerHTML = htmlCapitulo(d, cap);
    capituloAtual = cap;
    observarLeitura();
  }
  const alvo = document.getElementById(`p${n}`);
  document.querySelectorAll('.par.alvo').forEach((el) => el.classList.remove('alvo'));
  if (n !== cap.ini) alvo.classList.add('alvo');
  if (n === cap.ini) window.scrollTo({ top: 0 });
  else alvo.scrollIntoView({ block: 'start' });
  pref.gravar('ultimo', String(n));
  document.title = `§ ${n} · Catecismo`;
}

// Guarda o último § visível para "Continuar a leitura".
let observador = null;
function observarLeitura() {
  observador?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  observador = new IntersectionObserver((entradas) => {
    const vis = entradas.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.n));
    if (vis.length) pref.gravar('ultimo', String(Math.min(...vis)));
  }, { rootMargin: '0px 0px -70% 0px' });
  document.querySelectorAll('.par').forEach((el) => observador.observe(el));
}

function telaBusca(d, q) {
  const ix = obterIndice(d);
  const diretos = numerosCitados(q, d.totalParagrafos);
  const res = buscar(ix, q, 30).filter((r) => !diretos.includes(r.n));
  const rads = radicaisDaPergunta(q);
  const item = (n, partes) => {
    const cap = d.capituloDe(n);
    return `<li><a href="#/p/${n}"><span class="r-num">§ ${n}</span><span class="r-cap">${esc(cap?.titulo || cap?.tituloParte || '')}</span>
      <span class="r-trecho">${partes}</span></a></li>`;
  };
  const lista = [
    ...diretos.map((n) => item(n, esc(d.porN.get(n).texto.slice(0, 220)) + '…')),
    ...res.map((r) => item(r.n, partesHtml(trecho(d.porN.get(r.n).texto, rads)))),
  ];
  main.innerHTML = `${formBusca(q)}
    <p class="contagem">${lista.length ? `${lista.length} resultado${lista.length > 1 ? 's' : ''} para <strong>${esc(q)}</strong>` : `Nada encontrado para <strong>${esc(q)}</strong>. Tente outras palavras.`}</p>
    <ol class="resultados">${lista.join('')}</ol>`;
  ligarFormBusca();
  document.title = `${q} · Busca · Catecismo`;
}

function telaSobre(d) {
  main.innerHTML = `<section class="sobre">
    <h1>Sobre</h1>
    <p>Texto integral do <strong>Catecismo da Igreja Católica</strong> em português, conforme publicado em
      <a href="${esc(d.fonte)}" target="_blank" rel="noopener">vatican.va</a> (edição de Portugal).
      © Libreria Editrice Vaticana. Uso não comercial.</p>
    <p>O leitor funciona sem internet depois da primeira visita.</p>
    <h2>Sobre o chat</h2>
    <p>As respostas do chat são geradas por inteligência artificial (Google Gemini; Groq como reserva),
      usando apenas os parágrafos do Catecismo enviados junto com a pergunta. A IA pode errar:
      confira sempre os parágrafos citados (§), que são a fonte de verdade.</p>
    <p>A pergunta e os parágrafos são enviados a esses serviços para gerar a resposta. Nos planos gratuitos,
      eles podem usar esses dados para melhorar os seus modelos — não escreva dados pessoais nas perguntas.</p>
    <p>Dados gerados em ${esc(d.geradoEm)}.</p>
  </section>`;
}

// ---------- roteador ----------
async function rotear() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [rota, ...resto] = h.split('/');
  const arg = resto.join('/');
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === (rota || 'inicio')
    || (a.dataset.rota === 'sumario' && rota === 'p')));
  if (rota !== 'p') { capituloAtual = null; window.scrollTo({ top: 0 }); document.title = 'Catecismo da Igreja Católica'; }
  document.body.classList.toggle('modo-chat', rota === 'conversar');
  if (rota === 'conversar') return telaConversar(main, { carregar, obterIndice });
  let d;
  try {
    if (!main.querySelector('.texto, .inicio, .sumario, .resultados')) telaCarregando();
    d = await carregar();
  } catch (e) { return telaErro(e); }
  if (rota === 'p') return telaLeitor(d, Number(arg));
  if (rota === 'sumario') return telaSumario(d);
  if (rota === 'busca' && arg) return telaBusca(d, arg);
  if (rota === 'sobre') return telaSobre(d);
  return telaInicio(d);
}

// Notas de rodapé: clique no número abre/fecha a nota abaixo do §.
main.addEventListener('click', async (ev) => {
  const bt = ev.target.closest('.nota-ref');
  if (!bt) return;
  const d = await carregar();
  const art = bt.closest('.par');
  const caixa = $('.notas', art);
  const chave = bt.dataset.nota;
  const aberta = !caixa.hidden && caixa.dataset.nota === chave;
  caixa.hidden = aberta;
  caixa.dataset.nota = chave;
  caixa.innerHTML = aberta ? '' : htmlNota(d.porN.get(Number(bt.dataset.n)), chave);
  art.querySelectorAll('.nota-ref').forEach((b) => b.setAttribute('aria-expanded', String(!aberta && b === bt)));
});

// Painel do §: citações [§ N] do chat abrem o parágrafo ao lado (desktop) ou embaixo (celular).
const painel = $('#painel');
async function abrirPainel(n) {
  const d = await carregar();
  const p = d.porN.get(n);
  if (!p) return;
  const cap = d.capituloDe(n);
  $('#painel-titulo').textContent = `§ ${n}`;
  $('#painel-local').textContent = [cap?.tituloParte, cap?.titulo !== cap?.tituloParte ? cap?.titulo : ''].filter(Boolean).join(' › ');
  $('#painel-corpo').innerHTML = `<div class="texto">${htmlParagrafo(p, { comTitulos: false })}</div>`;
  $('#painel-ler').href = `#/p/${n}`;
  painel.hidden = false;
  requestAnimationFrame(() => painel.classList.add('aberto'));
  $('#painel-fechar').focus({ preventScroll: true });
}
function fecharPainel() {
  painel.classList.remove('aberto');
  setTimeout(() => { painel.hidden = true; }, 200);
}
document.addEventListener('click', (ev) => {
  const c = ev.target.closest('button.cita');
  if (c) { abrirPainel(Number(c.dataset.n)); return; }
  if (ev.target.closest('#painel-fechar') || ev.target === painel) fecharPainel();
});
$('#painel-ler').addEventListener('click', fecharPainel);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !painel.hidden) fecharPainel(); });
painel.addEventListener('click', async (ev) => {
  const bt = ev.target.closest('.nota-ref');
  if (!bt) return;
  const d = await carregar();
  const caixa = bt.closest('.par').querySelector('.notas');
  const aberta = !caixa.hidden && caixa.dataset.nota === bt.dataset.nota;
  caixa.hidden = aberta;
  caixa.dataset.nota = bt.dataset.nota;
  caixa.innerHTML = aberta ? '' : htmlNota(d.porN.get(Number(bt.dataset.n)), bt.dataset.nota);
});

window.addEventListener('hashchange', () => { if (!painel.hidden) fecharPainel(); rotear(); });
rotear();

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline indisponível */ });
}
