// Convite para instalar o app (PWA).
// - Chrome/Edge/Android/Samsung: usa o evento `beforeinstallprompt` e abre o diálogo nativo de instalação.
// - iPhone/iPad (Safari não tem esse evento): mostra o passo a passo "Compartilhar → Adicionar à Tela de Início".
// - Já instalado (aberto como app): não mostra nada.
// Ao tocar "Agora não", o aviso só volta depois de DIAS_PAUSA dias; a opção continua na aba Mais.

import { contarEvento } from './metricas.js';

const DIAS_PAUSA = 14;
const CHAVE = 'instalar_pausa_ate';

let eventoInstalar = null;
const ouvintes = new Set();

const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// iOS e iPadOS (este se apresenta como Mac com tela de toque).
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 'nativo' (há diálogo do navegador), 'ios' (instruções) ou null (não dá para oferecer).
export function modoInstalacao() {
  if (instalado()) return null;
  if (eventoInstalar) return 'nativo';
  if (ehIOS()) return 'ios';
  return null;
}

export function aoMudar(fn) { ouvintes.add(fn); }
const avisar = () => ouvintes.forEach((fn) => fn(modoInstalacao()));

export async function instalar() {
  if (!eventoInstalar) return false;
  const ev = eventoInstalar;
  eventoInstalar = null;
  ev.prompt();
  const { outcome } = await ev.userChoice;
  avisar();
  return outcome === 'accepted';
}

const icone = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

// Ícone de "Compartilhar" do Safari, para a pessoa reconhecer o botão.
const COMPARTILHAR = `<svg class="ic ic-compartilhar" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function htmlInstrucoesIOS() {
  return `<ol class="passos-ios">
      <li>Toque em <strong>Compartilhar</strong> ${COMPARTILHAR} na barra do Safari.</li>
      <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
      <li>Toque em <strong>Adicionar</strong>.</li>
    </ol>`;
}

function fecharAviso(pausar) {
  const el = document.getElementById('aviso-instalar');
  if (!el) return;
  if (pausar) gravar(CHAVE, String(Date.now() + DIAS_PAUSA * 864e5));
  el.classList.remove('visivel');
  setTimeout(() => el.remove(), 250);
}

function mostrarAviso() {
  const modo = modoInstalacao();
  if (!modo || document.getElementById('aviso-instalar')) return;
  if (Number(ler(CHAVE) || 0) > Date.now()) return;
  const el = document.createElement('aside');
  el.id = 'aviso-instalar';
  el.className = 'aviso-instalar';
  el.setAttribute('aria-label', 'Instalar o aplicativo');
  el.innerHTML = `
    <img src="icones/icone-192.png" alt="" width="48" height="48" />
    <div class="t">
      <strong>Instale o Catecismo</strong>
      <span>${modo === 'ios' ? 'Tenha o app na tela de início e leia mesmo sem internet.' : 'Abra direto da tela inicial e leia mesmo sem internet.'}</span>
      ${modo === 'ios' ? `<details><summary>Como instalar</summary>${htmlInstrucoesIOS()}</details>` : ''}
    </div>
    <div class="acoes">
      ${modo === 'nativo' ? '<button type="button" class="bt-pri" data-acao="instalar">Instalar</button>' : ''}
      <button type="button" class="bt-icone suave" data-acao="fechar" aria-label="Agora não" title="Agora não">${icone('fechar')}</button>
    </div>`;
  el.addEventListener('click', async (ev) => {
    const acao = ev.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') fecharAviso(true);
    if (acao === 'instalar') { fecharAviso(false); await instalar(); }
  });
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visivel')));
}

// O convite flutuante só aparece no celular e depois de a pessoa usar o site (3 telas),
// para não cobrir o conteúdo logo na chegada. No computador, a opção fica só na aba Mais.
const TELAS_ANTES = 3;
let telas = 0;
const celular = () => matchMedia('(max-width: 760px)').matches;
function talvezMostrar() {
  if (telas >= TELAS_ANTES && celular()) mostrarAviso();
}

export function iniciarInstalacao() {
  if (instalado()) return;
  window.addEventListener('hashchange', () => { telas += 1; setTimeout(talvezMostrar, 1200); });
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault(); // usamos o nosso aviso em vez da mini barra do navegador
    eventoInstalar = ev;
    avisar();
    setTimeout(talvezMostrar, 1200);
  });
  window.addEventListener('appinstalled', () => {
    contarEvento('app/instalado', 'Instalação do app');
    eventoInstalar = null;
    fecharAviso(false);
    avisar();
  });
  if (ehIOS()) setTimeout(talvezMostrar, 1500);
}
