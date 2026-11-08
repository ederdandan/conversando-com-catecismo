// Gestos de arrastar para o lado, no celular, para trocar de aba: Início ⇄ Ler ⇄ Conversar ⇄ Mais.
// Arrastar para a esquerda → próxima aba; para a direita → aba anterior.
// Desligado: no leitor (arrastar o texto é fácil de acontecer sem querer; lá as setas trocam de capítulo),
// com folha aberta, em campos de texto, em listas que rolam para o lado e na beirada da tela
// (no iPhone, a beirada é o "voltar" do Safari).

export const ABAS = ['inicio', 'sumario', 'conversar', 'sobre'];
const HREF = { inicio: '#/', sumario: '#/sumario', conversar: '#/conversar', sobre: '#/sobre' };

// Aba a que cada rota pertence (a busca é parte de "Ler"; "Entrar" é parte de "Mais"). null = sem gesto.
export function abaDaRota(rota) {
  if (!rota || rota === 'inicio') return 'inicio';
  if (rota === 'sumario' || rota === 'busca') return 'sumario';
  if (rota === 'conversar') return 'conversar';
  if (rota === 'sobre' || rota === 'entrar') return 'sobre';
  return null; // leitor (p) e outras
}

// Aba vizinha: dir = +1 (próxima) ou -1 (anterior). null nas pontas.
export function abaVizinha(aba, dir) {
  const i = ABAS.indexOf(aba);
  if (i < 0) return null;
  return ABAS[i + dir] ?? null;
}

// É um gesto de troca de aba? Horizontal, longo o bastante e rápido.
// Retorna +1 (foi para a esquerda → próxima), -1 (para a direita → anterior) ou 0.
export function direcaoDoGesto({ dx, dy, dt }) {
  if (dt > 700) return 0;
  if (Math.abs(dx) < 70) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.8) return 0;
  return dx < 0 ? 1 : -1;
}

const BEIRADA = 24; // px
const IGNORAR = 'input, textarea, select, [contenteditable], .fontes-lista, .painel, .aviso-instalar, .aviso-desfazer';

export function iniciarGestos({ rotaAtual, celular = () => matchMedia('(max-width: 760px)').matches }) {
  let ini = null;
  document.addEventListener('touchstart', (ev) => {
    ini = null;
    if (ev.touches.length !== 1 || !celular()) return;
    const t = ev.touches[0];
    if (t.clientX < BEIRADA || t.clientX > window.innerWidth - BEIRADA) return;
    if (ev.target.closest?.(IGNORAR)) return;
    if (document.querySelector('.painel:not([hidden])')) return; // folha aberta
    if (!abaDaRota(rotaAtual())) return;
    ini = { x: t.clientX, y: t.clientY, t: performance.now() };
  }, { passive: true });

  document.addEventListener('touchend', (ev) => {
    if (!ini) return;
    const t = ev.changedTouches[0];
    const dir = direcaoDoGesto({ dx: t.clientX - ini.x, dy: t.clientY - ini.y, dt: performance.now() - ini.t });
    ini = null;
    if (!dir || String(window.getSelection?.() || '').length) return; // seleção de texto não troca de aba
    const destino = abaVizinha(abaDaRota(rotaAtual()), dir);
    if (!destino) return;
    document.body.dataset.entrada = dir > 0 ? 'dir' : 'esq'; // animação: a tela nova entra do lado do gesto
    location.hash = HREF[destino];
  }, { passive: true });

  document.addEventListener('touchcancel', () => { ini = null; }, { passive: true });
}
