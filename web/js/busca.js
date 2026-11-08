// Busca BM25 sobre os parágrafos do Catecismo. Sem dependências e sem DOM:
// roda no navegador (leitor e chat) e no Node (testes).

const K1 = 1.2;
const B = 0.75;
const PESO_TITULO = 1;
const PROFUNDIDADE_TITULO = 3;

// Minúsculas, sem acentos, e aproxima a grafia de Portugal da do Brasil
// (acto→ato, baptismo→batismo, acção→ação). Aplicado igualmente ao texto e à pergunta.
export function normalizar(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/c(?=t)/g, '')
    .replace(/p(?=t)/g, '')
    .replace(/cc(?=[aeiou])/g, 'c');
}

// Radicalização leve para português: plural e algumas terminações comuns.
export function radical(t) {
  if (t.length <= 3) return t;
  const regras = [
    [/mente$/, ''], [/coes$/, 'cao'], [/oes$/, 'ao'], [/aes$/, 'ao'], [/ais$/, 'al'],
    [/eis$/, 'el'], [/ois$/, 'ol'], [/ns$/, 'm'], [/(r|z|s)es$/, '$1'], [/s$/, ''],
  ];
  for (const [re, sub] of regras) {
    if (re.test(t)) {
      const r = t.replace(re, sub);
      if (r.length >= 3) return r;
    }
  }
  return t;
}

const PARADAS = new Set(
  ('a o e e de da do das dos em no na nos nas num numa um uma uns umas para pra por com que se ao aos as os ou como mais mas nao '
    + 'sua seu suas seus ele ela eles elas isso isto este esta estes estas esse essa pelo pela pelos pelas lhe lhes ja ser sao foi '
    + 'ha qual quais quando onde porque tambem nem entre sobre sem ate muito me te nos vos eu tu voce o que diz igreja catecismo '
    + 'fala ensina segundo')
    .split(' ').map(normalizar),
);

export function termos(texto) {
  const out = [];
  for (const m of normalizar(texto).matchAll(/[a-z0-9]+/g)) {
    const t = m[0];
    if (t.length < 2 || PARADAS.has(t) || /^\d+$/.test(t)) continue;
    out.push(radical(t));
  }
  return out;
}

// Números de § citados explicitamente: "§ 1849", "§§ 27-30", "parágrafo 1849", "CIC 2558".
export function numerosCitados(pergunta, total = 2865) {
  const nums = new Set();
  const re = /(?:§+|par[aá]grafos?|cic|n[º°.]?)\s*(\d{1,4})(?:\s*(?:-|a|até)\s*(\d{1,4}))?/gi;
  for (const m of pergunta.matchAll(re)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= Math.min(b, a + 9); n++) if (n >= 1 && n <= total) nums.add(n);
  }
  // Pergunta que é só um número: "1849"
  const so = pergunta.trim().match(/^(\d{1,4})$/);
  if (so && Number(so[1]) >= 1 && Number(so[1]) <= total) nums.add(Number(so[1]));
  return [...nums];
}

const semMarcas = (s) => s.replace(/\(\d{1,3}\)/g, ' ');

export function criarIndice(paragrafos) {
  const postings = new Map(); // termo -> [[iDoc, tf], ...]
  const tamanhos = new Float64Array(paragrafos.length);
  // Cada § herda os últimos títulos de seção acima dele (ex.: "ARTIGO 8 / O PECADO" vale para §1846–1876).
  // Os termos desses títulos entram com peso PESO_TITULO; epígrafes longas não contam como título.
  let herdados = [];
  paragrafos.forEach((p, i) => {
    const novos = (p.titulos || []).filter((t) => t.length <= 140);
    if (novos.length) herdados = [...herdados, ...novos].slice(-PROFUNDIDADE_TITULO);
    const ts = termos(semMarcas(p.texto));
    tamanhos[i] = ts.length;
    const tits = [...new Set(termos(herdados.join(' ')))];
    for (let k = 0; k < PESO_TITULO; k++) ts.push(...tits);
    const tf = new Map();
    for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, f] of tf) {
      let l = postings.get(t);
      if (!l) postings.set(t, (l = []));
      l.push([i, f]);
    }
  });
  const media = tamanhos.reduce((a, b) => a + b, 0) / paragrafos.length;
  return { paragrafos, postings, tamanhos, media, N: paragrafos.length };
}

