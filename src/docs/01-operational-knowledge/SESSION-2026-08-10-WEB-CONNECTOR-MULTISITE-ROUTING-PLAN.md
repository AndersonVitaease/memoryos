# SESSION 2026-08-10 — Web Connector: Multi-site + Roteamento de Capabilities (Plano)

**ID:** SESSION-2026-08-10-WEB-CONNECTOR-MULTISITE-ROUTING-PLAN
**Category:** SESSION_KNOWLEDGE
**Status:** PLANEJAMENTO APROVADO (nao implementado)
**Last Updated:** 2026-08-10
**Authority:** ENGINEERING

---

## Contexto

O Web Connector (RFC-012/013/014/015) esta funcional ponta a ponta: o usuario
cola a URL de um site, faz login (modo Automated via Playwright DOM ou modo Live
via Selenium/noVNC), captura cookies HttpOnly, e a descoberta de capabilities
(RFC-013) cataloga operacoes de leitura como `CapabilityCandidate`. Apos
validacao humana, as capabilities promovidas viram `CapabilityMap`.

**Estado atual validado em producao (2026-08-10):** login no Mercado Livre
realizado via modo Live (conta VITAEASE, user id 143063860); descoberta rodou e
gerou N candidatos (`product.search`, `purchases.search`, `purchases.filter`,
`questions.filter_by_date`, `seller.search_products_sales`, etc); 2 validados
e promovidos ao `CapabilityMap` (`search.products`, `product.search`).

**O que falta (2 topicos):**
1. **Multi-site** — hoje a pagina `/web-connector` auto-retoma apenas a WebSession
   ativa mais recente; conectar um segundo site orfa o primeiro. Sem seletor para
   alternar entre sessoes conectadas.
2. **Roteamento no chat** — o MemoryOS descobre capabilities mas o
   `memoryReasoningPlanner` (pipeline de chat) nao roteia um pedido do usuario
   ("buscar X no mercado livre") ate a capability descoberta. Faltam: (a)
   deteccao de intencao de site, (b) guard no planner que executa a capability
   e injeta o resultado como grounding para o LLM.

---

## Diagnostico Confirmado (estado do codigo real)

### Multi-site

`WebConnectorPage.jsx` linha 83: `base44.entities.WebSession.filter({ status: "active" }, "-created_date", 1)`
— pega **1** sessao. A entidade `WebSession` ja suporta N registros; e so UI.

### Roteamento

- **`WebConnector.ts`** ja implementa `web.capability.execute` (case 188-212):
  delega ao backend `webConnectorConnect` operation `executeCapability`
  (preenche formulario, submete, captura snapshot). O backend existe e funciona.
- **`WebCapabilityExecutor.jsx`** executa manualmente na UI do `/web-connector`.
- **`memoryReasoningPlanner.js`** tem guards para email (ETAPA 0.6), drive
  (ETAPA 5.4), search (ETAPA 5.2), specialists (ETAPA 3.5) — **nenhum path que
  diga "buscar X no site Y" -> `web.capability.execute`**. O
  `detectService()` (serviceDetector.js) nao conhece "web". O
  `capabilityOrchestrator` nao conhece capabilities descobertas.

Por isso o MemoryOS descobre mas nao usa pelo chat.

---

## Plano de Implementacao

### Topico A — Multi-site login (UI, baixo risco)

**Principio:** UI pura. Nenhuma mudanca de backend ou entidade. `WebSession` ja
suporta N registros.

**Arquivos:**
- `src/components/web-connector/WebSessionPicker.jsx` (NOVO)
- `src/pages/WebConnectorPage.jsx` (EDITADO)

**Passos:**
1. Ao montar a pagina, buscar **todas** as WebSessions ativas (hoje pega 1).
2. Novo `WebSessionPicker` no topo: cada site conectado (nome + host + expiração),
   botão "Retomar" em cada um, botão "Conectar novo site" leva ao fluxo existente.
3. Auto-retomar só se houver **exatamente 1** sessão ativa (mantém UX atual para
   caso simples); se houver múltiplas, mostra o seletor.
4. O fluxo de conexão existente (Automated/Live) fica intocado — apenas deixa de
   ser o único caminho.

**Risco:** zero. Aditivo. Nenhuma lógica de backend tocada.

### Topico B — Roteamento de capabilities no chat (núcleo)

