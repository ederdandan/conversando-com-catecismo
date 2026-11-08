// Lista os modelos disponíveis para as chaves em .dev.vars (não imprime as chaves).
// Uso: npm run modelos
import fs from 'node:fs';

const vars = Object.fromEntries(
  fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => /^\s*[A-Z_]+\s*=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

async function listar(nome, chave, url, filtro) {
  if (!chave || chave.startsWith('cole-aqui')) { console.log(`${nome}: chave não configurada`); return; }
  const r = await fetch(url, { headers: { Authorization: `Bearer ${chave}` } });
  if (!r.ok) { console.log(`${nome}: erro HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`); return; }
  const { data } = await r.json();
  const ids = data.map((m) => m.id.replace(/^models\//, '')).filter(filtro).sort();
  console.log(`${nome}:`);
  for (const id of ids) console.log('  ', id);
}

await listar('Gemini (flash)', vars.GEMINI_API_KEY,
  'https://generativelanguage.googleapis.com/v1beta/openai/models', (id) => /flash/i.test(id));
await listar('Groq', vars.GROQ_API_KEY,
  'https://api.groq.com/openai/v1/models', (id) => !/whisper|tts|guard|orpheus|playai/i.test(id));