// Retorna [{ n, score }] em ordem decrescente. `score` é relativo ao melhor resultado (0..1) em `relativo`.
export function buscar(indice, pergunta, limite = 10) {
  const qs = [...new Set(termos(pergunta))];
  const scores = new Map();
  for (const q of qs) {
    const l = indice.postings.get(q);
    if (!l) continue;
    const idf = Math.log(1 + (indice.N - l.length + 0.5) / (l.length + 0.5));
    for (const [i, f] of l) {
      const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * indice.tamanhos[i] / indice.media));
      scores.set(i, (scores.get(i) || 0) + idf * norm);
    }
  }
  const lista = [...scores].sort((a, b) => b[1] - a[1]).slice(0, limite);
  const melhor = lista[0]?.[1] || 1;
  return lista.map(([i, s]) => ({ n: indice.paragrafos[i].n, score: s, relativo: s / melhor }));
}

// Conjunto de radicais da pergunta, para destacar palavras no texto.
export function radicaisDaPergunta(pergunta) {
  return new Set(termos(pergunta));
}

// Trecho de ~`tam` caracteres em torno da primeira palavra encontrada.
// Retorna partes [{ texto, destaque }] para o chamador montar o HTML com escape.
export function trecho(texto, rads, tam = 240) {
  const limpo = semMarcas(texto).replace(/\s+/g, ' ').trim();
  const palavras = [...limpo.matchAll(/[\p{L}\p{N}]+/gu)];
  const acerta = (w) => {
    const t = normalizar(w);
    return t.length >= 2 && !PARADAS.has(t) && rads.has(radical(t));
  };
  const primeira = palavras.find((m) => acerta(m[0]));
  let ini = primeira ? Math.max(0, primeira.index - tam / 3) : 0;
  if (ini > 0) { const esp = limpo.indexOf(' ', ini); ini = esp >= 0 ? esp + 1 : ini; }
  let fim = Math.min(limpo.length, ini + tam);
  if (fim < limpo.length) { const esp = limpo.lastIndexOf(' ', fim); fim = esp > ini ? esp : fim; }
  const partes = [];
  let pos = ini;
  for (const m of palavras) {
    if (m.index < ini || m.index + m[0].length > fim) continue;
    if (!acerta(m[0])) continue;
    if (m.index > pos) partes.push({ texto: limpo.slice(pos, m.index), destaque: false });
    partes.push({ texto: m[0], destaque: true });
    pos = m.index + m[0].length;
  }
  if (pos < fim) partes.push({ texto: limpo.slice(pos, fim), destaque: false });
  if (ini > 0) partes.unshift({ texto: '… ', destaque: false });
  if (fim < limpo.length) partes.push({ texto: ' …', destaque: false });
  return partes;
}

// ---------- chat: sinônimos e seleção de parágrafos ----------

// Termos do dia a dia → vocabulário do Catecismo. Chaves e valores passam por normalizar().
const SINONIMOS = [
  [['casamento', 'casar', 'casal', 'noivo', 'esposa', 'marido'], 'matrimonio conjugal esposos'],
  [['confissao', 'confessar', 'confessionario'], 'penitencia reconciliacao confissao'],
  [['missa'], 'eucaristia celebracao eucaristica missa'],
  [['comunhao', 'hostia', 'comungar'], 'eucaristia comunhao'],
  [['crisma', 'crismar'], 'confirmacao crisma'],
  [['batizado', 'batizar'], 'batismo'],
  [['padre', 'padres', 'sacerdote', 'bispo', 'diacono'], 'ordem sacerdocio presbiteros bispos diaconos'],
  [['freira', 'freiras', 'monge', 'religiosa', 'religioso'], 'vida consagrada religiosa'],
  [['papa'], 'pontifice romano pedro sucessor'],
  [['nossa senhora', 'virgem', 'mae de deus'], 'maria virgem mae deus'],
  [['jesus'], 'jesus cristo'],
  [['ceu', 'paraiso'], 'ceu vida eterna'],
  [['inferno'], 'inferno condenacao'],
  [['purgatorio'], 'purgatorio purificacao final'],
  [['divorcio', 'divorciado', 'separacao'], 'divorcio matrimonio indissolubilidade'],
  [['eutanasia'], 'eutanasia morte'],
  [['mentir', 'mentiroso'], 'mentira verdade'],
  [['roubar', 'roubo', 'ladrao'], 'furto setimo mandamento'],
  [['traicao', 'trair', 'infidelidade'], 'adulterio fidelidade'],
  [['sexo', 'sexual', 'sexualidade'], 'sexualidade castidade'],
  [['pecado grave'], 'pecado mortal'],
  [['terco', 'rosario'], 'rosario oracao maria'],
  [['anjo da guarda', 'anjos'], 'anjos'],
  [['diabo', 'demonio', 'satanas', 'capeta'], 'diabo satanas demonios'],
  [['biblia'], 'sagrada escritura'],
  [['domingo'], 'domingo dia senhor'],
  [['jejum', 'jejuar'], 'jejum penitencia'],
  [['dizimo'], 'necessidades materiais igreja'],
  [['santos', 'santo'], 'santos comunhao santos'],
  [['homossexual', 'homossexuais', 'gay'], 'homossexualidade'],
  [['pena de morte'], 'pena de morte legitima defesa'],
  [['perdao', 'perdoar'], 'perdao misericordia'],
  [['rezar', 'reza', 'oracao'], 'oracao'],
  [['pai nosso'], 'oracao senhor pai nosso'],
  [['trindade'], 'santissima trindade'],
  [['morte', 'morrer'], 'morte'],
  [['dinheiro', 'riqueza', 'rico'], 'riquezas bens pobreza'],
  [['idolo', 'idolatria', 'supersticao', 'horoscopo', 'magia'], 'idolatria supersticao adivinhacao magia'],
  [['eucaristia', 'santissimo'], 'eucaristia'],
  [['uncao', 'extrema uncao', 'doente', 'doentes'], 'uncao enfermos'],
].map(([chaves, extra]) => [chaves.map(normalizar), normalizar(extra)]);

