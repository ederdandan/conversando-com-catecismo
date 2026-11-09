// Roteamento, telas e preferências.
import { carregar } from './dados.js';
import { htmlSumario, htmlCapitulo, htmlNota, htmlParagrafo, nomeParte, partesDe } from './leitor.js';
import { sairDaIA, telaConversar, telaEntrar, temIA } from './chat.js';
import { criarIndice, buscar, numerosCitados, radicaisDaPergunta, trecho } from './busca.js';
import { esc, partesHtml } from './html.js';
import { aoMudar, htmlInstrucoesIOS, iniciarInstalacao, instalar, modoInstalacao } from './instalar.js';
import { iniciarGestos } from './gestos.js';
import { buscarFaq, carregarFaq, htmlListaPerguntas, perguntasDoCapitulo, perguntasDoTema } from './faq.js';

const $ = (s, el = document) => el.querySelector(s);
const main = $('#conteudo');
const icone = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

// ---------- preferências (localStorage pode falhar: modo privado etc.) ----------
const pref = {
  ler(k, padrao) { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } },
  gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

// Tamanho da letra em 5 níveis (passos de ~15%, perceptíveis no celular).
const ESCALAS = [0.875, 1, 1.15, 1.3, 1.5];
function nivelFonte() {
  const atual = Number(pref.ler('fonte', '1')) || 1;
  return ESCALAS.reduce((melhor, v, i) => (Math.abs(v - atual) < Math.abs(ESCALAS[melhor] - atual) ? i : melhor), 1);
}
function aplicarFonte(nivel = nivelFonte()) {
  const i = Math.min(ESCALAS.length - 1, Math.max(0, nivel));
  document.documentElement.style.setProperty('--escala', String(ESCALAS[i]));
  pref.gravar('fonte', String(ESCALAS[i]));
  $('#ajustes .passos').innerHTML = ESCALAS.map((_, k) => `<span${k === i ? ' class="on"' : ''}></span>`).join('');
  $('#bt-menor').disabled = i === 0;
  $('#bt-maior').disabled = i === ESCALAS.length - 1;
}
// Cor da barra do navegador no celular: segue o tema escolhido (no automático, as duas <meta> por media query).
const metasCor = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]);
function aplicarTema(tema) {
  if (!['light', 'dark', 'sepia', 'auto'].includes(tema)) tema = 'auto';
  if (tema === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
  const fundo = getComputedStyle(document.documentElement).getPropertyValue('--fundo').trim();
  metasCor.forEach(([m, original]) => { m.content = tema === 'auto' ? original : fundo; });
  pref.gravar('tema', tema);
  document.querySelectorAll('#ajustes [data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === tema)));
}
aplicarFonte();
aplicarTema(pref.ler('tema', 'auto'));
// Ao mudar a letra o texto reflui: volta ao § que estava no topo da leitura.
function mudarFonte(delta) {
  aplicarFonte(nivelFonte() + delta);
  if (document.body.dataset.rota === 'p' && paragrafoVisivel) document.getElementById(`p${paragrafoVisivel}`)?.scrollIntoView({ block: 'start' });
}
$('#bt-menor').addEventListener('click', () => mudarFonte(-1));
$('#bt-maior').addEventListener('click', () => mudarFonte(1));
document.querySelectorAll('#ajustes [data-tema]').forEach((b) => b.addEventListener('click', () => aplicarTema(b.dataset.tema)));

// ---------- índice de busca (criado sob demanda) ----------
let indice = null;
const obterIndice = (d) => (indice ??= criarIndice(d.paragrafos));

// ---------- pedaços comuns ----------
const botaoAa = '<button type="button" class="bt-icone bt-aa" aria-label="Ajustes de leitura">Aa</button>';
// Ícone do app no cabeçalho das telas principais (só no celular; no computador ele já está na barra do topo).
// Não entra no leitor nem em telas com seta de voltar, para não poluir.
const iconeCab = '<a class="cab-icone" href="#/" aria-label="Início"><img src="icones/icone-192.png" alt="" width="28" height="28" /></a>';
const cabecalho = (titulo) => `<header class="cab">${iconeCab}<h1>${titulo}</h1>${botaoAa}</header>`;

function formBusca(valor = '') {
  return `<form class="busca" id="form-busca" role="search">
    <label>${icone('busca')}
      <input type="search" name="q" value="${esc(valor)}" placeholder="Buscar palavra ou nº do §" aria-label="Buscar no Catecismo" autocomplete="off" enterkeyhint="search" />
    </label>
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

// ---------- telas ----------
function telaCarregando() {
  main.innerHTML = '<div class="carregando" role="status"><span class="spinner"></span> Carregando o Catecismo…</div>';
}

function telaErro(e) {
  main.innerHTML = `<div class="aviso erro"><p>${esc(e.message)}</p><button type="button" id="bt-repetir">Tentar de novo</button></div>`;
  $('#bt-repetir').addEventListener('click', rotear);
}

function telaInicio(d) {
  const ultimo = Number(pref.ler('ultimo', '0'));
  const pct = (n) => ((n / d.totalParagrafos) * 100).toFixed(1);
  const cartaoLeitura = ultimo && d.porN.has(ultimo)
    ? `<a class="cartao-leitura" href="#/p/${ultimo}">
        <small>Continuar a leitura</small>
        <strong>${esc(d.capituloDe(ultimo)?.titulo || 'Catecismo')}</strong>
        <span class="linha-progresso"><span class="barra"><span style="width:${pct(ultimo)}%"></span></span>§ ${ultimo}</span>
      </a>`
    : `<a class="cartao-leitura" href="#/p/1">
        <small>Começar a leitura</small>
        <strong>Prólogo</strong>
        <span class="linha-progresso">§ 1 · ${d.totalParagrafos.toLocaleString('pt-BR')} parágrafos</span>
      </a>`;
  const partes = partesDe(d).filter((pt) => pt.parte > 0).map((pt) => {
    const { curto, rotulo } = nomeParte(pt.parte, pt.titulo);
    return `<a class="cartao-parte" href="#/sumario/${pt.parte}"><small>${rotulo}</small><strong>${esc(curto)}</strong></a>`;
  }).join('');
  main.innerHTML = `
    <header class="cab cab-marca">
      <a class="marca" href="#/" aria-label="Início"><img src="icones/icone-192.png" alt="" width="30" height="30" /><span>Catecismo</span></a>
      ${botaoAa}
    </header>
    <section class="inicio">
      <div>
        <h1>Catecismo da Igreja Católica</h1>
        <p class="sub">${d.totalParagrafos.toLocaleString('pt-BR')} parágrafos · texto integral</p>
      </div>
      ${formBusca()}
      ${cartaoLeitura}
      <a class="cartao-acao" href="#/conversar">
        <span class="icone-caixa">${icone('chat')}</span>
        <span class="t"><strong>Tire uma dúvida</strong><small>${temIA() ? 'Um catequista responde com o Catecismo' : 'Respostas oficiais do Compêndio do Catecismo'}</small></span>
        ${icone('dir')}
      </a>
      <a class="cartao-acao" href="#/duvidas">
        <span class="icone-caixa">${icone('duvida')}</span>
        <span class="t"><strong>Perguntas frequentes</strong><small>Dúvidas comuns sobre a fé, com a Bíblia e o Catecismo</small></span>
        ${icone('dir')}
      </a>
      <div>
        <h2 class="rotulo">As quatro partes</h2>
        <div class="grade-partes">${partes}</div>
      </div>
    </section>`;
  ligarFormBusca();
}

function telaSumario(d, parte) {
  const ultimo = Number(pref.ler('ultimo', '0'));
  const aberta = Number.isInteger(parte) ? parte : (d.capituloDe(ultimo)?.parte ?? null);
  main.innerHTML = `${cabecalho('Sumário')}<div class="tela">${formBusca()}${htmlSumario(d, { aberta, ultimo })}</div>`;
  ligarFormBusca();
  const alvo = $(`.parte[data-parte="${aberta}"]`);
  if (Number.isInteger(parte) && alvo) alvo.scrollIntoView({ block: 'start' });
  preencherFaqSumario();
}

// No sumário, depois do último capítulo de cada seção: "Perguntas frequentes · Seção N".
async function preencherFaqSumario() {
  let faq;
  try { faq = await carregarFaq(); } catch { return; }
  for (const s of faq.secoes) {
    const li = $(`.sumario li[data-fim="${s.fim}"]`);
    if (!li || li.nextElementSibling?.classList.contains('faq-li')) continue;
    const n = faq.perguntas.filter((q) => q.s === s.id).length;
    li.insertAdjacentHTML('afterend', `<li class="faq-li"><a href="#/duvidas/${s.id}">${icone('duvida')}<span>Perguntas frequentes · ${esc(nomeSecao(s))}<small>${n} dúvidas sobre esta seção</small></span>${icone('dir')}</a></li>`);
  }
}

// ---------- perguntas frequentes ----------
// "Seção 1: 'Eu creio' – 'Nós cremos'" → "Seção 1"
const nomeSecao = (s) => s.titulo.split(':')[0];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const cabVoltar = (href, rotulo, titulo, sub = '') => `<header class="cab cab-leitor">
    <a class="bt-icone" href="${href}" aria-label="${esc(rotulo)}">${icone('esq')}</a>
    <div class="cab-titulos">${sub ? `<small>${esc(sub)}</small>` : ''}<strong>${esc(titulo)}</strong></div>
    ${botaoAa}
  </header>`;

const formFaq = (valor = '') => `<form class="busca" id="form-faq" role="search">
    <label>${icone('busca')}
      <input type="search" name="q" value="${esc(valor)}" placeholder="Buscar nas perguntas frequentes" aria-label="Buscar nas perguntas frequentes" autocomplete="off" enterkeyhint="search" />
    </label>
    <button type="submit">Buscar</button>
  </form>`;

function ligarFormFaq() {
  $('#form-faq')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = new FormData(ev.target).get('q').toString().trim();
    if (q) location.hash = `#/duvidas/busca/${encodeURIComponent(q)}`;
  });
}

