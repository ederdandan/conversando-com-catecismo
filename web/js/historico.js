// Histórico da conversa neste aparelho: guardado até a pessoa tocar em "Nova conversa".
// Teto de segurança: MAX_MENSAGENS (~250 perguntas, ~1 MB; o navegador reserva ~5 MB por site).
// Se faltar espaço, descarta as mensagens mais antigas e tenta de novo, em vez de deixar de salvar em silêncio.

export const MAX_MENSAGENS = 500;

// Grava `lista` com `gravar(texto)` (que pode lançar erro de cota). Retorna quantas mensagens foram salvas.
export function salvarLista(lista, gravar, max = MAX_MENSAGENS) {
  let parte = lista.slice(-max);
  for (;;) {
    try {
      gravar(JSON.stringify(parte));
      return parte.length;
    } catch {
      if (parte.length <= 2) return 0; // sem armazenamento (modo privado etc.)
      parte = parte.slice(Math.ceil(parte.length / 4));
    }
  }
}
