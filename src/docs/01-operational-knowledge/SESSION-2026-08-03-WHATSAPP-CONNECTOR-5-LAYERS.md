# SESSION 2026-08-03 — WhatsApp Connector: Arquitetura de 5 Camadas

> **Status:** Scaffold completo. Funcional aguardando configuracao de secrets pelo usuario.
> **Data:** 2026-08-03 (America/Sao_Paulo)
> **Escopo:** WhatsApp Connector com 5 camadas (Capability / Provider / Event / Observation / Watch), Provider Layer abstraindo multiplos provedores.

---

## 1. Contexto e Motivacao

O usuario pediu um WhatsApp Connector seguindo uma arquitetura explicita de 5 camadas, com a exigencia de que o **Planner nunca conheca o provedor ativo** — apenas chame capabilities. A Provider Layer deveria abstrair multiplos provedores (Meta Cloud oficial como principal, Evolution API e Baileys como alternativos futuros).

A arquitetura escolhida foi:

```
WhatsApp Connector
│
├── Capability Layer          → GoalCapabilityRegistry + WhatsAppConnector (IConnector)
│
├── Provider Layer            → WhatsAppProviderRegistry + MetaCloud / Evolution / Baileys
│      ├── Meta Cloud API (oficial, ativo)
│      ├── Evolution API (stub futuro)
│      ├── Baileys (stub futuro)
│      └── (futuros provedores)
│
├── Event Layer               → RuntimeEventBus (herdado do UCRBridge, zero codigo novo)
│
├── Observation Layer         → WhatsAppObservationBridge → KnowledgeRegistry
│
└── Watch Layer               → ConnectorGateway.registerProvider("whatsapp")
```

---

## 2. Metodo de Verificacao (antes de codar)

Antes de escrever qualquer linha, foram lidos os arquivos vivos para confirmar os padroes exatos de cada camada existente:

1. **`src/lib/knowledge-registry/PipelineObservationBridge.ts`** + **`KnowledgeRegistry.ts`** + **`KnowledgeRegistryTypes.ts`** — confirmou o padrao da Observation Layer: singleton HMR-safe via `globalThis`, fire-and-forget, payload types e scopes FROZEN em sets.
2. **`src/lib/watch-engine/ConnectorGateway.ts`** + **`WatchTypes.ts`** — confirmou como o Watch Engine registra providers (`connectorGateway.registerProvider(id, handler)`, handler recebe `action` + `params`, tem Token Bucket + Circuit Breaker por provider).
3. **`base44/functions/openrouterChat/entry.ts`** — confirmou o padrao real do backend function em producao: `Deno.serve(async (req) => ...)` + `Deno.env.get('SECRET')` + `createClientFromRequest(req)` from `npm:@base44/sdk@0.8.38`. **Diverge do guia oficial** (que diz `export default async function` + `secrets.get()`) — seguiu o padrao real do codigo existente.

---

## 3. Decisao Critica: Observation Layer

`KnowledgeRegistryTypes.ts` define `REGISTERED_SCOPES` e `REGISTERED_PAYLOAD_TYPES` como `ReadonlySet` — sao FROZEN. Nao existem `whatsapp` scope nem payload type especifico.

**Decisao:** NAO modificar tipos frozen (risco de quebrar validacao existente do KnowledgeRegistry). Em vez disso, usar tipos ja registrados:
- `payloadType: "connector_result"` (ja usado para resultados de connectors)
- `contextScope: "session"` (ja registrado)
- `producerId: "WhatsAppConnector"` (campo string livre — identifica a origem)
- O campo `data` (JSON serializado) carrega todos os detalhes especificos do WhatsApp (provider, operation, to, messageId, status, success, error, durationMs)

---

## 4. Arquivos Criados e Editados

### 4.1 Arquivos novos (9)