function htmlTemas(faq, s) {
  return `<div class="lista-acoes">${s.temas.map((t) => {
    const n = perguntasDoTema(faq, s.id, t.c).length;
    return `<a class="linha-acao" href="#/duvidas/${s.id}/${t.c}"><span class="t"><strong>${esc(t.titulo)}</strong><small>${esc(t.faixa)} · ${plural(n, 'pergunta', 'perguntas')}</small></span>${icone('dir')}</a>`;
  }).join('')}</div>`;
}

// #/duvidas · #/duvidas/s1 · #/duvidas/s1/3 · #/duvidas/cap/26 · #/duvidas/busca/<texto>
async function telaFaq(d, arg) {
  let faq;
  try { faq = await carregarFaq(); } catch (e) { return telaErro(e); }
  const [a, ...resto] = arg.split('/');
  const b = resto.join('/');
  const secao = faq.secoes.find((s) => s.id === a);
  let html;
  if (a === 'busca' && b) {
    const lista = buscarFaq(faq, b);
    html = `${cabVoltar('#/duvidas', 'Voltar às perguntas frequentes', 'Buscar', 'Perguntas frequentes')}<div class="tela faq">${formFaq(b)}
      <p class="contagem">${lista.length ? `${plural(lista.length, 'pergunta', 'perguntas')} sobre <strong>${esc(b)}</strong>` : `Nenhuma pergunta frequente sobre <strong>${esc(b)}</strong>. <a href="#/busca/${encodeURIComponent(b)}">Buscar no texto do Catecismo</a>.`}</p>
      ${htmlListaPerguntas(lista)}</div>`;
    document.title = `${b} · Perguntas frequentes`;
  } else if (a === 'cap' && d.capituloDe(Number(b))) {
    const cap = d.capituloDe(Number(b));
    const lista = perguntasDoCapitulo(faq, cap.ini, cap.fim).sort((x, y) => x.principal - y.principal);
    html = `${cabVoltar(`#/p/${cap.ini}`, 'Voltar ao capítulo', cap.titulo || cap.tituloParte, 'Dúvidas sobre o capítulo')}<div class="tela faq">
      <p class="contagem">${plural(lista.length, 'pergunta', 'perguntas')} · § ${cap.ini}–${cap.fim}, na ordem do texto</p>
      ${htmlListaPerguntas(lista)}</div>`;
  } else if (secao && b) {
    const tema = secao.temas.find((t) => String(t.c) === b);
    if (!tema) { location.replace(`#/duvidas/${secao.id}`); return; }
    const lista = perguntasDoTema(faq, secao.id, tema.c);
    html = `${cabVoltar(`#/duvidas/${secao.id}`, `Voltar à ${nomeSecao(secao)}`, tema.titulo, `${secao.parte}ª Parte · ${nomeSecao(secao)}`)}<div class="tela faq">
      <p class="contagem">${plural(lista.length, 'pergunta', 'perguntas')} · ${esc(tema.faixa)}</p>
      ${htmlListaPerguntas(lista)}</div>`;
  } else if (secao) {
    html = `${cabVoltar('#/duvidas', 'Voltar às perguntas frequentes', nomeSecao(secao), `${secao.parte}ª Parte · Perguntas frequentes`)}<div class="tela faq">
      <p class="sub">${esc(secao.titulo)} · § ${secao.ini}–${secao.fim}</p>${formFaq()}${htmlTemas(faq, secao)}</div>`;
  } else {
    html = `${cabecalho('Perguntas frequentes')}<div class="tela faq">
      <p class="sub">Dúvidas comuns de católicos, respondidas com o Catecismo, com passagens da Bíblia e uma comparação para ajudar a entender. Toque num § para ler o texto oficial.</p>
      ${formFaq()}
      ${faq.secoes.map((s) => `<section class="faq-secao"><h2 class="rotulo">${s.parte}ª Parte · ${esc(s.titulo)}</h2>${htmlTemas(faq, s)}</section>`).join('')}
      <p class="nota-sistema">As demais partes do Catecismo ainda estão sendo preparadas.</p></div>`;
  }
  main.innerHTML = html;
  ligarFormFaq();
}

// Fim do capítulo no leitor: "Dúvidas sobre este capítulo", se houver perguntas frequentes dele.
async function preencherFaqCapitulo(cap) {
  let faq;
  try { faq = await carregarFaq(); } catch { return; }
  const el = $('.faq-cap', main);
  if (!el || capituloAtual !== cap) return;
  const n = perguntasDoCapitulo(faq, cap.ini, cap.fim).length;
  if (!n) return;
  el.innerHTML = `<a class="linha-acao" href="#/duvidas/cap/${cap.ini}"><span class="icone-caixa">${icone('duvida')}</span><span class="t"><strong>Dúvidas sobre este capítulo</strong><small>${plural(n, 'pergunta frequente', 'perguntas frequentes')}, com a Bíblia e o Catecismo</small></span>${icone('dir')}</a>`;
  el.hidden = false;
}

let capituloAtual = null;
let paragrafoVisivel = 0;
function telaLeitor(d, n) {
  const p = d.porN.get(n);
  if (!p) {
    main.innerHTML = `${cabecalho('Ler')}<div class="tela"><div class="aviso">O Catecismo tem parágrafos de 1 a ${d.totalParagrafos}.</div>${formBusca(String(n))}</div>`;
    ligarFormBusca();
    return;
  }
  const cap = d.capituloDe(n);
  if (capituloAtual !== cap || !$('.texto', main)) {
    main.innerHTML = htmlCapitulo(d, cap, { comIA: temIA() });
    capituloAtual = cap;
    observarLeitura(d);
    preencherFaqCapitulo(cap);
  }
  const alvo = document.getElementById(`p${n}`);
  document.querySelectorAll('.par.alvo').forEach((el) => el.classList.remove('alvo'));
  if (n !== cap.ini) alvo.classList.add('alvo');
  if (n === cap.ini) window.scrollTo({ top: 0 });
  else {
    // Os títulos da seção vêm logo antes do §: rola até o primeiro deles para não ficarem escondidos.
    let topo = alvo;
    while (topo.previousElementSibling && !topo.previousElementSibling.classList.contains('par')) topo = topo.previousElementSibling;
    topo.scrollIntoView({ block: 'start' });
  }
  marcarLido(d, n);
  document.title = `§ ${n} · Catecismo`;
}

function marcarLido(d, n) {
  paragrafoVisivel = n;
  pref.gravar('ultimo', String(n));
  const barra = $('.cab-leitor .progresso span');
  if (barra) barra.style.width = `${((n / d.totalParagrafos) * 100).toFixed(1)}%`;
}

// Guarda o último § visível ("Continuar a leitura") e atualiza a barra de progresso.
let observador = null;
function observarLeitura(d) {
  observador?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  observador = new IntersectionObserver((entradas) => {
    const vis = entradas.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.n));
    if (vis.length) marcarLido(d, Math.min(...vis));
  }, { rootMargin: '-80px 0px -65% 0px' });
  document.querySelectorAll('.texto .par').forEach((el) => observador.observe(el));
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
  main.innerHTML = `${cabecalho('Buscar')}<div class="tela">${formBusca(q)}
    <p class="contagem">${lista.length ? `${lista.length} resultado${lista.length > 1 ? 's' : ''} para <strong>${esc(q)}</strong>` : `Nada encontrado para <strong>${esc(q)}</strong>. Tente outras palavras.`}</p>
    <ol class="resultados">${lista.join('')}</ol></div>`;
  ligarFormBusca();
  document.title = `${q} · Busca · Catecismo`;
}

// Linha "Instalar o app" na aba Mais (aparece só quando dá para instalar).
function preencherInstalar() {
  const el = $('#linha-instalar');
  if (!el) return;
  const modo = modoInstalacao();
  el.innerHTML = !modo ? '' : `
    <button type="button" class="linha-acao" id="bt-instalar"><span class="icone-caixa"><img src="icones/icone-192.png" alt="" width="28" height="28" /></span><span class="t"><strong>Instalar o app</strong><small>Na tela inicial, funciona sem internet</small></span>${icone(modo === 'ios' ? 'baixo' : 'dir')}</button>
    ${modo === 'ios' ? `<div class="instrucoes-ios" hidden>${htmlInstrucoesIOS()}</div>` : ''}`;
  $('#bt-instalar')?.addEventListener('click', () => {
    if (modo === 'nativo') instalar();
    else { const i = $('.instrucoes-ios'); i.hidden = !i.hidden; }
  });
}
aoMudar(preencherInstalar);
iniciarInstalacao();

function telaSobre(d) {
  const ia = temIA();
  main.innerHTML = `${cabecalho('Mais')}<div class="tela">
    <div class="lista-acoes">
      <div id="linha-instalar"></div>
      <button type="button" class="linha-acao abrir-ajustes"><span class="icone-caixa"><span class="aa">Aa</span></span><span class="t"><strong>Aparência do texto</strong><small>Tamanho da letra e tema</small></span>${icone('dir')}</button>
      ${ia
    ? `<button type="button" class="linha-acao" id="bt-sair-ia"><span class="icone-caixa">${icone('chat')}</span><span class="t"><strong>Sair do modo IA</strong><small>O chat volta a responder só pelo Compêndio</small></span>${icone('dir')}</button>`
    : `<a class="linha-acao" href="#/entrar"><span class="icone-caixa">${icone('chat')}</span><span class="t"><strong>Usar o catequista com IA</strong><small>Entre com seu código de convite</small></span>${icone('dir')}</a>`}
    </div>
    <section class="sobre">
      <h2>Sobre</h2>
      <p>Texto integral do <strong>Catecismo da Igreja Católica</strong> em português, conforme publicado em
        <a href="${esc(d.fonte)}" target="_blank" rel="noopener">vatican.va</a> (edição de Portugal).
        © Libreria Editrice Vaticana. Uso não comercial.</p>
      <p>O leitor funciona sem internet depois da primeira visita.</p>
      <h2>Sobre o chat</h2>
      <p>Sem código de convite, o chat responde com o <strong>Compêndio do Catecismo da Igreja Católica</strong>
        (Santa Sé, 2005) ou com as <strong>perguntas frequentes</strong> deste site: a pergunta mais parecida com a sua,
        com os parágrafos do Catecismo indicados. Funciona sem internet e não usa inteligência artificial.</p>
      <p>Com o catequista com IA, uma pergunta que já existe quase igual no Compêndio ou nas perguntas frequentes
        é respondida na hora, sem gastar a cota; se quiser, toque em "Pedir explicação ao catequista".</p>
      <p>Com código de convite, as respostas do catequista com IA são geradas por inteligência artificial (Google Gemini; Groq como reserva),
        usando apenas os parágrafos do Catecismo enviados junto com a pergunta. A IA pode errar:
        confira sempre os parágrafos citados (§), que são a fonte de verdade.</p>
      <p>A pergunta e os parágrafos são enviados a esses serviços para gerar a resposta. Nos planos gratuitos,
        eles podem usar esses dados para melhorar os seus modelos — não escreva dados pessoais nas perguntas.</p>
      <p class="nota-sistema">Dados gerados em ${esc(d.geradoEm)}.</p>
    </section></div>`;
  preencherInstalar();
  $('#bt-sair-ia')?.addEventListener('click', () => {
    sairDaIA();
    location.hash = '#/conversar';
  });
}

// ---------- roteador ----------
async function rotear() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [rota, ...resto] = h.split('/');
  const arg = resto.join('/');
  const atual = rota === 'p' || rota === 'busca' || rota === 'duvidas' ? 'sumario' : rota === 'entrar' ? 'sobre' : (rota || 'inicio');
  document.querySelectorAll('.nav a, .abas a').forEach((a) => {
    const ativo = a.dataset.rota === atual;
    a.classList.toggle('ativo', ativo);
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.rota = rota || 'inicio';
  if (rota !== 'p') { capituloAtual = null; window.scrollTo({ top: 0 }); document.title = 'Catecismo da Igreja Católica'; }
  if (rota === 'conversar') return telaConversar(main, { carregar, obterIndice });
  if (rota === 'entrar') return telaEntrar(main, { carregar, obterIndice });
  let d;
  try {
    if (!main.querySelector('.texto, .inicio, .sumario, .resultados, .faq')) telaCarregando();
    d = await carregar();
  } catch (e) { return telaErro(e); }
  if (rota === 'p') return telaLeitor(d, Number(arg));
  if (rota === 'sumario') return telaSumario(d, arg === '' ? null : Number(arg));
  if (rota === 'busca' && arg) return telaBusca(d, arg);
  if (rota === 'duvidas') return telaFaq(d, arg);
  if (rota === 'sobre') return telaSobre(d);
  return telaInicio(d);
}

// Notas de rodapé: clique no número abre/fecha a nota abaixo do §.
async function alternarNota(bt) {
  const d = await carregar();
  const art = bt.closest('.par');
  const caixa = $('.notas', art);
  const chave = bt.dataset.nota;
  const aberta = !caixa.hidden && caixa.dataset.nota === chave;
  caixa.hidden = aberta;
  caixa.dataset.nota = chave;
  caixa.innerHTML = aberta ? '' : htmlNota(d.porN.get(Number(bt.dataset.n)), chave);
  art.querySelectorAll('.nota-ref').forEach((b) => b.setAttribute('aria-expanded', String(!aberta && b === bt)));
}

// "Perguntar sobre este trecho": leva o § visível para a caixa do chat (sem enviar).
main.addEventListener('click', (ev) => {
  const nota = ev.target.closest('.nota-ref');
  if (nota) { alternarNota(nota); return; }
  if (ev.target.closest('[data-perguntar]') && paragrafoVisivel) {
    try { sessionStorage.setItem('rascunho', `Explique o § ${paragrafoVisivel}`); } catch { /* sem armazenamento */ }
  }
});

// ---------- folhas: parágrafo citado e ajustes ----------
function abrirFolha(el, foco) {
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('aberto'));
  foco?.focus({ preventScroll: true });
}
function fecharFolha(el) {
  if (el.hidden) return;
  el.classList.remove('aberto');
  setTimeout(() => { el.hidden = true; }, 200);
}

const painel = $('#painel');
const ajustes = $('#ajustes');
let painelN = 0;
async function abrirPainel(n) {
  const d = await carregar();
  const p = d.porN.get(n);
  if (!p) return;
  painelN = n;
  const cap = d.capituloDe(n);
  const { rotulo } = nomeParte(cap?.parte, cap?.tituloParte || '');
  $('#painel-titulo').textContent = `§ ${n}`;
  $('#painel-local').textContent = [rotulo, cap?.titulo !== cap?.tituloParte ? cap?.titulo : ''].filter(Boolean).join(' › ');
  $('#painel-corpo').innerHTML = `<div class="texto">${htmlParagrafo(p, { comTitulos: false })}</div>`;
  $('#painel-corpo').scrollTop = 0;
  $('#painel-ler').href = `#/p/${n}`;
  const ant = $('#painel-ant');
  const prox = $('#painel-prox');
  ant.disabled = n <= 1;
  prox.disabled = n >= d.totalParagrafos;
  $('span', ant).textContent = n > 1 ? `§ ${n - 1}` : '';
  $('span', prox).textContent = n < d.totalParagrafos ? `§ ${n + 1}` : '';
  ant.setAttribute('aria-label', `Parágrafo anterior, § ${n - 1}`);
  prox.setAttribute('aria-label', `Próximo parágrafo, § ${n + 1}`);
  if (painel.hidden) abrirFolha(painel, $('#painel-fechar'));
}
$('#painel-ant').addEventListener('click', () => abrirPainel(painelN - 1));
$('#painel-prox').addEventListener('click', () => abrirPainel(painelN + 1));
$('#painel-ler').addEventListener('click', () => fecharFolha(painel));
painel.addEventListener('click', (ev) => {
  const nota = ev.target.closest('.nota-ref');
  if (nota) alternarNota(nota);
});

document.addEventListener('click', (ev) => {
  const c = ev.target.closest('button.cita');
  if (c) { abrirPainel(Number(c.dataset.n)); return; }
  if (ev.target.closest('.bt-aa, .abrir-ajustes')) { abrirFolha(ajustes, $('#ajustes-fechar')); return; }
  if (ev.target.closest('#painel-fechar') || ev.target === painel) fecharFolha(painel);
  if (ev.target.closest('#ajustes-fechar') || ev.target === ajustes) fecharFolha(ajustes);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  fecharFolha(painel);
  fecharFolha(ajustes);
});

window.addEventListener('hashchange', async () => {
  fecharFolha(painel); fecharFolha(ajustes);
  // Troca de aba por gesto: a tela nova entra pelo lado para onde o dedo foi.
  const entrada = document.body.dataset.entrada;
  delete document.body.dataset.entrada;
  await rotear();
  if (entrada) {
    main.classList.remove('entra-dir', 'entra-esq');
    void main.offsetWidth; // reinicia a animação
    main.classList.add(entrada === 'dir' ? 'entra-dir' : 'entra-esq');
  }
});
iniciarGestos({ rotaAtual: () => document.body.dataset.rota });
rotear();

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Versão nova do app assumiu (sw.js com outra VERSAO): recarrega uma vez para usar os arquivos novos.
  // Na primeira visita não há controlador anterior, então não recarrega.
  const tinhaVersao = Boolean(navigator.serviceWorker.controller);
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaVersao || recarregou) return;
    recarregou = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { /* offline indisponível */ });
}
