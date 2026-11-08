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

export function htmlSumario(d) {
  const partes = [];
  for (const c of d.capitulos) {
    let pt = partes[partes.length - 1];
    if (!pt || pt.parte !== c.parte) partes.push((pt = { parte: c.parte, titulo: c.tituloParte, caps: [] }));
    pt.caps.push(c);
  }
  return `<nav class="sumario" aria-label="Sumário">${partes.map((pt) => `
    <section>
      <h2>${esc(pt.titulo)}</h2>
      <ol>${pt.caps.map((c) => `
        <li><a href="#/p/${c.ini}"><span>${esc(c.titulo || pt.titulo)}</span><small>§ ${c.ini}–${c.fim}</small></a></li>`).join('')}
      </ol>
    </section>`).join('')}
  </nav>`;
}

export function htmlCapitulo(d, cap) {
  const ps = [];
  for (let n = cap.ini; n <= cap.fim; n++) ps.push(htmlParagrafo(d.porN.get(n)));
  const ant = d.capitulos[cap.indice - 1];
  const prox = d.capitulos[cap.indice + 1];
  const nav = `<nav class="cap-nav" aria-label="Capítulos">
    ${ant ? `<a href="#/p/${ant.ini}" rel="prev">← ${esc(ant.titulo)}</a>` : '<span></span>'}
    ${prox ? `<a href="#/p/${prox.ini}" rel="next">${esc(prox.titulo)} →</a>` : '<span></span>'}
  </nav>`;
  return `<div class="trilha"><a href="#/sumario">Sumário</a> › ${esc(cap.tituloParte)}${cap.titulo && cap.titulo !== 'Prólogo' ? ` › ${esc(cap.titulo)}` : ''}</div>
    <div class="texto">${ps.join('')}</div>${nav}`;
}
