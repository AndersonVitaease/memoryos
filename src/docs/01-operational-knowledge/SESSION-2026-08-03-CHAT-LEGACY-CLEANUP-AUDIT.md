# SESSION 2026-08-03 — Chat: Limpeza de Timeline Legada + Auditoria de Pipeline Antigo

> **Status:** PARCIALMENTE EXECUTADO (limpeza de timeline) + AUDITORIA + PLANO DE MIGRACAO.
> **Data:** 2026-08-03 (America/Sao_Paulo, 17:22 BRT)
> **Escopo:** Remocao de componentes de timeline orfaos, auditoria de codigo morto/legado no caminho do chat, e plano seguro de migracao do chat de projeto para a CXP v2.

---

## 1. Contexto

Apos a decisao (2026-08-03) de remover o "Modo Timeline" do ChatPage em favor de uma experiencia de chat unificada, ficou pendente a remocao dos componentes de timeline orfaos. Em seguida, o usuario pediu auditoria de codigo morto/legado da "pipeline antiga" ainda vivo no caminho do chat.

---

## 2. Limpeza Executada — Componentes de Timeline Orfaos

### 2.1 O que foi removido (7 arquivos deletados)

| Arquivo | Motivo |
|---------|--------|
| `src/components/timeline/MessageBubble.jsx` | So era usado pela Timeline (removida). ChatPage tem bubble inline proprio. |
| `src/components/timeline/TimelineEventRenderer.jsx` | Render polimorfico da timeline (sem consumidor apos remocao do modo). |
| `src/components/timeline/EventShell.jsx` | Shell compartilhado dos cards (so importado pelos 4 cards abaixo). |
| `src/components/timeline/cards/WatchEventCard.jsx` | Card de evento de Watch. |
| `src/components/timeline/cards/KnowledgeEventCard.jsx` | Card de ingestao de conhecimento. |
| `src/components/timeline/cards/ConnectorEventCard.jsx` | Card de execucao de connector. |
| `src/components/timeline/cards/CognitiveEventCard.jsx` | Card de evento cognitivo. |

### 2.2 Metodo de verificacao (sem falso positivo)

1. Confirmou-se que `useConversation.js` (hook consumido pelo ChatPage) **nao** expoe `getTimeline` — nenhum consumidor via hook.
2. Os 4 cards importavam apenas `EventShell` (cluster fechado interno) — deletar todos juntos nao deixa import quebrado.
3. `TimelineEventRenderer` importava os cards + `EventShell` + `formatTime`; `MessageBubble` importava `formatTime` + `StreamingMessage`. Nenhum era importado por arquivo vivo.
4. `cxpTests.ts` foi lido: nao referencia `getTimeline` (testa Store/Metrics/Recovery/Streaming/Concurrency apenas).

### 2.3 Metodo removido do ConversationManager

- **Arquivo:** `src/lib/conversation-platform/ConversationManager.ts`
- **Metodo removido:** `getTimeline(sessionId?, limit?, beforeTimestamp?)` — fazia merge de `Message` + `SystemEvent` ordenados por timestamp para a view de Timeline.
- **Impacto:** Zero. Era uma API nova opcional (adicionada na Fase 1 do Event-Driven Timeline), nunca consumida pelo hook ou pelo ChatPage apos a remocao do modo Timeline.

### 2.4 Preservado

- `src/components/timeline/formatTime.js` — **mantido**. Ainda importado por `ChatPage.jsx` para timestamps dos bubbles (`formatTime(msg.created_date)` em BRT).

---

## 3. Auditoria — Codigo Morto/Legado no Caminho do Chat

### 3.1 ChatPage.jsx (CXP v2) — limpo

O `ConversationPipeline.ts` e a arquitetura v2 moderna (Prepare -> Persist -> Reason -> Route -> Capabilities -> Synthesize -> Stream -> Finalize, com ResponseArbiter como unica autoridade de decisao). Sem pipeline antiga no chat principal.

