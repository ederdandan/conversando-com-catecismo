// Métricas de uso anônimas (GoatCounter): telas vistas e alguns eventos (pergunta aberta, tema escolhido...).
// Sem cookies, sem script de terceiros e sem dados pessoais: cada contagem é um pedido simples de imagem
// ao painel https://catequeseemcancao.goatcounter.com. Sem internet, nada é enviado (e nada quebra).
const PAINEL = 'https://catequeseemcancao.goatcounter.com/count';

const desligado = () => typeof location === 'undefined'
  || !/^https?:$/.test(location.protocol)
  || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  || navigator.doNotTrack === '1';

function enviar(params) {
  try {
    if (desligado() || !navigator.onLine) return;
    const q = new URLSearchParams({
      ...params,
      s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
      rnd: Math.random().toString(36).slice(2),
    });
    new Image().src = `${PAINEL}?${q}`;
  } catch { /* métrica nunca atrapalha o app */ }
}

// Uma tela: caminho estável ("/duvidas/tema/s4-3"), nunca com dados da pessoa.
let ultima = '';
export function contarTela(caminho, titulo = '') {
  if (caminho === ultima) return; // mesma tela (ex.: rolando dentro do capítulo)
  ultima = caminho;
  // De onde a pessoa veio (Google, WhatsApp...): só na 1ª tela e só se for outro site.
  const r = !contarTela.feito && document.referrer && !document.referrer.includes(location.host) ? document.referrer : '';
  contarTela.feito = true;
  enviar({ p: caminho, t: titulo, r });
}

// Um evento ("tema/manto", "duvida/compartilhada"): aparece na lista de eventos do painel.
export function contarEvento(nome, titulo = '') {
  enviar({ p: nome, t: titulo, e: 'true' });
}
