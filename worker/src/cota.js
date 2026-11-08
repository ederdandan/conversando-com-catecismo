// Durable Object com os contadores diários de uso (um único objeto para o app inteiro).
// Sem imports de "cloudflare:workers" para poder ser testado no Node.
//
// POST { acao: 'consumir' | 'devolver' | 'consultar', chave, limite, limiteGlobal, dia }

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export class Cota {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const { acao, chave, limite, limiteGlobal, dia } = await request.json();
    // Virou o dia: zera tudo (os contadores só valem para o dia corrente).
    if ((await this.storage.get('dia')) !== dia) {
      await this.storage.deleteAll();
      await this.storage.put('dia', dia);
    }
    const kc = `c:${chave}`;
    const kg = 'global';
    const usados = (await this.storage.get(kc)) ?? 0;
    const global = (await this.storage.get(kg)) ?? 0;

    if (acao === 'consumir') {
      if (usados >= limite) return json({ ok: false, motivo: 'limite_codigo', usados, limite });
      if (global >= limiteGlobal) return json({ ok: false, motivo: 'limite_global' });
      await this.storage.put({ [kc]: usados + 1, [kg]: global + 1 });
      return json({ ok: true, usados: usados + 1, limite, restantes: limite - usados - 1 });
    }
    if (acao === 'devolver') {
      await this.storage.put({ [kc]: Math.max(0, usados - 1), [kg]: Math.max(0, global - 1) });
      return json({ ok: true });
    }
    if (acao === 'consultar') return json({ ok: true, usados, limite, restantes: Math.max(0, limite - usados) });
    return json({ ok: false, motivo: 'acao_invalida' }, 400);
  }
}
