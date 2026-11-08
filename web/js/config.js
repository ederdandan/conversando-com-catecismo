// Endereço da API do chat (Cloudflare Worker).
// Em produção: preencher na fase 6 com o endereço do Worker publicado.
const PRODUCAO = '';

// Desenvolvimento: `npm run dev` no worker/ sobe em http://localhost:8787.
// Para testar outra porta/endereço: localStorage.setItem('api_url', 'http://localhost:8792')
function urlApi() {
  try {
    const manual = localStorage.getItem('api_url');
    if (manual) return manual.replace(/\/$/, '');
  } catch { /* sem armazenamento */ }
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return local ? 'http://localhost:8787' : PRODUCAO;
}

export const API_URL = urlApi();
