# SESSION 2026-08-03 — Arquitetura Event-Driven Timeline (Opcao B)

> **Status:** PLANEJAMENTO — documento de arquitetura. Nenhum codigo implementado nesta sessao.
> **Data:** 2026-08-03 (America/Sao_Paulo)
> **Escopo:** Transicao da arquitetura Message-based para Event-Driven Timeline, sem quebrar o chat existente.

---

## 1. Contexto e Motivacao

O MemoryOS hoje trata toda ocorrencia do sistema (Worker, Connector, Watch, notificacao) como uma `Message` na entidade `Message` do banco. Isso cria:

- **Desalinhamento semantico:** Logs de sistema sao persistidos como se fossem falas de conversa (`role: "assistant"`).
- **Degradacao de performance:** A lista monolitica de mensagens cresce sem distincao entre conteudo cognitivo e telemetria.
- **Acoplamento:** O `ChatPage` so conhece `Message`; nao ha espaco para cards ricos (EmailCard, WorkerCard) sem inflar o schema de Message.

A decisao arquitetural (Opcao B) e migrar para uma **Timeline de ConversationEvents** publicados via Event Bus, onde o chat passa a ser apenas um tipo de evento dentro da timeline.

---

## 2. Metodo de Verificacao (antes de planejar)

Antes de propor qualquer implementacao, foram lidos os arquivos vivos para mapear o estado real da infraestrutura de eventos:

### 2.1 CognitiveEventBus (VIVO, em uso)

- **Arquivo:** `src/lib/cognitive-event-bus/CognitiveEventBus.ts`
- **Status:** Singleton HMR-safe via `globalThis.__COGNITIVE_EVENT_BUS__`. Eventos `Object.freeze` (imutaveis). Fire-and-forget (emit e sincrono, nunca bloqueia caller). Handlers isolam falhas (try/catch interno).
- **Tipos suportados (6):** `planning_started`, `planning_completed`, `planning_failed`, `llm_response_generated`, `knowledge_observation_generated`, `state_view_built`.
- **Persistencia:** NENHUMA. Historico em memoria limitado a 200 eventos (`_history.splice`).
- **API de subscription:** `on(type, handler)` e `onAny(handler)` — perfeito para plugar um persistence bridge sem acoplamento.

### 2.2 RuntimeEventBus (VIVO, religado em 2026-08-02)

- **Arquivo:** `src/runtime/connectors/RuntimeEventBus.ts`
- **Status:** Singleton (nao HMR-safe via globalThis — instanciado direto). 15 tipos de evento de conector + 6 cognitive (union type adicionado em 02/08).
- **Diferenca critica:** Barramento SEPARADO do `CognitiveEventBus`. Nao compartilha historia nem handlers. Quem usa hoje: `ConnectorBootstrap.ts` (ConnectorRegistered) e `UCRBridge.ts` (ConnectorExecution*).
- **Persistencia:** NENHUMA. Eventos em memoria.

### 2.3 ConversationStore (VIVO, interno do CXP)

- **Arquivo:** `src/lib/conversation-platform/ConversationStore.ts`
- **Status:** Singleton HMR-safe via `globalThis.__CXP_STORE__`. Tem seu PROPRIO sistema de eventos interno (`emit(event)` / `on(type, listener)`), independente dos dois buses acima.
- **Historico:** Em memoria, limitado a 500 eventos.

### 2.4 Conflito de Nomenclatura Detectado (CRITICO)

`src/lib/conversation-platform/CXPTypes.ts` (linhas 185-191) JA define uma interface chamada `ConversationEvent`:

```typescript
export interface ConversationEvent {
  type: ConversationEventType;  // 13 tipos: CONVERSATION_STARTED, TOKEN_RECEIVED, etc.
  executionId?: string;
  sessionId?: string;
  payload?: unknown;
  timestamp: number;
}
```

Esta interface e **in-memory apenas** (eventos de pipeline, streaming, recovery). Nao e persistida no banco.

**DECISAO:** A nova entidade persistida NAO deve se chamar `ConversationEvent` — causaria colisao de nomes e confusao conceitual. Nome proposto: **`SystemEvent`**.

### 2.5 Entidade Message (VIVA, persistencia atual do chat)

