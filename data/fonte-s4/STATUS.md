# Parte II, Seção 2 (os sete sacramentos, §1210–1690): andamento

Pausado em 10/11/2026 por causa do limite de uso do NotebookLM (o limite volta à 1:01).

## Feito (validado com o texto do Catecismo)

| Lote | § | Tema | Itens |
|---|---|---|---|
| 01 | 1210–1251 | Batismo (nomes, prefigurações, celebração) | 48 |
| 02 | 1252–1284 | Batismo (quem recebe, necessidade, caráter) | 48 |
| 03 | 1285–1321 | Confirmação | 50 |
| 04 | 1322–1372 | Eucaristia (instituição, Missa, sacrifício) | 50 |
| 05 | 1373–1419 | Eucaristia (presença real, comunhão, frutos) | 50 |
| 06 | 1420–1470 | Penitência (conversão, atos do penitente) | 50 |
| 07 | 1471–1498 | Penitência (ministro, sigilo, efeitos, indulgências) | 48 |
| 08 | 1499–1532 | Unção dos Enfermos | 40 |

Total: 384 perguntas em `data/faq-parte2-secao2.json`, já publicadas em `web/data/faq.json`.

## Falta

| Lote | § | "c" | Temas | Aba sugerida |
|---|---|---|---|---|
| 09 | 1533–1600 | 6 | Ordem | C |
| 10 | 1601–1632 | 7 | Matrimônio: plano de Deus, sacramento, consentimento, forma canônica | A |
| 11 | 1633–1666 | 7 | Matrimônios mistos, vínculo, graça, unidade, indissolubilidade, fecundidade, divorciados recasados, separação, Igreja doméstica | A |
| 12 | 1667–1690 | 8 | Sacramentais, religiosidade popular, exéquias | B |

Prompt de cada lote (trocar NN, a, b, temas, c):

> Parte II, Seção 2 (os sete sacramentos), Lote NN – parágrafos a a b do Catecismo (temas). Gere DIRETAMENTE o JSON com 50 perguntas diferentes que católicos fazem sobre esses parágrafos, com "c":c, sem repetir nenhuma pergunta dos lotes anteriores desta conversa e seguindo todas as regras (somente o que está no Catecismo; grafia do Brasil; nada de números de parágrafo no texto). Responda somente com o array JSON.

As regras do chat estão em `data/fonte-s2/PROMPTS-NOTEBOOKLM.md`.

## Como continuar

1. Abrir os notebooks (conta ederdandan, `authuser=1`), com o PDF do Catecismo como única fonte:
   - A: `cb04d85c-e0fd-4b71-aa99-8a5eec6e4717`
   - B: `22ecefb6-2d19-4555-a6d9-b768ead7563f`
   - C: `939e7c14-141f-435f-8149-bcdf20449f3a`
2. Pedir o lote e copiar a resposta (botão "Copiar resposta").
3. Salvar em `data/fonte-s4/loteNN.json` e rodar `node scripts/montar-faq.mjs s4`.
4. Conferir:
   - as perguntas parecidas com as já publicadas;
   - os termos de risco (excomunhão, infalível, Papa, citações de autores);
   - tudo o que o Catecismo não diz (o NotebookLM às vezes completa com Direito Canônico).
5. Depois do lote 12:
   - rodar `npm test`;
   - subir `VERSAO` em `web/sw.js` para `catecismo-v23`;
   - fazer o commit (só quando o usuário pedir).

## Ainda sem commit

- `scripts/montar-faq.mjs` (configuração s4)
- `data/fonte-s4/`
- `data/faq-parte2-secao2.json`
- `web/data/faq.json`
