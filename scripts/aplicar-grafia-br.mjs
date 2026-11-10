// Aplica a grafia do Brasil aos dados já gerados (catecismo.json e compendio.json).
// Uso: node scripts/aplicar-grafia-br.mjs [--mostrar]  (--mostrar só lista as trocas, sem gravar)
import fs from 'node:fs';
import { grafiaBR, grafiaBRProfunda } from './grafia-br.mjs';

const mostrar = process.argv.includes('--mostrar');
for (const arq of ['web/data/catecismo.json', 'web/data/compendio.json']) {
  const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
  if (mostrar) {
    const trocas = new Map();
    const varrer = (v) => {
      if (typeof v === 'string') for (const [w] of v.matchAll(/\p{L}+/gu)) { const b = grafiaBR(w); if (b !== w) trocas.set(`${w}→${b}`, (trocas.get(`${w}→${b}`) || 0) + 1); }
      else if (v && typeof v === 'object') Object.values(v).forEach(varrer);
    };
    varrer(dados);
    console.log(`${arq}: ${trocas.size} palavras diferentes`);
    console.log([...trocas].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join('  '));
    continue;
  }
  fs.writeFileSync(arq, JSON.stringify(grafiaBRProfunda(dados)));
  console.log(`${arq}: grafia do Brasil aplicada`);
}