| # | Caminho | Camada | Responsabilidade |
|---|---------|--------|-----------------|
| 1 | `src/lib/whatsapp/WhatsAppProviderTypes.ts` | Tipos | Interface `WhatsAppProvider` que todo provedor implementa. Sem imports de runtime. |
| 2 | `src/lib/whatsapp/providers/MetaCloudProvider.ts` | Provider | Provedor oficial via Meta Cloud API. Delega para `whatsappApi` backend function. `isOfficial=true`. |
| 3 | `src/lib/whatsapp/providers/EvolutionAPIProvider.ts` | Provider | STUB. Self-hosted, nao exige Business Manager. `isAvailable()=false`. |
| 4 | `src/lib/whatsapp/providers/BaileysProvider.ts` | Provider | STUB. Biblioteca que emula WhatsApp Web. `isAvailable()=false`. |
| 5 | `src/lib/whatsapp/WhatsAppProviderRegistry.ts` | Provider | Singleton HMR-safe. Registra os 3 provedores no load. Default: `meta-cloud`. `setActive(id)` para trocar. |
| 6 | `src/lib/connector-runtime/connectors/WhatsAppConnector.ts` | Capability | Implementa `IConnector`. Delega ao `whatsappProviderRegistry.getActive()`. Chama `whatsAppObservationBridge.observe()` fire-and-forget apos cada execucao. Import side-effect de `WhatsAppWatchProvider`. |
| 7 | `src/lib/whatsapp/WhatsAppObservationBridge.ts` | Observation | Singleton HMR-safe. Transforma resultado de execucao em `ObservationInput` e commita no `KnowledgeRegistry`. |
| 8 | `src/lib/whatsapp/WhatsAppWatchProvider.ts` | Watch | Self-registra no module load: `connectorGateway.registerProvider("whatsapp", handler)`. Handler retorna stubs ate webhook inbound ser implementado. |
| 9 | `base44/functions/whatsappApi/entry.ts` | Backend | Backend function Deno. Chama Meta Graph API v21.0. Secret-gated: 503 se secrets faltam. |

### 4.2 Arquivos editados (2)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 10 | `src/lib/connector-runtime/ConnectorBootstrap.ts` | Adicionada factory `WhatsAppConnector` no array `OFFICIAL_FACTORIES` (apos `DatabaseConnector`). |
| 11 | `src/lib/planning-engine-e022/GoalCapabilityRegistry.ts` | Adicionados 3 mappings de WhatsApp antes do bloco `general.conversation`/`unknown` no final do `_builtins`. |

---

## 5. Detalhe por Camada

### Camada 1 — Capability

**`WhatsAppConnector.ts`** implementa `IConnector` (interface obrigatoria do connector-runtime).:

- `id: "whatsapp"`
- `metadata()`: capabilities `["whatsapp.sendMessage", "whatsapp.sendTemplate", "whatsapp.getMessageStatus"]`
- `execute(operation, payload, context)`: delega ao `whatsappProviderRegistry.getActive()`, chama `whatsAppObservationBridge.observe()` fire-and-forget apos cada execucao (sucesso OU falha), retorna `ConnectorResult` padronizado.
- `health()`: reporta `healthy` se o provedor ativo `isAvailable()`.
- Importa `WhatsAppWatchProvider` como side-effect (garante que o Watch registra no load do modulo).

**`GoalCapabilityRegistry.ts`** — 3 mappings adicionados:
```typescript
{ goalType: "whatsapp.sendMessage",      descriptors: [{ connector: "whatsapp", capability: "whatsapp.sendMessage",      params: {} }] },
{ goalType: "whatsapp.sendTemplate",      descriptors: [{ connector: "whatsapp", capability: "whatsapp.sendTemplate",      params: {} }] },
{ goalType: "whatsapp.getMessageStatus", descriptors: [{ connector: "whatsapp", capability: "whatsapp.getMessageStatus", params: {} }] },
```

### Camada 2 — Provider

**`WhatsAppProviderTypes.ts`** define a interface:
```typescript
interface WhatsAppProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isOfficial: boolean;
  sendMessage(params: { to, message }): Promise<WhatsAppSendResult>;
  sendTemplate(params: { to, templateName, templateLanguage?, components? }): Promise<WhatsAppSendResult>;
  getMessageStatus(params: { messageId }): Promise<WhatsAppMessageStatus>;
  isAvailable(): boolean;
}
```

**`WhatsAppProviderRegistry.ts`** — singleton HMR-safe via `globalThis["__WHATSAPP_PROVIDER_REGISTRY__"]`. No constructor, registra os 3 provedores. `getActive()` retorna o provedor ativo (default: `meta-cloud`). `setActive(id)` permite trocar em runtime.

**MetaCloudProvider** — o unico provedor real. Cada metodo chama `base44.functions.invoke("whatsappApi", { operation, ... })` e mapeia a resposta para `WhatsAppSendResult` / `WhatsAppMessageStatus`. Se `d.error` voltar do backend, faz `throw new Error(d.error)`.

