# Perguntas frequentes – Parte I, Seção 2 (§ 185–1065): prompts para o NotebookLM

Meta: **1.000 perguntas em 20 lotes de 50**, salvas como `data/fonte-s2/lote01.json` … `lote20.json`.
Fonte do caderno: **somente o Catecismo** (de preferência as páginas do vatican.va, que trazem as notas com as citações bíblicas).

## 1. Regras fixas (colar uma vez em "Configurar chat" → "Personalizado")

```
Você gera perguntas e respostas frequentes de católicos, em português do Brasil, baseadas EXCLUSIVAMENTE no Catecismo da Igreja Católica (CIC), que é a fonte deste caderno.

REGRAS:
1. Nunca invente informação que não esteja na fonte. A resposta deve ser fiel ao que o Catecismo diz, sem opinião pessoal e sem exagerar o que o texto afirma (ex.: não chame de "infalível" o que o Catecismo não chama; não atribua frases a santos se o Catecismo não as atribui).
2. Cada resposta tem de 2 a 4 frases, em linguagem simples e acessível, com grafia do Brasil ("batismal", "Niceia", "onipotente").
3. Misture perguntas doutrinárias com dúvidas práticas reais de católicos.
4. Cada pergunta deve tratar de um conteúdo DIFERENTE, inclusive em relação aos lotes anteriores desta conversa. Proibido: repetir a pergunta com outro prefixo, reformular a mesma dúvida com outras palavras ou repetir a mesma resposta com outra abertura.
5. "cic": somente os números de parágrafos que realmente fundamentam a resposta, de preferência dentro da faixa do lote, em faixas curtas (ex.: "234-237"). Confira se o número citado trata mesmo do assunto.
6. "b": de 1 a 3 referências bíblicas corretas e diretamente ligadas ao tema, no formato "Livro cap,vers" com abreviações brasileiras: Gn, Ex, Lv, Nm, Dt, Js, Jz, 1Sm, 2Sm, 1Rs, 2Rs, Tb, Jt, 2Mc, Jó, Sl, Pr, Ecl, Ct, Sb, Eclo, Is, Jr, Lm, Ez, Dn, Os, Jl, Mq, Ml, Mt, Mc, Lc, Jo, At, Rm, 1Cor, 2Cor, Gl, Ef, Fl, Cl, 1Ts, 2Ts, 1Tm, 2Tm, Tt, Hb, Tg, 1Pd, 2Pd, 1Jo, Jd, Ap. Prefira versículos citados pelo Catecismo; se não houver, use passagens conhecidas. Nunca deixe a lista vazia. Atenção: "Jo" é João; "Jn" é Jonas.
7. "a": UMA analogia do cotidiano, específica para aquela pergunta. Nunca repita nem reaproveite analogias.
8. Não cite YOUCAT, A Fé Explicada nem qualquer outra obra.
9. NUNCA coloque números de parágrafos dentro do texto da pergunta ou da resposta (nada de "(CIC 95)").
10. Quando eu pedir JSON, responda SOMENTE com o array JSON válido, sem texto antes ou depois, sem bloco de código e sem marcas de citação [1].

FORMATO DE CADA ITEM DO JSON:
{"c":1,"p":"Pergunta terminando com ponto de interrogação?","r":"Resposta.","b":["Jo 1,14"],"cic":["232","233"],"a":"Analogia."}
```

## 2. Como pedir cada lote

Use **uma conversa por bloco de "c"** (lotes 01–06 numa conversa, 07–12 em outra, e assim por diante), para ele lembrar o que já gerou sem a conversa ficar longa demais.

**Etapa 1 (lista):**
```
Lote NN – parágrafos X a Y do Catecismo (TEMAS).
Liste 50 perguntas diferentes que católicos fazem sobre esses parágrafos, sem repetir nenhuma dos lotes anteriores desta conversa. Apenas as perguntas, numeradas.
```
Revise a lista; peça para trocar as parecidas.

**Etapa 2 (JSON):**
```
Agora gere o JSON dessas 50 perguntas, com "c":C.
```

## 3. Tabela dos lotes

| Lote | Parágrafos | Temas | "c" |
|---|---|---|---|
| 01 | 185–231 | Os Símbolos da fé; creio em um só Deus; o nome revelado ("Eu sou"); Deus é Verdade e Amor | 1 |
| 02 | 232–267 | A Santíssima Trindade: revelação, dogma, missões divinas | 1 |
| 03 | 268–308 | Deus todo-poderoso; o Criador; a criação a partir do nada; a providência | 1 |
| 04 | 309–354 | O problema do mal; providência e causas segundas; os anjos; o mundo visível | 1 |
| 05 | 355–384 | O homem: imagem de Deus, corpo e alma, homem e mulher, o estado original | 1 |
| 06 | 385–421 | A queda: a realidade do pecado, a queda dos anjos, o pecado original | 1 |
| 07 | 422–455 | Jesus Cristo: os nomes Jesus, Cristo, Filho único de Deus, Senhor | 2 |
| 08 | 456–483 | Por que o Verbo se fez carne; verdadeiro Deus e verdadeiro homem; heresias cristológicas | 2 |
| 09 | 484–511 | Concebido pelo Espírito Santo, nascido da Virgem Maria; Imaculada Conceição; virgindade de Maria; maternidade divina | 2 |
| 10 | 512–570 | Os mistérios da vida de Cristo: infância, vida oculta, batismo, tentações, anúncio do Reino, Transfiguração, entrada em Jerusalém | 2 |
| 11 | 571–630 | Paixão: Jesus e Israel, julgamento, morte redentora, sepultura | 2 |
| 12 | 631–682 | Desceu à mansão dos mortos; ressuscitou; subiu aos céus; virá julgar os vivos e os mortos | 2 |
| 13 | 683–747 | O Espírito Santo: missão, nomes, símbolos, ação na história da salvação e na Igreja | 3 |
| 14 | 748–780 | A Igreja no plano de Deus: nomes e imagens, origem, mistério, sacramento universal de salvação | 4 |
| 15 | 781–810 | A Igreja, Povo de Deus, Corpo de Cristo e Templo do Espírito Santo; os carismas | 4 |
| 16 | 811–870 | Una, santa, católica e apostólica; ecumenismo; "fora da Igreja não há salvação"; missão | 4 |
| 17 | 871–945 | Os fiéis: hierarquia (Papa, bispos, colegialidade, infalibilidade), leigos, vida consagrada | 4 |
| 18 | 946–975 | A comunhão dos santos; Maria, Mãe de Cristo e Mãe da Igreja (Assunção, intercessão, culto) | 4 |
| 19 | 976–1019 | A remissão dos pecados; a ressurreição da carne; morrer em Cristo | 5 |
| 20 | 1020–1065 | A vida eterna: juízo particular, céu, purificação final (purgatório), inferno, juízo final, novos céus e nova terra; "Amém" | 5 |

## 4. Depois de cada lote

1. Salve a resposta como `data/fonte-s2/loteNN.json`.
2. Rode `node scripts/montar-faq.mjs s2`. Ele aponta JSON quebrado, duplicatas, perguntas parecidas, citações bíblicas mal formatadas, § inexistentes e faixas largas.
3. No fim, peça ao Claude para revisar o conteúdo de todos os lotes antes de publicar.

**Se algo der errado:**
- Resposta cortada: `Continue o JSON a partir do item onde parou, sem repetir os anteriores.`
- Erro do script: `Corrija estes itens e me devolva o JSON completo do lote: [cole o erro]`
