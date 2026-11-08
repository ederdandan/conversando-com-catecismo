// Utilitários de HTML compartilhados.

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => MAPA[c]);

// Partes [{texto, destaque}] → HTML com <mark>.
export const partesHtml = (partes) =>
  partes.map((p) => (p.destaque ? `<mark>${esc(p.texto)}</mark>` : esc(p.texto))).join('');
