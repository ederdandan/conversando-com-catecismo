// Semelhança entre a pergunta do usuário e perguntas já respondidas (Compêndio e perguntas frequentes).
// Jaccard ponderado pela raridade das palavras (peso das comuns ÷ peso de todas), comparadas pelo começo (ver chave).
// Exige que as duas perguntas tratem das mesmas coisas: "O que é a graça?" ≠ "O que é a graça sacramental?".
import { termos } from './busca.js';

// Até 6 letras, sem a última ("deseja"/"desejo" → "desej", "santo"/"santa" → "sant"); palavras curtas ficam inteiras.
export const chave = (t) => t.slice(0, Math.max(4, Math.min(6, t.length - 1)));
export const chaves = (texto) => new Set(termos(texto).map(chave));

// textos: as perguntas já respondidas. Retorna sim(consulta, i) ∈ [0, 1] e melhores(consulta, n).
export function criarComparador(textos) {
  const conjuntos = textos.map(chaves);
  const df = new Map();
  for (const c of conjuntos) for (const t of c) df.set(t, (df.get(t) || 0) + 1);
  const N = conjuntos.length;
  const peso = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  const total = (c) => [...c].reduce((s, t) => s + peso(t) ** 2, 0);
  const totais = conjuntos.map(total);

  const preparar = (consulta) => {
    const q = chaves(consulta);
    return { q, n: total(q) };
  };
  const simPreparada = ({ q, n }, i) => {
    if (!n || !totais[i]) return 0;
    let comum = 0;
    for (const t of q) if (conjuntos[i].has(t)) comum += peso(t) ** 2;
    return comum / (n + totais[i] - comum);
  };
  return {
    sim: (consulta, i) => simPreparada(preparar(consulta), i),
    melhores(consulta, n = 3) {
      const p = preparar(consulta);
      return conjuntos.map((_, i) => ({ i, sim: simPreparada(p, i) }))
        .filter((x) => x.sim > 0).sort((a, b) => b.sim - a.sim).slice(0, n);
    },
  };
}