- **Arquivo:** `base44/entities/Message.jsonc`
- **Campos:** `session_id`, `role` (user|assistant), `content`, `memory_tier`, `sources_used`, `topic_id`.
- **Uso atual:** Unico destino de TUDO que aparece no chat — mensagens do usuario, respostas do LLM, notificacoes de Watch, confirmacoes de email, etc.

### 2.6 Entidade TimelineEvent (VIVA, proposito diferente)

- **Arquivo:** `base44/entities/TimelineEvent.jsonc`
- **Campos:** `project_id`, `title`, `event_date`, `category`, `tags`.
- **Uso:** Timeline de PROJETOS (eventos de negocio, nao de sistema). Nao confundir com a nova entidade de eventos de sistema.

---

## 3. Decisao Arquitetural: Entidade `SystemEvent`

### 3.1 Por que `SystemEvent` e nao `ConversationEvent`

| Criterio | `ConversationEvent` | `SystemEvent` |
|----------|---------------------|----------------|
| Colisao com CXPTypes | SIM (interface in-memory) | NAO |
| Semantica | Ambigua (conversa? sistema?) | Clara (ocorrencia de sistema) |
| Futura Message unificada | Confuso se Message virar tipo de evento | Limpo — Message continua sendo conversa |

### 3.2 Schema Proposto (extensivel, schema-agnostic)

```jsonc
{
  "name": "SystemEvent",
  "type": "object",
  "properties": {
    "conversationId": { "type": "string", "description": "ID da sessao pai" },
    "correlationId":  { "type": "string", "description": "ID unico da transacao (rastreabilidade)" },
    "parentId":       { "type": "string", "description": "ID do evento que causou este" },
    "timestamp":      { "type": "string", "format": "date-time" },
    "startedAt":      { "type": "string", "format": "date-time" },
    "finishedAt":     { "type": "string", "format": "date-time" },
    "durationMs":    { "type": "number" },
    "type":           { "type": "string", "description": "worker_start, connector_exec, watch_triggered, email_sent, etc." },
    "source":         { "type": "string", "description": "WatchEngine, ConnectorRuntime, Planner, etc." },
    "actor":          { "type": "string", "description": "system, user, worker_id" },
    "status":         { "type": "string", "description": "success, failure, pending, running" },
    "payload":        { "type": "object", "description": "Dados principais (JSON visivel ao usuario)" },
    "metadata":       { "type": "object", "description": "Dados tecnicos de debug/telemetria" }
  },
  "required": ["conversationId", "type", "timestamp", "source"]
}
```

**Principios de design:**
- **Schema-agnostic:** `payload` e `metadata` sao `type: "object"` — novos tipos de evento nao exigem alteracao de schema.
- **Rastreabilidade:** `correlationId` agrupa cadeias de eventos; `parentId` permite visualizacao em arvore.
- **Separacao visivel/tecnico:** `payload` = dados para o card do usuario; `metadata` = headers, latencia, versao de worker.

---

## 4. Plano de Implementacao em 4 Fases (sem quebras)

### Fase 1: Fundacao do Schema e Ingestao

**Objetivo:** Criar a infraestrutura para que novos eventos coexistam com as mensagens atuais.

| Passo | Arquivo | Acao |
|-------|---------|------|
| 1.1 | `base44/entities/SystemEvent.jsonc` | Criar a entidade com o schema acima. |
| 1.2 | `src/lib/event-persistence/EventPersistenceBridge.ts` | Novo modulo. Faz `cognitiveEventBus.onAny(handler)` e persiste cada evento em `SystemEvent`. Fire-and-forget (erros de DB nunca propagam). |
| 1.3 | `src/lib/event-persistence/index.ts` | Export barrel + auto-inicializacao do bridge no import. |
| 1.4 | `src/lib/conversation-platform/ConversationManager.ts` | Adicionar `getTimeline(sessionId)`: faz merge de `Message.list` + `SystemEvent.list({ conversationId })`, ordenados por `timestamp`. |

**Garantia de nao-quebra:** O `ChatPage` continua consumindo `conversation.messages` (que continuara sendo apenas `Message`). O `getTimeline` e uma API nova opcional — nada existing e tocado.

### Fase 2: Instrumentacao de Escuta (Passiva)

**Objetivo:** Comecar a capturar eventos do sistema sem migrar nenhuma logica.

