// Renderização do leitor: sumário, capítulo e parágrafo.
import { esc } from './html.js';

// Classifica um título da fonte em nível visual.
function htmlTitulo(t) {
  const s = esc(t);
  if (t.length > 140) return `<blockquote class="epigrafe">${s}</blockquote>`;
  if (/^(PR[ÓO]LOGO|(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA) PARTE)/i.test(t)) return `<h2 class="t-parte">${s}</h2>`;
  if (/^(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA)? ?SEC[ÇC][ÃA]O\b|^CAP[ÍI]TULO\b|^ARTIGO\b|^PAR[ÁA]GRAFO\b/i.test(t)) return `<p class="t-rotulo">${s}</p>`;
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3}/.test(t)) return `<h3 class="t-secao">${s}</h3>`;
  if (/^[IVXL]+\.\s/.test(t)) return `<h4 class="t-sub">${s}</h4>`;
  return `<h5 class="t-menor">${s}</h5>`;
}

// Marcadores "(N)" viram botões quando a nota existe.
function comNotas(textoEsc, p) {
  if (!p.notas) return textoEsc;
  const tem = new Set(p.notas.map((x) => x.n));
  return textoEsc.replace(/\((\d{1,3})\)/g, (m, n) =>
    tem.has(Number(n))
      ? `<button type="button" class="nota-ref" data-n="${p.n}" data-nota="${n}" aria-label="Nota ${n}">${n}</button>`
      : m);
}

export function htmlParagrafo(p, { comTitulos = true } = {}) {
  const titulos = comTitulos ? (p.titulos || []).map(htmlTitulo).join('') : '';
  const blocos = p.texto.split('\n').map((t, i) =>
    `<p>${i === 0 ? `<a class="num" href="#/p/${p.n}" aria-label="Parágrafo ${p.n}">${p.n}</a> ` : ''}${comNotas(esc(t), p)}</p>`).join('');
  const resumo = p.resumo ? ' resumo' : '';
  return `${titulos}<article class="par${resumo}" id="p${p.n}" data-n="${p.n}">${blocos}<div class="notas" hidden></div></article>`;
}

export function htmlNota(p, numero) {
  const nota = p.notas?.find((x) => x.n === Number(numero));
  return nota ? `<p><span class="nota-n">${nota.n}.</span> ${esc(nota.texto)}</p>` : '';
}

const icone = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

// "Terceira Parte — A Vida em Cristo" → { curto: "A Vida em Cristo", rotulo: "3ª Parte" }
export function nomeParte(parte, tituloParte) {
  if (!parte) return { curto: 'Prólogo', rotulo: 'Prólogo' };
  return { curto: tituloParte.split(/\s+[—–-]\s+/).slice(1).join(' — ') || tituloParte, rotulo: `${parte}ª Parte` };
}

export function partesDe(d) {
  const partes = [];
  for (const c of d.capitulos) {
    let pt = partes[partes.length - 1];
    if (!pt || pt.parte !== c.parte) partes.push((pt = { parte: c.parte, titulo: c.tituloParte, caps: [] }));
    pt.caps.push(c);
  }
  return partes;
}

// Sumário em sanfona: cada parte abre e fecha. `aberta` = número da parte aberta; `ultimo` = § onde parou.
export function htmlSumario(d, { aberta = null, ultimo = 0 } = {}) {
  return `<nav class="sumario" aria-label="Sumário">${partesDe(d).map((pt) => {
    const { curto, rotulo } = nomeParte(pt.parte, pt.titulo);
    const info = pt.parte
      ? `${rotulo} · ${pt.caps.length} capítulos`
      : `§ ${pt.caps[0].ini}–${pt.caps.at(-1).fim}`;
    return `
    <details class="parte" data-parte="${pt.parte}"${pt.parte === aberta ? ' open' : ''}>
      <summary><span class="t"><b>${esc(curto)}</b><small>${info}</small></span>${icone('baixo')}</summary>
      <ol>${pt.caps.map((c) => {
        const aqui = ultimo >= c.ini && ultimo <= c.fim;
        return `
        <li data-fim="${c.fim}"><a href="#/p/${aqui ? ultimo : c.ini}"${aqui ? ' class="atual"' : ''}><span>${esc(c.titulo || pt.titulo)}${aqui ? `<small class="parou">Você parou aqui · § ${ultimo}</small>` : ''}</span><small>§ ${c.ini}</small></a></li>`;
      }).join('')}
      </ol>
    </details>`;
  }).join('')}
  </nav>`;
}

// comIA: "Perguntar sobre este trecho" só aparece com o catequista (IA); sem ele, o centro da barra leva ao sumário.
export function htmlCapitulo(d, cap, { comIA = false } = {}) {
  const ps = [];
  for (let n = cap.ini; n <= cap.fim; n++) ps.push(htmlParagrafo(d.porN.get(n)));
  const ant = d.capitulos[cap.indice - 1];
  const prox = d.capitulos[cap.indice + 1];
  const { rotulo, curto } = nomeParte(cap.parte, cap.tituloParte);
  const titulo = cap.titulo || curto;
  const pct = ((cap.ini / d.totalParagrafos) * 100).toFixed(1);
  const nav = `<nav class="cap-nav" aria-label="Capítulos">
    ${ant ? `<a href="#/p/${ant.ini}" rel="prev">← ${esc(ant.titulo)}</a>` : '<span></span>'}
    ${prox ? `<a href="#/p/${prox.ini}" rel="next">${esc(prox.titulo)} →</a>` : '<span></span>'}
  </nav>`;
  const seta = (c, dir, rotuloSeta) => (c
    ? `<a class="bt-icone" href="#/p/${c.ini}" aria-label="${rotuloSeta}: ${esc(c.titulo)}">${icone(dir)}</a>`
    : `<span class="bt-icone" aria-hidden="true"></span>`);
  return `<header class="cab cab-leitor">
      <a class="bt-icone" href="#/sumario/${cap.parte}" aria-label="Voltar ao sumário">${icone('esq')}</a>
      <div class="cab-titulos"><small>${esc(rotulo)}${cap.parte ? ` · ${esc(curto)}` : ''}</small><strong>${esc(titulo)}</strong></div>
      <button type="button" class="bt-icone bt-aa" aria-label="Ajustes de leitura">Aa</button>
      <div class="progresso" aria-hidden="true"><span style="width:${pct}%"></span></div>
    </header>
    <div class="texto">${ps.join('')}</div><div class="faq-cap" hidden></div>${nav}
    <div class="barra-leitura">
      ${seta(ant, 'esq', 'Capítulo anterior')}
      ${comIA
    ? `<a class="perguntar" href="#/conversar" data-perguntar>${icone('chat')}<span>Perguntar sobre este trecho</span></a>`
    : `<a class="perguntar" href="#/sumario/${cap.parte}">${icone('livro')}<span>Sumário</span></a>`}
      ${seta(prox, 'dir', 'Próximo capítulo')}
    </div>`;
}
