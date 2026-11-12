# Contexto do projeto (para continuar em outra sessão)

Atualizado em 2026-11-12. A especificação técnica completa está em [spec.md](spec.md); este arquivo resume o **estado atual**, **como trabalhar** e **as regras combinadas**.

## O que é

PWA estático **Conversando com o Catecismo**:
- **Leitor** do Catecismo da Igreja Católica, parágrafo por parágrafo (texto do vatican.va, grafia brasileira).
- **Chat** que responde só com o Catecismo, citando [§ N]. Dois modos: **Compêndio** (padrão, sem IA, respostas prontas) e **IA** (via Worker).
- **Dúvidas**: perguntas frequentes (FAQ) e **Objeções** (apologética), ambas respondidas só com o CIC.

| Item | Onde |
|---|---|
| Site | https://ederdandan.github.io/conversando-com-catecismo/ (GitHub Actions publica `web/` a cada push na `main`) |
| Repositório | https://github.com/ederdandan/conversando-com-catecismo |
| Worker (IA) | https://catecismo-api.catecismo-api.workers.dev (Cloudflare; Gemini Flash em fila de modelos + Groq de reserva) |
| Métricas | GoatCounter anônimo: https://catequeseemcancao.goatcounter.com (sem cookies, respeita Do Not Track) |
| Contato "Reportar erro" | catequeseemcancao@gmail.com |

## Estado atual

- **FAQ**: 8 seções (Partes I–IV), 3.150 perguntas → `web/data/faq.json`.
- **Objeções**: 8 seções, 1.038 objeções → `web/data/objecoes.json`.
  s1 144 · s2 225 · s3 64 · s4 221 · s5 92 · s6 214 · s7 50 · s8 28.
- **Navegação de Dúvidas e Objeções é igual**: partes do Catecismo (cartões) → seções e temas (com faixa de §) → itens agrupados pelos subtítulos do Catecismo (`htmlAgrupada` em `web/js/app.js`, para temas com mais de 20 itens).
- **Chat com IA**: sinônimos de busca (tatuagem, apostas, drogas etc.) em `web/js/busca.js`; se a IA recusar ou não citar fonte, mostra a resposta pronta do Compêndio mais próxima; a IA termina com uma analogia em parágrafo próprio "**Para entender:**" (sem citação e sem doutrina nova), destacada no visual.
- Versão do cache do service worker: `web/sw.js` → `VERSAO = 'catecismo-v38'`.
- Testes: `npm test` (64) e `cd worker && npm test` (19), todos passando.

## Estrutura

```
web/                 site (index.html, estilo.css, sw.js, manifest)
  js/app.js          telas e rotas (#/, #/p/N, #/duvidas…, #/objecoes…, #/conversar, #/sobre)
  js/chat.js         chat (modo Compêndio e IA), fallback para resposta local
  js/busca.js        busca BM25 + SINONIMOS
  js/citacoes.js     [§ N]: extração, validação e HTML da resposta
  js/faq.js, objecoes.js, compendio.js, leitor.js, metricas.js …
  data/              catecismo.json, compendio.json, faq.json, objecoes.json (gerados)
worker/              Cloudflare Worker (src/app.js tem o prompt de sistema)
scripts/
  gerar-catecismo.mjs    npm run dados — gera web/data/catecismo.json do vatican.va
  gerar-compendio.mjs    npm run dados:compendio
  montar-faq.mjs sN      junta data/fonte-sN/loteNN.json → data/faq-parteX-secaoY.json e web/data/faq.json
  montar-objecoes.mjs    junta data/objecoes/fonte-sN/loteNN.json, valida e publica web/data/objecoes.json
  salvar-lote.ps1        salva o JSON copiado (área de transferência) como lote
  servir.mjs             npm run servir — servidor local
data/                lotes-fonte da FAQ e das objeções; REVISAO-FAQ.md
tests/               testes do site (node --test)
```

## Como trabalhar

- **Testar localmente**: `npm run servir` e abrir o endereço indicado. Depois de mudar arquivos do site, **subir a `VERSAO` em `web/sw.js`** para quem tem o app instalado receber a atualização.
- **Objeções – formato de cada item** do lote: `{"c":tema,"o":"objeção","r":"resposta curta","e":"explicação","b":["Mt 16,18"],"bt":[{"ref":"…","t":"…"}],"cic":["881-882"],"a":"analogia"}`. Texto bíblico (`bt`) só fica se estiver transcrito no próprio Catecismo. Abreviações bíblicas seguem `LIVROS` em `montar-objecoes.mjs` (ex.: Filêmon = `Fm 1,16`).
- **Geração no NotebookLM** (FAQ e objeções): notebook só com o PDF do Catecismo (o PDF é ignorado pelo git). Revisar cada lote: remover duplicatas de sentido (inclusive entre seções), frases sem base no texto do CIC e conteúdo pastoral inventado (costumes, direito canônico, devoções), que costuma aparecer na segunda metade dos lotes.
- **Worker**: o deploy (`cd worker; npx wrangler deploy`) e os segredos (`npx wrangler secret bulk .dev.vars`) são feitos **pelo usuário**.

## Regras combinadas com o usuário

- **Email só quando o usuário pedir.**
- Commit e push: feitos quando o usuário pede. Mensagens de commit em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nunca commitar**: `data/desktop.ini`, `data/duvidas-catolicos-versao-com-tudo.json`, `data/objecoes-apologetica-catolica.json`, `iconOk_v2.jpg`, nem o PDF.
- Respostas sempre fundamentadas apenas no texto do Catecismo; não reintroduzir upload de PDF/ChatPDF.
- Economizar tokens (evitar capturas de tela desnecessárias).
- Textos e interface em português do Brasil.

## Histórico recente (commits)

| Commit | O quê |
|---|---|
| `bc7ecdb` | Objeções com a mesma navegação das dúvidas (partes → temas → grupos) |
| `9bd0390` | Objeções: Seção 5 completa; 1.038 no total |
| `fda06a5` | Objeções: Seção 6 completa |
| `3e95252` | Objeções: Seção 8 completa |
| `4e83f43` | Chat com IA: analogia "Para entender:" no fim |
| `17324ab` | Chat: sinônimos (tatuagem, apostas, drogas…) e fallback para resposta pronta |