// Acrescenta à pergunta os termos do Catecismo correspondentes às palavras do dia a dia.
export function expandirPergunta(pergunta) {
  const p = ` ${normalizar(pergunta).replace(/[^a-z0-9]+/g, ' ')} `;
  const extras = SINONIMOS.filter(([chaves]) => chaves.some((c) => p.includes(` ${c} `))).map(([, e]) => e);
  return extras.length ? `${pergunta} ${extras.join(' ')}` : pergunta;
}

// A pontuação BM25 não separa bem "fora do tema" de perguntas doutrinárias curtas
// ("capital da França" pontua mais que "o que é o pecado?", por causa de "pecados capitais").
// Por isso o filtro local só descarta quando não há resultado; a recusa por tema fica com a IA.
export const SCORE_MINIMO = 1;

// Perguntas de definição ("O que é o pecado?", "O que significa graça?"): o BM25 prefere §
// que repetem a palavra, e não o que a define. Aqui procuramos frases no formato do Catecismo:
// "O pecado é…", "A graça é…", "O santo Baptismo é…", "Os sacramentos de cura são…".
const RE_DEFINICAO = /\bo que (?:e|sao|significa|significam|quer dizer)\s+(?:(?:o|a|os|as|um|uma)\s+)?([a-z][a-z ]*?)\s*$/;

// Ordem: definição que abre o § primeiro; depois as que o BM25 também acha relevantes.
export function definicoes(indice, pergunta, limite = 3, relevantes = []) {
  const m = normalizar(pergunta).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().match(RE_DEFINICAO);
  if (!m) return [];
  const termo = m[1].trim();
  if (!termo || termo.split(' ').length > 4) return [];
  indice.normalizados ??= indice.paragrafos.map((p) => normalizar(semMarcas(p.texto)));
  const frase = `(?:o|a|os|as)\\s+(?:[a-z]+\\s+)?${termo.replace(/ /g, '\\s+')}\\s+(?:e|sao)\\s`;
  const reInicio = new RegExp(`^[\\s«"(]*${frase}`);
  const reMeio = new RegExp(`[.!?;:»]\\s+${frase}`);
  const rank = new Map(relevantes.map((n, i) => [n, i]));
  const achados = [];
  indice.paragrafos.forEach((p, i) => {
    const t = indice.normalizados[i];
    const inicio = reInicio.test(t);
    if (!inicio && !reMeio.test(t)) return;
    achados.push({ n: p.n, peso: (inicio ? 2 : 0) + (rank.has(p.n) ? 1 : 0), pos: rank.get(p.n) ?? Infinity });
  });
  return achados
    .sort((a, b) => b.peso - a.peso || a.pos - b.pos || a.n - b.n)
    .slice(0, limite)
    .map((a) => a.n);
}

// Escolhe os § que vão como contexto para a IA.
//   anterior: pergunta anterior da conversa (ajuda em perguntas de seguimento: "e por quê?")
export function selecionarParagrafos(indice, pergunta, { anterior = '', limite = 8, maximo = 12, total = 2865 } = {}) {
  const diretos = numerosCitados(pergunta, total);
  let res = buscar(indice, expandirPergunta(pergunta), limite * 2);
  if (anterior && res.length < 3) {
    res = buscar(indice, expandirPergunta(`${anterior} ${pergunta}`), limite * 2);
  }
  const melhor = res[0]?.score ?? 0;
  const relevantes = melhor >= SCORE_MINIMO ? res.filter((r) => r.relativo >= 0.4).slice(0, limite).map((r) => r.n) : [];
  const defs = definicoes(indice, pergunta, 3, res.map((r) => r.n));
  const paragrafos = [...new Set([...diretos, ...defs, ...relevantes])].slice(0, maximo);
  return { paragrafos, melhor, diretos };
}