**Principio: 100% aditivo.** Novo guard no planner, mesmo padrão do guard de
email (linhas 387-475). Só dispara em match confiante; senão cai pro fluxo
normal. Fluxos existentes (email/drive/search/specialist) não são tocados.

**B1 — Resolver intenção de site (determinístico, sem LLM)** — novo
`src/lib/web-connector/WebSiteIntentResolver.js`:
- Carrega WebSessions ativas + CapabilityMaps do usuário.
- `resolveWebIntent(message)` → casa o texto contra hostname/keywords do site
  (ex: "mercado livre" -> `mercadolivre.com.br`) e seleciona a capability por
  padrão do `suggested_id` (`*.search*`, `*.filter*`).
- Retorna `{ siteUrl, webSessionId, capability, confidence }` ou `null`.

**B2 — Guard no planner** — novo bloco "ETAPA 0.7: WEB CONNECTOR ROUTING" em
`memoryReasoningPlanner.js`, antes da ETAPA 1 (memória):
- Se `resolveWebIntent` matchear:
  - Checa `expires_at` da WebSession → se expirou, responde pedindo re-auth no
    `/web-connector`.
  - Extrai o termo de busca da mensagem (heurística: substring após
    "buscar/pesquisar/procurar" ou resto da mensagem) e mapeia para
    `inputSchema.properties` da capability.
  - Chama `WebConnector.execute("web.capability.execute", { webSessionId,
    discoveredFromUrl, inputFields, inputs })`.
  - Injeta o snapshot como **grounding note** pro LLM (mesmo padrão do
    SearchEngine, ETAPA 5.2) — o LLM sintetiza a resposta com o conteúdo real da
    página autenticada.
- **Fallback seguro:** qualquer exceção/miss cai pro fluxo normal. Nunca trava
  a resposta.

**B3 — Validade da sessão** (dentro do B2): checar `expires_at` antes de
executar; se inválida, não executar e avisar.

**B4 (futuro, fora deste ciclo):** mapeamento de inputs complexos via LLM
(capabilities com vários campos). Hoje só capabilities de busca de 1 campo
(caso Mercado Livre), que cobre o pedido imediato.

---

## Garantias de Nao-Quebra

- Tudo novo em arquivos novos; `memoryReasoningPlanner` so recebe um `if` a mais
  no início (ETAPA 0.7).
- `WebConnector.ts` e `WebCapabilityExecutor.jsx` **nao mudam** — o backend ja
  faz a execucao.
- Entidades (`WebSession`, `CapabilityMap`, `CapabilityCandidate`) nao mudam.
- O guard so roteia em match confiante; ambiguidade -> fluxo normal.
- Multi-site e UI pura.
- Ordem de precedencia dos guards existentes preservada: SCHED-v7 -> WATCH ->
  IDENTITY -> AI-SERVICE -> FULL-DOC -> EMAIL-READ -> **WEB-CONNECTOR (novo)** ->
  ETAPA 1 (memoria+skills+goal).

---

## Ordem de Execucao

1. **Topico A** (multi-site, UI pura, zero risco) — primeiro.
2. **Topico B** (roteamento, o que habilita o uso pelo chat) — apos A.

---

## Referencias Cruzadas

- **RFC-012:** `src/docs/foundation/rfc/RFC-012-Web-Connector-Session-Capture.md`
- **RFC-013:** `src/docs/foundation/rfc/RFC-013-Web-Connector-Capability-Discovery.md`
- **RFC-014:** `src/docs/foundation/rfc/RFC-014-Web-Connector-Runtime-Integration.md`
- **RFC-015:** `src/docs/foundation/rfc/RFC-015-Web-Connector-Live-Login.md`
- **ADR-019:** `src/docs/foundation/adr/ADR-019.md` (nunca armazenar credenciais)
- **Sessao anterior (Live Login):** `SESSION-2026-08-10-WEB-CONNECTOR-LIVE-LOGIN.md`
- **Sessao anterior (loginVerified fix):** `SESSION-2026-08-09-WEB-CONNECTOR-LOGINVERIFIED-FIX.md`
- **Codigo vivo:** `src/lib/connector-runtime/connectors/WebConnector.ts`,
  `src/components/web-connector/WebCapabilityExecutor.jsx`,
  `src/pages/WebConnectorPage.jsx`,
  `src/lib/reasoning/memoryReasoningPlanner.js` (guards ETAPA 0.6/5.2/5.4).