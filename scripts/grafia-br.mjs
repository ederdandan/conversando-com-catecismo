// Grafia do Brasil para o texto do vatican.va (edição de Portugal): só ortografia, nunca o sentido.
// "acção" → "ação", "baptismo" → "batismo", "matrimónio" → "matrimônio", "dum" → "de um"...
// Trabalha palavra a palavra, com listas fechadas de radicais, para não tocar no latim das notas
// ("actuositatem", "baptismi", "sanctus") nem em palavras que o Brasil escreve igual ("aspecto", "recepção").

// [radical de Portugal, radical do Brasil]; vale para a palavra inteira que começa pelo radical
// (com prefixos comuns: in-, re-, co-...), desde que o resto seja um final português.
const RADICAIS = [
  ['acç', 'aç'], ['reacç', 'reaç'], ['coacç', 'coaç'], ['fracç', 'fraç'], ['atracç', 'atraç'], ['distracç', 'distraç'],
  ['redacç', 'redaç'], ['infracç', 'infraç'], ['abstracç', 'abstraç'], ['direcç', 'direç'], ['protecç', 'proteç'],
  ['correcç', 'correç'], ['predilecç', 'predileç'], ['dilecç', 'dileç'], ['secç', 'seç'], ['introspecç', 'introspeç'],
  ['excepç', 'exceç'], ['adopç', 'adoç'], ['objecç', 'objeç'],
  ['acto', 'ato'], ['actu', 'atu'], ['activ', 'ativ'], ['actor', 'ator'], ['actriz', 'atriz'],
  ['afect', 'afet'], ['efectiv', 'efetiv'], ['efectu', 'efetu'], ['objectiv', 'objetiv'], ['objecto', 'objeto'], ['objecta', 'objeta'],
  ['direct', 'diret'], ['indirect', 'indiret'], ['recto', 'reto'], ['recta', 'reta'], ['rectid', 'retid'], ['rectific', 'retific'],
  ['exact', 'exat'], ['colect', 'colet'], ['atractiv', 'atrativ'], ['predilect', 'predilet'], ['tecto', 'teto'],
  ['redactor', 'redator'], ['protector', 'protetor'], ['protectora', 'protetora'], ['project', 'projet'], ['reflect', 'reflet'],
  ['contact', 'contat'], ['facto', 'fato'], ['factor', 'fator'], ['factur', 'fatur'], ['egipt', 'egit'], ['nocturn', 'noturn'],
  ['sector', 'setor'], ['selectiv', 'seletiv'], ['adjectiv', 'adjetiv'], ['abstract', 'abstrat'], ['correct', 'corret'],
  ['espectácul', 'espetácul'], ['erect', 'eret'], ['tacto', 'tato'],
  ['baptism', 'batism'], ['baptiz', 'batiz'], ['baptist', 'batist'], ['adopt', 'adot'], ['excepto', 'exceto'],
  ['óptim', 'ótim'], ['susceptív', 'suscetív'], ['sinóptic', 'sinótic'], ['carácter', 'caráter'],
  ['omnipot', 'onipot'], ['omnipresen', 'onipresen'], ['omnisci', 'onisci'],
];
// Finais latinos: palavra assim não é mexida ("actuositatem", "baptismi", "directorium", "sanctus").
const LATIM = /(?:um|us|ae|orum|arum|ibus|ionis|ionem|atem|tio|tionis|ii|smi|ctum|ctus|cti)$/;

const PREFIXOS = ['', 'in', 're', 'co', 'des', 'auto', 'inter', 'sobre', 'pré', 'pre', 'ir', 'im'];

const EXCECOES = new Set(['bénédictine', 'baptismi', 'directorium', 'actuositatem', 'redactio', 'sacrosanctum', 'omnipotens', 'omnipotentiam', 'exactis', 'générale']);

const ARTIGOS = { dum: 'de um', duma: 'de uma', duns: 'de uns', dumas: 'de umas' };

function caixa(original, nova) {
  if (original === original.toUpperCase() && original.length > 1) return nova.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return nova[0].toUpperCase() + nova.slice(1);
  return nova;
}

function palavraBR(p) {
  const m = p.toLowerCase();
  if (EXCECOES.has(m)) return p;
  if (ARTIGOS[m]) return caixa(p, ARTIGOS[m]);
  if (LATIM.test(m)) return p;
  for (const pre of PREFIXOS) {
    if (!m.startsWith(pre)) continue;
    const resto = m.slice(pre.length);
    for (const [pt, br] of RADICAIS) {
      if (resto.startsWith(pt)) {
        return caixa(p, pre + br + resto.slice(pt.length));
      }
    }
  }
  // "matrimónio", "económico", "género", "Getsémani": ó/é antes de m/n + vogal → ô/ê
  if (/[óé][mn][aeiouáéíóúâêô]/.test(m)) {
    return p.replace(/ó(?=[mn][aeiouáéíóúâêô])/g, 'ô').replace(/Ó(?=[mnMN][aeiouáéíóúâêôAEIOUÁÉÍÓÚÂÊÔ])/g, 'Ô')
      .replace(/é(?=[mn][aeiouáéíóúâêô])/g, 'ê').replace(/É(?=[mnMN][aeiouáéíóúâêôAEIOUÁÉÍÓÚÂÊÔ])/g, 'Ê');
  }
  return p;
}

export function grafiaBR(texto) {
  if (typeof texto !== 'string' || /^https?:/.test(texto)) return texto;
  return texto.replace(/\p{L}+/gu, palavraBR)
    .replace(/(?<!\p{L})(hei|hás|há|hão|haveis|hemos)-de(?!\p{L})/giu, '$1 de'); // "hei-de fazer" → "hei de fazer"
}

// Aplica em todas as strings de um objeto JSON (exceto URLs).
export function grafiaBRProfunda(v) {
  if (typeof v === 'string') return grafiaBR(v);
  if (Array.isArray(v)) return v.map(grafiaBRProfunda);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'fonte' ? x : grafiaBRProfunda(x)]));
  return v;
}