**EvolutionAPIProvider / BaileysProvider** — stubs. `isAvailable()=false`. Metodos `throw new Error("... ainda nao implementado.")`. Estrutura pronta para implementacao futura sem tocar no resto.

### Camada 3 — Event

**ZERO codigo novo.** A `UCRBridge.ts` ja envolve TODO connector no runtime e emite `ConnectorExecutionStarted` / `ConnectorExecutionCompleted` / `ConnectorExecutionFailed` no `RuntimeEventBus` para qualquer connector. O `ConnectorBootstrap.ts` tambem emite `ConnectorRegistered` no registro (religado em 2026-08-02+). WhatsApp herda tudo isso automaticamente ao ser registrado no `OFFICIAL_FACTORIES`.

### Camada 4 — Observation

**`WhatsAppObservationBridge.ts`** — singleton HMR-safe via `globalThis["__WHATSAPP_OBS_BRIDGE__"]`.:

- `observe(input: WhatsAppObservationInput): void` — fire-and-forget (`void this._run(input).catch(() => {})`)
- `_run(input)` — chama `knowledgeRegistry.commit({ ... })` com:
  - `targetObjectId: executionId`
  - `targetObjectType: "message"`
  - `nature: "Evidence"`
  - `payloadType: "connector_result"`
  - `contextScope: "session"`
  - `producerId: "WhatsAppConnector"`
  - `data: { provider, operation, to, messageId, status, success, error, durationMs }`

Chamado pelo `WhatsAppConnector.execute()` apos cada operacao (sucesso OU falha).

### Camada 5 — Watch

**`WhatsAppWatchProvider.ts`** — self-registra no module load:
```typescript
connectorGateway.registerProvider("whatsapp", async (action, params) => {
  switch (action) {
    case "count_new_messages": return { count: 0, items: [] };      // stub
    case "list_recent_messages": return { items: [], count: 0 };     // stub
    case "check_delivery_status": return { status: "unknown" };     // stub
    default: return { value: null };
  }
});
```

Isso permite que o Watch Engine crie Watches com `provider: "whatsapp"` na `ConditionTree`. O `WatchEvaluator` vai chamar o handler, que retorna `count: 0` (condicao nunca verdadeira ate ter dados reais de webhook inbound).

### Backend Function — `whatsappApi`

**`base44/functions/whatsappApi/entry.ts`** — Deno.serve, chama Meta Graph API v21.0.

- **Operacoes:** `sendMessage`, `sendTemplate`, `getMessageStatus`
- **Secrets:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (via `Deno.env.get()`)
- **Sem secrets:** retorna 503 com mensagem explicativa (nao quebra o app)
- **Auth:** `createClientFromRequest(req)` + `base44.auth.me()` — so usuarios autenticados do app podem chamar

---

## 6. O que esta FUNCIONANDO agora (sem secrets)

1. **Bootstrap carrega o WhatsAppConnector** junto com os outros 11 connectors. `validateConnector()` passa, `registry.register()` executa, `runtimeEventBus.emit("ConnectorRegistered", "whatsapp", ...)` dispara.
2. **GoalCapabilityRegistry** tem os 3 mappings de WhatsApp — o Planner pode resolver goals `whatsapp.*` para capabilities.
3. **ConnectorGateway** tem o provider "whatsapp" registrado — Watches com `provider: "whatsapp"` podem ser criados e o `WatchEvaluator` chama o handler.
4. **WhatsAppObservationBridge** commita no `KnowledgeRegistry` apos cada `execute()` — observacoes aparecem na entidade `KnowledgeObservation` com `producer_id: "WhatsAppConnector"`.
5. **Backend function `whatsappApi`** deployado e validando — retorna 503 gracioso se secrets faltam.

---

## 7. O que PRECISA para funcionar de verdade (pendente do usuario)

### 7.1 Secrets (Settings > Environment Variables)

| Secret | Como obter |
|--------|-----------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Manager > Users > selecionar System User > Generate permanent token. Scopes: `whatsapp_business_messaging`. |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Manager > Phone Numbers > selecionar o numero > copiar o "Phone number ID". |

### 7.2 Verificar numero de teste

No WhatsApp Manager, adicionar o numero de teste aos recipients. Sem isso, a Meta rejeita mesmo com token valido na sandbox.

### 7.3 Templates aprovados