**Unico detalhe morto:** import do icone `X` (lucide-react) em `ChatPage.jsx` sem uso no JSX. Remocao de 1 token — pendente.

### 3.2 Pipeline Antiga AINDA VIVA (legado, nao morto)

A pipeline antiga (pre-CXP) ainda esta ativa no **chat escopado por projeto** (aba de chat dentro de `ProjectDetail.jsx`):

| Arquivo | Papel | Consumidor |
|---------|-------|------------|
| `src/components/chat/ChatInterface.jsx` | UI de chat da pipeline antiga (`conversationEngine` + `contextRetrieval` + `InvokeLLM` direto) | `src/pages/ProjectDetail.jsx` (linha 11, import) |
| `src/lib/conversationEngine.js` | Motor de memoria em lotes: `getOrCreateActiveSession`, `shouldProcessBatch`, `processConversationBatch` (extrai summary/entidades/decisoes/tarefas/topicos/keywords) | `ChatInterface.jsx` + **CXP** (via `ConversationBackgroundProcessor`) |
| `src/lib/contextRetrieval.js` | Recuperacao de contexto inteligente (keywords -> entidades/docs) | `ChatInterface.jsx` apenas |

### 3.3 Descoberta Critica — `conversationEngine` NAO e deletavel

O `ConversationBackgroundProcessor.ts` (linha 130) **ja importa e chama `processConversationBatch`** do `conversationEngine` a cada 5 mensagens do usuario, no background da propria CXP v2:

```typescript
const { processConversationBatch } = await import("@/lib/conversationEngine");
const knowledge = await processConversationBatch(session, allMessages, session.project_id);
```

**Implicacao:** `conversationEngine.js` e um modulo **compartilhado** entre a pipeline antiga (ChatInterface) e a pipeline nova (CXP). Deletar o arquivo quebraria a extracao de conhecimento do chat principal tambem.

### 3.4 Mapeamento do que e realmente removivel

| Recurso | Status | Acao |
|---------|--------|------|
| `ChatInterface.jsx` | Legado, so usado por ProjectDetail | Removivel apos migracao |
| `contextRetrieval.js` | Legado, so usado por ChatInterface | Removivel apos migracao |
| `conversationEngine.getOrCreateActiveSession` | Legado, so usado por ChatInterface | Removivel apos migracao (CXP tem o seu em ConversationPersistence) |
| `conversationEngine.shouldProcessBatch` | Legado, so usado por ChatInterface | Removivel apos migracao (CXP checa `userCount % 5 === 0` inline) |
| `conversationEngine.processConversationBatch` | **COMPARTILHADO** CXP + ChatInterface | **NAO remover** — núcleo de extracao de conhecimento |
| Import `X` em ChatPage.jsx | Morto (nao usado no JSX) | Removivel anytime |

### 3.5 Bloqueador de delecao direta

`ProjectDetail.jsx` importa `ChatInterface` (linha 11) para a aba de chat do projeto. Remover `ChatInterface` + `contextRetrieval` sem migracao **quebra essa aba**. Nao e uma limpeza, e uma migracao.

---

## 4. Plano de Migracao Segura — Chat de Projeto para CXP v2

**Principio:** cada fase e aditiva e reversivel isoladamente. Nada e deletado ate a Fase 4.

### Fase 0 — Adicionar escopo de projeto na CXP (zero risco, aditivo)

- `getOrCreateActiveSession(projectId?)`, `createSession(title?, projectId?)`, `loadActiveSession(projectId?)` em `ConversationPersistence.ts` — filtram por `project_id` quando recebem o param; sem param = comportamento global atual (backward compatible).
- `initializeSession(projectId?)` e `createNewSession(title?, projectId?)` em `ConversationSessionManager.ts`.
- `useConversation({ projectId })` e `conversationManager.initialize(projectId)`.

### Fase 1 — Isolar sessao por escopo (ponto mais delicado)

