# Revisão por amostragem das perguntas frequentes (10/11/2026)

Foram sorteadas 100 das 3.150 perguntas, 12 a 13 de cada seção. Cada resposta foi comparada com o texto do § que ela cita.

| Resultado | Perguntas | Exemplo |
|---|---|---|
| Correta e fiel ao texto | 82 | — |
| Correta, mas vai além do texto | 15 | Uma aplicação pastoral que o § não traz, ou a citação de um § vizinho em vez do exato. |
| Erro de português | 3 | "Embora a comunidade chora", "esflora", "nota contraffeita". |
| Erro de doutrina | 0 | — |

Com 0 erros de doutrina em 100, a taxa real provavelmente fica abaixo de 3% (intervalo de confiança de 95%).

## Varredura automática das 3.150

**Palavras fora do vocabulário.** Foram procuradas palavras que não aparecem no Catecismo nem no Compêndio e que têm cara de outra língua ou de erro de digitação. Os 13 casos encontrados foram corrigidos:

- inglês que escapou na geração: "mutually", "suffragations", "establisheda", "establishedou", "naturally", "briefing";
- grafia: "bençãos", "aaroníticas", "Gethsêmani";
- os 3 erros da amostra.

**Perguntas repetidas entre seções.** Só 3 pares parecidos. Eles tratam o tema em partes diferentes do Catecismo, por exemplo a sucessão apostólica na Revelação (§ 77) e na Igreja (§ 861), e foram mantidos.

## Como manter

Cada pergunta tem o link "Reportar erro", que abre um email para catequeseemcancao@gmail.com com o código da pergunta. Para corrigir:

1. Procure o código em `data/fonte-sN/loteNN.json`.
2. Corrija o texto.
3. Rode `node scripts/montar-faq.mjs sN`.