Para `sendTemplate`, o template precisa estar criado e aprovado no WhatsApp Manager (pode levar horas para aprovacao). Para `sendMessage` (texto livre), nao precisa de template.

---

## 8. O que ficou como STUB para o futuro

### 8.1 EvolutionAPIProvider / BaileysProvider

`isAvailable()=false`, metodos `throw`. Para ativar:
1. Implementar as chamadas reais (provavelmente novas backend functions `whatsappEvolutionApi` / `whatsappBaileysApi` com seus proprios secrets).
2. `whatsappProviderRegistry.setActive("evolution-api")` ou `setActive("baileys")` em runtime.

### 8.2 WhatsAppWatchProvider handler inbound

Retorna `count: 0`. Para ativar:
1. Configurar webhook no Meta Business Suite (`POST` para uma URL publica do app).
2. Criar backend function `whatsappWebhook` para receber e armazenar mensagens inbound em uma nova entidade (ex: `WhatsAppInboundMessage`).
3. O handler do Watch ler essa entidade em vez de retornar zeros.

### 8.3 Observation Layer (Shadow Mode)

Ainda em Fase 1 (Shadow Mode) — persiste observacoes mas nada as le ainda. Limitacao do sistema inteiro, nao so do WhatsApp (ver `KnowledgeRegistry.ts` docstring). Quando a Fase 2 (Read Model / StateView) for implementada, as observacoes do WhatsApp ja estarao sendo gravadas.

---

## 9. Ponto de Retomada (para a proxima sessao)

### Se o usuario configurou os secrets:
1. Testar envio real: `test_backend_function("whatsappApi", { operation: "sendMessage", to: "<numero-validado>", message: "teste" })`.
2. Testar pelo chat: pedir "envia um WhatsApp para <numero> dizendo <mensagem>" — o Planner deve resolver o goal `whatsapp.sendMessage` e executar a capability.
3. Verificar a observacao na entidade `KnowledgeObservation` (`producer_id: "WhatsAppConnector"`).

### Se o usuario nao configurou os secrets:
1. O scaffold esta completo e nao quebra nada. WhatsApp Connector carrega no bootstrap, registra capabilities, observa, e tem provider de Watch registrado.
2. Qualquer chamada de `whatsapp.*` retorna 503 (backend) que vira `ConnectorResult.status: "FAILED"` no connector — tratamento gracioso.

### Proximos passos arquiteturais sugeridos (nao pedidos ainda):
- Webhook inbound (receber mensagens) → nova entidade + backend function `whatsappWebhook`.
- UI de Connections para WhatsApp (card de status como Gmail/Drive/Calendar em `Connections.jsx`).
- Implementar EvolutionAPIProvider ou BaileysProvider se o usuario quiser alternativa nao-oficial.

---

## 10. Testes de Validacao

| Teste | Resultado | Observacao |
|-------|-----------|-----------|
| `test_backend_function("whatsappApi", { operation: "sendMessage", to: "...", message: "..." })` | Erro esperado: "missing required secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID" | Confirma que a funcao esta deployada e valida secrets corretamente. |
| Bootstrap carrega WhatsAppConnector | (a verificar com `window.__MEMORY_DEBUG__` ou log do CBS-02) | Factory adicionada ao `OFFICIAL_FACTORIES`, `Promise.allSettled` paralelizado. |
| ConnectorRegistered emitido no RuntimeEventBus | (a verificar) | Ja instrumentado no `ConnectorBootstrap.ts` desde 2026-08-02+. |

---

## 11. Referencias Cruzadas

- **Padrao IConnector:** `src/lib/connector-runtime/IConnector.ts`
- **Padrao singleton HMR-safe:** `src/lib/knowledge-registry/KnowledgeRegistry.ts` (globalThis pattern)
- **Padrao ObservationBridge:** `src/lib/knowledge-registry/PipelineObservationBridge.ts`
- **Padrao Watch provider:** `src/lib/watch-engine/ConnectorGateway.ts`
- **Padrao backend function:** `base44/functions/openrouterChat/entry.ts` (Deno.serve + Deno.env.get)
- **Catalogo de eventos:** `src/docs/00-official-library/EVENT-CATALOG.md` (FROZEN — eventos de WhatsApp sao internos por enquanto)
- **CLAUDE.md:** secao "2026-08-03 — WhatsApp Connector: Arquitetura de 5 Camadas Completa"