- `getLastSessionId`/`saveLastSessionId` passam a usar chave **por escopo**: `memoryos_last_session_id` (global) e `memoryos_last_session_id__proj_${projectId}` (projeto) — senao o chat global e o de projeto roubaria a sessao um do outro.
- `getOrCreateActiveSession(projectId)`: filtra `{ project_id: projectId, status: "active" }`. Global: filtra `project_id` nulo/indefinido. Separacao bidirecional impede vazamento de contexto entre projetos.

### Fase 2 — Reusar ChatPage com prop (swap de 1 linha, revertivel)

- `ChatPage` aceita `projectId` opcional e repassa a `useConversation({ projectId })`.
- `ProjectDetail.jsx`: troca `<ChatInterface projectId={id} projectName={name} />` por `<ChatPage projectId={id} />`.

### Fase 3 — Verificar paridade (antes de deletar)

| Aspecto | Verificacao |
|---------|-------------|
| Extracao de conhecimento | Intacta — `processConversationBatch` roda igual no background da CXP (Fase 0 nao o toca). |
| Resumo de sessao | Intacto — `syncSessionMetadata` do SessionManager. |
| Historico antigo | Sessoes `ChatSession` com `project_id` criadas pelo `ChatInterface` antigo sao lidas pela nova `getOrCreateActiveSession(projectId)` — zero perda de dados. |
| Isolamento | Mensagens do projeto A nao aparecem no chat global nem em projeto B. |

### Fase 4 — Delecao segura (so apos Fase 3 verde)

1. Deleta `ChatInterface.jsx` e `contextRetrieval.js`.
2. Remove `getOrCreateActiveSession` + `shouldProcessBatch` do `conversationEngine.js` (mantem `processConversationBatch`).
3. Remove import `X` nao usado do `ChatPage.jsx`.

### 4.1 Riscos a vigiar

| Risco | Mitigacao |
|-------|-----------|
| Vazamento de sessao entre escopos | Filtro `project_id` bidirecional na Fase 1 + teste manual cruzando projetos. |
| `initialize()` no mount do ChatPage ignora param | Propagar `projectId` senao ignora o escopo — revisar `useEffect` de init. |
| Sessoes orfas sem `project_id` criadas pelo ChatInterface antigo | Decidir se viram globais ou sao migradas com `project_id` atribuido. |

---

## 5. Referencias Cruzadas

- **ChatPage (vivo, CXP v2):** `src/pages/ChatPage.jsx`
- **ConversationPipeline (vivo, v2):** `src/lib/conversation-platform/ConversationPipeline.ts`
- **ConversationBackgroundProcessor (vivo, reusa conversationEngine):** `src/lib/conversation-platform/ConversationBackgroundProcessor.ts`
- **ConversationManager (vivo, ponto de entrada):** `src/lib/conversation-platform/ConversationManager.ts`
- **ConversationPersistence (vivo, sem escopo de projeto ainda):** `src/lib/conversation-platform/ConversationPersistence.ts`
- **ConversationSessionManager (vivo, sem escopo de projeto ainda):** `src/lib/conversation-platform/ConversationSessionManager.ts`
- **ChatInterface (legado, ProjectDetail):** `src/components/chat/ChatInterface.jsx`
- **conversationEngine (legado + compartilhado):** `src/lib/conversationEngine.js`
- **contextRetrieval (legado, ChatInterface):** `src/lib/contextRetrieval.js`
- **ProjectDetail (consumidor do legado):** `src/pages/ProjectDetail.jsx`
- **formatTime (preservado):** `src/components/timeline/formatTime.js`
- **Doc anterior de Event-Driven Timeline:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-EVENT-DRIVEN-TIMELINE-ARCHITECTURE.md`

---

## 6. Estado Atual

- **Executado:** Limpeza de 7 componentes de timeline orfaos + remocao do metodo `getTimeline` do ConversationManager (secao 2).
- **Auditado:** Caminho do chat (secao 3). Pipeline antiga mapeada como legado-compartilhado, nao morto.
- **Planejado:** Migracao do chat de projeto para CXP v2 em 5 fases aditivas (secao 4). Aguardando autorizacao para iniciar a Fase 0.