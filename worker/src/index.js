// Ponto de entrada do Cloudflare Worker.
import dados from '../../web/data/catecismo.json' with { type: 'json' };
import { criarApp } from './app.js';

export { Cota } from './cota.js';

const handle = criarApp({ dados });

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      console.log(JSON.stringify({ evento: 'erro_interno', mensagem: String(e?.message || e) }));
      return new Response(JSON.stringify({ erro: 'Erro interno.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