| Passo | Arquivo | Acao |
|-------|---------|------|
| 2.1 | `src/lib/event-persistence/EventPersistenceBridge.ts` | Estender para escutar tambem `RuntimeEventBus` (connector events). |
| 2.2 | `src/lib/watch-engine/WatchScheduler.ts` (ou equivalente vivo) | Emitir eventos `watch_triggered` no `CognitiveEventBus` quando um Watch dispara. |
| 2.3 | `src/pages/ChatPage.jsx` | Adicionar renderizador polimorfico: se item da timeline tem `isEvent: true`, renderizar `TimelineEventRenderer` (card cinza basico); senao, renderizar `ChatBubble` atual. |

**Garantia de nao-quebra:** O `TimelineEventRenderer` inicial pode retornar `null` ou um placeholder discreto. O chat visualmente nao muda — apenas a infraestrutura de captura esta ativa.

### Fase 3: Migracao das Fontes de Dados

**Objetivo:** Parar de injetar ocorrencias de sistema como `Message` e passar a publica-las como `SystemEvent`.

| Passo | Modulo | Acao |
|-------|--------|------|
| 3.1 | Watch Engine (`watchSchedulerTick/entry.ts`) | Ao disparar, criar `SystemEvent` (type: `watch_triggered`) em vez de `PendingWatchAction` → `Message`. |
| 3.2 | Connector Runtime | `UCRBridge.ts` ja emite no RuntimeEventBus — o bridge da Fase 2 ja captura. Apenas parar de criar `Message` de confirmacao de email. |
| 3.3 | Knowledge Ingestion | `knowledgeIngestionPipeline.js` parar de criar `Message` de confirmacao de processamento — publicar `SystemEvent` (type: `document_processed`). |

**Garantia de nao-quebra:** A entidade `Message` passa a ser usada EXCLUSIVAMENTE para `role: user` e `role: assistant` (conversa real). Todo o resto e `SystemEvent`. O `getTimeline` ja faz o merge, entao o chat continua mostrando tudo.

### Fase 4: Modo Timeline (Viewport Switcher)

**Objetivo:** Finalizar a transicao de modelo mental com um seletor de visao no `ChatPage`.

| Passo | Arquivo | Acao |
|-------|---------|------|
| 4.1 | `src/pages/ChatPage.jsx` | Adicionar switcher: "Conversacao" (filtra so Message) / "Linha do Tempo" (mostra tudo). |
| 4.2 | `src/components/timeline/TimelineEventRenderer.jsx` | Novo componente. Switch em `event.type` → renderiza card rico (EmailCard, WorkerCard, WatchCard). Default: card cinza generico. |
| 4.3 | `src/components/timeline/EmailEventCard.jsx` | Card rico para eventos `email_sent` (mostra destinatario, assunto, messageId). |
| 4.4 | `src/components/timeline/WatchEventCard.jsx` | Card rico para eventos `watch_triggered` (mostra nome do watch, horario). |

**Garantia de nao-quebra:** O modo default continua sendo "Conversacao" (so Message). O usuario opta por ver a timeline completa.

---

## 5. Codigo Morto, Legado e Paralelo — Mapa de Risco

Antes de tocar em qualquer arquivo, mapear o que e vivo vs morto:

### 5.1 VIVO (pode ser estendido com seguranca)

| Arquivo | Evidencia de uso |
|---------|------------------|
| `src/lib/cognitive-event-bus/CognitiveEventBus.ts` | Singleton globalThis, `onAny` disponivel, eventos ja emitidos por Planner/Pipeline |
| `src/lib/conversation-platform/ConversationManager.ts` | Ponto de entrada unico do ChatPage, imune a HMR |
| `src/lib/conversation-platform/ConversationStore.ts` | Singleton globalThis, state central do CXP |
| `src/pages/ChatPage.jsx` | Pagina atual em producao |
| `base44/entities/Message.jsonc` | Entidade viva, persistencia atual |

### 5.2 PARALELO (precaucao — barramentos separados)

| Arquivo | Risco |
|---------|-------|
| `src/runtime/connectors/RuntimeEventBus.ts` | Barramento SEPARADO do CognitiveEventBus. NAO compartilha historia. Se plugar persistence bridge aqui tambem, tratar como fonte independente. |
| `src/lib/conversation-platform/CXPTypes.ts` (`ConversationEvent` interface) | NAO e persistido. E o event system interno do ConversationStore. Nao confundir com a nova entidade `SystemEvent`. |

### 5.3 LEGADO/CANDIDATO A OBSOLESCENCIA (apos Fase 3)

