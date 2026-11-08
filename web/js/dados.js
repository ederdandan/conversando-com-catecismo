// Carrega o catecismo.json uma única vez e prepara estruturas de navegação.

let promessa = null;

export function carregar() {
  if (!promessa) {
    promessa = fetch('data/catecismo.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar o Catecismo (HTTP ${r.status})`);
        return r.json();
      })
      .then(preparar)
      .catch((e) => { promessa = null; throw e; });
  }
  return promessa;
}

function preparar(d) {
  const porN = new Map(d.paragrafos.map((p) => [p.n, p]));
  // Capítulos na ordem do texto, com o intervalo de § de cada um.
  const capitulos = [];
  for (const p of d.paragrafos) {
    const ult = capitulos[capitulos.length - 1];
    if (ult && ult.parte === p.parte && ult.capitulo === p.capitulo) { ult.fim = p.n; continue; }
    const parte = d.partes.find((x) => x.numero === p.parte);
    capitulos.push({
      indice: capitulos.length,
      parte: p.parte,
      capitulo: p.capitulo,
      tituloParte: parte?.titulo ?? '',
      titulo: parte?.capitulos[p.capitulo] ?? '',
      ini: p.n,
      fim: p.n,
    });
  }
  const capituloDe = (n) => capitulos.find((c) => n >= c.ini && n <= c.fim) ?? null;
  return { ...d, porN, capitulos, capituloDe };
}
