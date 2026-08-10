# SESSION 2026-08-10 — Web Connector: Roteamento de Capabilities no Chat (Topico B)

**ID:** SESSION-2026-08-10-WEB-CONNECTOR-CHAT-ROUTING
**Category:** SESSION_KNOWLEDGE
**Status:** IMPLEMENTADO
**Last Updated:** 2026-08-10
**Authority:** ENGINEERING

---

## Resumo

O MemoryOS descobria capabilities de sites autenticados (RFC-012/013/014/015)
mas o pipeline de chat (`memoryReasoningPlanner`) nao roteava um pedido do
usuario ("buscar X no mercado livre") ate a capability descoberta. Este
topico adiciona o roteamento: deteccao deterministica de intencao de site +
guard que executa a capability (form-fill read-only) e injeta o snapshot
como grounding note para o LLM sintetizar a resposta.

## Diagnostico (estado do codigo real)

- `WebConnector.ts` ja implementa `web.capability.execute` (case 188-212):
  delega ao backend `webConnectorConnect` operation `executeCapability`.
- `WebCapabilityExecutor.jsx` executa manualmente na UI do `/web-connector`.
- `memoryReasoningPlanner.js` tinha guards para email (ETAPA 0.6), drive
  (ETAPA 5.4), search (ETAPA 5.2) — nenhum path para "buscar X no site Y".
- `serviceDetector`/`capabilityOrchestrator` nao conheciam "web".

## Implementacao

### B1 — WebSiteIntentResolver (NOVO, deterministico, sem LLM)

Arquivo: `src/lib/web-connector/WebSiteIntentResolver.js`

- Carrega WebSessions ativas (RLS: so do usuario) + CapabilityMaps.
- `resolveWebIntent(message)`:
  - Casa a mensagem (normalizada: lowercase + sem acento + so alfanumerico)
    contra o token composto do host (ex: "mercadolivre") e `site_name`.
  - Seleciona a melhor capability de leitura (search > filter > list).
  - Extrai o termo de busca (remove mencao ao site + verbos/conectores).
  - Retorna `{ siteUrl, webSessionId, webSessionExpiresAt, discoveredFromUrl,
    capability, inputFields, searchTerm }` ou `null`.

### B2 — Guard ETAPA 0.7 no planner (aditivo)

Arquivo: `src/lib/reasoning/memoryReasoningPlanner.js`

- Inserido apos a ETAPA 0.6 (email), antes da ETAPA 1 (memoria/skills/goal).
- Ordem de precedencia: SCHED-v7 -> WATCH -> IDENTITY -> AI-SERVICE ->
  FULL-DOC -> EMAIL-READ -> **WEB-CONNECTOR (novo)** -> ETAPA 1.
- Se `resolveWebIntent` matchear:
  - B3: checa `expires_at` da WebSession; se expirou, retorna direto
    pedindo re-auth no `/web-connector` (nao executa).
  - Mapeia o `searchTerm` extraido -> primeiro campo do `inputSchema`.
  - Chama `base44.functions.invoke("webConnectorConnect", { operation:
    "executeCapability", ... })` (mesmo backend da UI).
  - Seta `_webConnectorGroundingNote` com o snapshot (ate 6000 chars).
- O snapshot e injetado no `finalPrompt` antes da unica chamada ao LLM
  (ETAPA 6), junto com o `_searchEngineGroundingNote` (mesmo padrao do
  SearchEngine, ETAPA 5.2). O LLM sintetiza a resposta contextualizada.
- **Fallback seguro:** qualquer excecao/miss cai pro fluxo normal. Nunca
  trava a resposta.

## Garantias de Nao-Quebra

- Tudo novo em arquivo novo (`WebSiteIntentResolver.js`); o planner so
  recebeu um bloco aditivo (ETAPA 0.7) + o append de `_webConnectorGroundingNote`
  no `finalPrompt`. Nenhum guard/fluxo existente foi tocado.
- `WebConnector.ts`, `WebCapabilityExecutor.jsx`, `WebConnectorPage.jsx` nao
  mudaram nesta etapa.
- Entidades (`WebSession`, `CapabilityMap`, `CapabilityCandidate`) nao mudaram.
- O guard so roteia em match confiante (site mencionado + capability de busca
  valida); ambiguidade -> fluxo normal.
- `finalPrompt` mudou de `const` para `let` (necessario para append aditivo).

## Limitacoes Atuais (futuro, fora deste ciclo)

- B4: mapeamento de inputs complexos (capabilities com varios campos) via
  LLM. Hoje so capabilities de busca de 1 campo (caso Mercado Livre), que
  cobre o pedido imediato. O termo vai no primeiro campo; os demais ficam
  vazios.
- A execucao e read-only (form-fill + captura de snapshot). Escrita continua
  bloqueada (guarda de escrita no backend).

## Como Testar

1. Conectar um site no `/web-connector` (modo Live ou Automated), confirmar
   login, descobrir capabilities e validar uma capability de busca
   (ex: `product.search` do Mercado Livre).
2. No chat, enviar: "buscar tênis no mercado livre".
3. Esperado: o guard detecta a intencao, executa a capability (preenche o
   formulario de busca, submete, captura snapshot) e o LLM sintetiza a
   resposta com o conteudo real da pagina autenticada.
4. Se a sessao tiver expirado (TTL ~30min), o guard responde pedindo re-auth
   em `/web-connector` (nao tenta executar).

## Referencias Cruzadas

- Plano aprovado: `SESSION-2026-08-10-WEB-CONNECTOR-MULTISITE-ROUTING-PLAN.md`
- Topico A (multi-site): `WebSessionPicker.jsx`, `WebConnectorPage.jsx`
- RFC-012/013/014/015, ADR-019
- Codigo vivo: `src/lib/web-connector/WebSiteIntentResolver.js`,
  `src/lib/reasoning/memoryReasoningPlanner.js` (ETAPA 0.7),
  `src/lib/connector-runtime/connectors/WebConnector.ts` (web.capability.execute),
  `base44/functions/webConnectorConnect/entry.ts` (executeCapability).