| Arquivo/Entidade | Motivo |
|------------------|--------|
| `base44/entities/PendingWatchAction.jsonc` | Apos Fase 3, notificacoes de Watch passam a ser `SystemEvent`. PendingWatchAction torna-se redundante. NAO deletar na Fase 3 — marcar como deprecated, deletar apenas apos validacao completa. |
| Injecao de `Message` com `role: "assistant"` para confirmacoes de sistema | Toda logica que cria Message para "📧 Email enviado", "⏰ Aviso disparou" etc. sera substituida por SystemEvent. |

### 5.4 NAO EXISTE AINDA (a criar)

| Recurso | Quando |
|---------|--------|
| `base44/entities/SystemEvent.jsonc` | Fase 1.1 |
| `src/lib/event-persistence/EventPersistenceBridge.ts` | Fase 1.2 |
| `src/components/timeline/*` | Fase 4 |

---

## 6. Principios de Nao-Quebra

1. **Aditivo, nunca destrutivo:** Fase 1 apenas adiciona entidade + bridge. Nenhum codigo existing e removido.
2. **Merge no frontend:** O `getTimeline` junta Message + SystemEvent. O ChatPage continua funcionando porque recebe um array ordenado.
3. **Fallback para chat:** `Message` continua sendo o "fallback" para eventos de conversacao. `SystemEvent` e o "padrao" para tudo o resto.
4. **Bridge fire-and-forget:** Se o DB falhar ao persistir SystemEvent, o sistema nao quebra — o bridge engole o erro (mesmo padrao do CognitiveEventBus para handlers).
5. **Render polimorfico com default seguro:** `TimelineEventRenderer` com tipo desconhecido retorna card generico, nunca `null` (exceto na Fase 2 onde e explicitamente placeholder).
6. **Modo default = Conversacao:** O switcher da Fase 4 abre em "Conversacao" por default. A timeline completa e opt-in.

---

## 7. Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Volume de SystemEvent explode (milhoes de linhas) | Bridge deve ter politica de amostragem ou expiracao. Considerar TTL ou arquivamento em Fase 5. |
| Latencia do `getTimeline` (2 queries: Message + SystemEvent) | Usar `Promise.all` para queries paralelas. Indexar `conversationId` e `timestamp` (Base44 indexa automaticamente campos filtrados). |
| Re-render de timeline inteira a cada novo evento | Cada card deve ser `React.memo`. Usar `key` estavel (event.id). |
| Conflito de ordem entre Message e SystemEvent com mesmo timestamp | Ordenar por `timestamp` ASC, e desempate por `created_date` (Message) vs `timestamp` (SystemEvent). |

---

## 8. NAO Esta no Escopo Desta Sessao

- Implementacao de codigo (este documento e APENAS planejamento).
- Migracao de PendingWatchAction (so apos Fase 3 validada).
- Delecao de qualquer entidade ou codigo morto.
- Alteracao do `CognitiveEventBus` ou `RuntimeEventBus` originais (apenas plugar bridges externos).

---

## 9. Proximo Passo

Apos aprovacao deste documento, iniciar a **Fase 1**:
1. Criar `base44/entities/SystemEvent.jsonc`.
2. Criar `src/lib/event-persistence/EventPersistenceBridge.ts` + `index.ts`.
3. Adicionar `getTimeline()` no `ConversationManager.ts`.

Validar com `vite build` antes de considerar a Fase 1 completa.

---

## 10. Referencias Cruzadas

- **CognitiveEventBus (vivo):** `src/lib/cognitive-event-bus/CognitiveEventBus.ts`
- **RuntimeEventBus (paralelo, vivo):** `src/runtime/connectors/RuntimeEventBus.ts`
- **ConversationStore (vivo, eventos internos):** `src/lib/conversation-platform/ConversationStore.ts`
- **CXPTypes (conflito de nome):** `src/lib/conversation-platform/CXPTypes.ts` (interface `ConversationEvent` linhas 185-191)
- **Message (vivo, persistencia atual):** `base44/entities/Message.jsonc`
- **TimelineEvent (vivo, proposito diferente):** `base44/entities/TimelineEvent.jsonc` (timeline de projetos)
- **PendingWatchAction (legado apos Fase 3):** `base44/entities/PendingWatchAction.jsonc`
- **CLAUDE.md:** secao "2026-08-03 — Arquitetura Event-Driven Timeline (Planejamento)"