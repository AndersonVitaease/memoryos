# SESSION LOG — 2026-08-01 — Search Pipeline Fixes

**Data:** 2026-08-01 (21:00–21:15 BRT)  
**Foco:** Corrigir o pipeline de pesquisa web para entregar respostas sintetizadas e úteis.

---

## Problema Original

O agente apresentava três falhas encadeadas ao realizar pesquisas:

1. **Respostas vazias tipo "vou investigar"** — o LLM recebia os resultados da pesquisa mas respondia com promessas de investigação futura em vez de usar os dados disponíveis.
2. **Query mal construída enviada ao Serper** — mensagens curtas como "Descubra" ou "Como conectar?" eram enviadas literalmente ao Google/Serper, gerando resultados irrelevantes (ex: pesquisava "MCP conector API" em vez de "Higgsfield AI integration developers").
3. **Resultados crus do Serper entregues diretamente ao usuário** — o `SearchEngine` tinha um `return` antecipado que despachava os links formatados pelo `formatSearchResultAsResponse()` **antes** do LLM processar, resultando em listas de URLs e snippets crus visíveis na conversa.

---

## Fixes Implementados

### Fix 1 — System Prompt: proibir respostas vazias (`contextBuilder.js`)

**Arquivo:** `src/lib/reasoning/contextBuilder.js`  
**Mudança:** Adicionadas duas novas regras no `buildSystemPrompt()`:

```
- NUNCA responda com "vou investigar", "estou investigando", "assim que tiver mais informações compartilho"
  — se há resultados de pesquisa no prompt, USE-OS agora e responda diretamente.
- NUNCA crie "planos de investigação" ou "próximos passos" para o usuário esperar.
  Entregue a informação disponível agora, de forma direta e completa.
```

**Motivo:** O LLM ignorava os dados de pesquisa disponíveis e respondia com intenções futuras, o que é inútil para o usuário.

---

### Fix 2 — Detecção de ação curta (`capabilityDetector.js`)

**Arquivo:** `src/lib/reasoning/capabilityDetector.js`  
**Mudança:** Adicionado array `SHORT_ACTION_TRIGGERS` que força `web_search=true` para mensagens curtas de acompanhamento:

```js
const SHORT_ACTION_TRIGGERS = [
  "descubra", "pesquise", "busque", "investigue", "procure", "encontre",
  "como conectar", "como integrar", "como usar a api", "tente", "execute",
  "faça isso", "faz isso"
];
const isShortActionFollowUp = SHORT_ACTION_TRIGGERS.some((t) => normalize(normalized).includes(normalize(t)));
let explicitlyRequested = webMatch.length > 0 || isShortActionFollowUp;
```

**Motivo:** Antes, "Descubra" não passava pelo `semanticWebSearchCheck` com sucesso suficiente para ativar a busca — agora é ativado deterministicamente.

---

### Fix 3 — Otimização de query de busca (`capabilityExecutor.js`)

**Arquivo:** `src/lib/reasoning/capabilityExecutor.js`  
**Mudança:** Nova função `buildSearchQuery()` que detecta mensagens vagas (< 40 chars ou verbos de ação isolados) e usa Gemini Flash para gerar uma query otimizada em inglês baseada no contexto da conversa:

```js
async function buildSearchQuery(userMessage, conversationContext) {
  const isVague = userMessage.length < 40 ||
    /^(descubra|pesquise|busque|...)$/i.test(normalized);
  if (!isVague) return userMessage;
  // Chama Gemini Flash com contexto da sessão para gerar query otimizada
  // Ex: "Como conectar o MemoryOS a ela?" + contexto Higgsfield
  //   → "Higgsfield AI integration API developers"
}
```

**Motivo:** Mensagens contextuais curtas geravam queries inúteis no Serper. Agora o contexto da conversa é usado para ancorar a query no tópico real.

---

### Fix 4 — SearchEngine não retorna mais direto ao usuário (`memoryReasoningPlanner.js`)

**Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js`  
**Mudança:** Removido o `return` antecipado que entregava `formatSearchResultAsResponse()` direto ao usuário. Os resultados agora são injetados em `_searchEngineGroundingNote` como contexto para o LLM:

```js
// ANTES (errado):
if (searchOutcome.resolved && searchOutcome.bestResult) {
  const response = formatSearchResultAsResponse(searchOutcome.bestResult);
  return { response, plan, sources }; // ← retornava cru ao usuário
}

// DEPOIS (correto):
if (searchOutcome.resolved && searchOutcome.bestResult) {
  const snippet = formatSearchResultAsResponse(searchOutcome.bestResult);
  _searchEngineGroundingNote =
    `RESULTADOS DA PESQUISA WEB (use estes dados para responder — não liste os links, sintetize uma resposta útil...)\n${snippet}`;
  // continua para o LLM
}
```

**Motivo:** O `SearchEngine` é um coletor de dados, não um gerador de respostas. O LLM deve sempre sintetizar a resposta final usando os dados como contexto.

---

## Fluxo Correto Pós-Fix

```
Usuário: "Como integrar o MemoryOS à Higgsfield?"
    ↓
capabilityDetector → web_search = true (keyword match)
    ↓
capabilityExecutor.buildSearchQuery()
  → mensagem não é vaga → query = "Como integrar o MemoryOS à Higgsfield?"
    ↓
SerperSearch → retorna 10 resultados orgânicos do Google
    ↓
_searchEngineGroundingNote injetado no prompt do LLM
    ↓
LLM sintetiza resposta útil em português com base nos dados reais
    ↓
Usuário recebe resposta contextualizada, não lista de links
```

```
Usuário: "Descubra" (mensagem curta, contexto = Higgsfield)
    ↓
capabilityDetector → SHORT_ACTION_TRIGGERS match → web_search = true
    ↓
capabilityExecutor.buildSearchQuery()
  → mensagem vaga → Gemini Flash gera: "Higgsfield AI integration API developers"
    ↓
SerperSearch → resultados relevantes
    ↓
LLM sintetiza resposta
```

---

## Estado Anterior vs. Atual

| Comportamento | Antes | Depois |
|---|---|---|
| "Descubra" ativa busca? | Às vezes (falha semântica) | Sempre (determinístico) |
| Query enviada ao Serper | Mensagem literal do usuário | Query otimizada por Gemini Flash se vaga |
| Resultados do Serper | Retornados crus ao usuário | Injetados como contexto no LLM |
| Resposta do LLM | "Vou investigar..." | Síntese direta com os dados disponíveis |

---

## Arquivos Modificados

- `src/lib/reasoning/contextBuilder.js` — system prompt
- `src/lib/reasoning/capabilityDetector.js` — SHORT_ACTION_TRIGGERS
- `src/lib/reasoning/capabilityExecutor.js` — buildSearchQuery()
- `src/lib/reasoning/memoryReasoningPlanner.js` — remove return antecipado do SearchEngine