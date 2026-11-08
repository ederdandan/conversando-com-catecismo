// Roteamento, telas e preferências.
import { carregar } from './dados.js';
import { htmlSumario, htmlCapitulo, htmlNota, htmlParagrafo, nomeParte, partesDe } from './leitor.js';
import { telaConversar } from './chat.js';
import { criarIndice, buscar, numerosCitados, radicaisDaPergunta, trecho } from './busca.js';
import { esc, partesHtml } from './html.js';

const $ = (s, el = document) => el.querySelector(s);
const main = $('#conteudo');
const icone = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

// ---------- preferências (localStorage pode falhar: modo privado etc.) ----------
const pref = {
  ler(k, padrao) { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } },
  gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

// Tamanho da letra em 5 níveis.
const ESCALAS = [0.9, 1, 1.1, 1.2, 1.35];
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
function aplicarTema(tema) {
  if (tema === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
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
const cabecalho = (titulo) => `<header class="cab"><h1>${titulo}</h1>${botaoAa}</header>`;

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
      <a class="marca" href="#/" aria-label="Início"><img src="icone.svg" alt="" width="30" height="30" /><span>Catecismo</span></a>
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
        <span class="t"><strong>Tire uma dúvida</strong><small>Um catequista responde com o Catecismo</small></span>
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
    main.innerHTML = htmlCapitulo(d, cap);
    capituloAtual = cap;
    observarLeitura(d);
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

function telaSobre(d) {
  const temCodigo = Boolean(pref.ler('codigo', ''));
  main.innerHTML = `${cabecalho('Mais')}<div class="tela">
    <div class="lista-acoes">
      <button type="button" class="linha-acao abrir-ajustes"><span class="icone-caixa"><span class="aa">Aa</span></span><span class="t"><strong>Aparência do texto</strong><small>Tamanho da letra e tema</small></span>${icone('dir')}</button>
      ${temCodigo ? `<button type="button" class="linha-acao" id="bt-trocar-codigo"><span class="icone-caixa">${icone('chat')}</span><span class="t"><strong>Trocar código de convite</strong><small>Sai do chat neste aparelho</small></span>${icone('dir')}</button>` : ''}
    </div>
    <section class="sobre">
      <h2>Sobre</h2>
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
      <p class="nota-sistema">Dados gerados em ${esc(d.geradoEm)}.</p>
    </section></div>`;
  $('#bt-trocar-codigo')?.addEventListener('click', () => {
    pref.gravar('codigo', null);
    location.hash = '#/conversar';
  });
}

// ---------- roteador ----------
async function rotear() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [rota, ...resto] = h.split('/');
  const arg = resto.join('/');
  const atual = rota === 'p' || rota === 'busca' ? 'sumario' : (rota || 'inicio');
  document.querySelectorAll('.nav a, .abas a').forEach((a) => {
    const ativo = a.dataset.rota === atual;
    a.classList.toggle('ativo', ativo);
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.rota = rota || 'inicio';
  if (rota !== 'p') { capituloAtual = null; window.scrollTo({ top: 0 }); document.title = 'Catecismo da Igreja Católica'; }
  if (rota === 'conversar') return telaConversar(main, { carregar, obterIndice });
  let d;
  try {
    if (!main.querySelector('.texto, .inicio, .sumario, .resultados')) telaCarregando();
    d = await carregar();
  } catch (e) { return telaErro(e); }
  if (rota === 'p') return telaLeitor(d, Number(arg));
  if (rota === 'sumario') return telaSumario(d, arg === '' ? null : Number(arg));
  if (rota === 'busca' && arg) return telaBusca(d, arg);
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

window.addEventListener('hashchange', () => { fecharFolha(painel); fecharFolha(ajustes); rotear(); });
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
