# MCF-Operations — Comunicação, Resiliência, Filas, Cache, Telemetria

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 4 de 5 do MCF  
**Referência:** MES §21 — Eventos, §22 — Observabilidade, §23 — Auditoria

---

## 1. Eventos Emitidos pelo Connector

Todo Connector deve emitir os seguintes eventos via Universal Event Bus (UEB):

### 1.1 Eventos Obrigatórios (Lifecycle)

```typescript
const LIFECYCLE_EVENTS = {
  CONNECTOR_INITIALIZED:     "connector.initialized",
  CONNECTOR_CONNECTED:       "connector.connected",
  CONNECTOR_DISCONNECTED:    "connector.disconnected",
  CONNECTOR_DESTROYED:       "connector.destroyed",
  CONNECTOR_UPDATED:         "connector.updated",
  CONNECTOR_FAILED:          "connector.failed",
  CONNECTOR_RECOVERED:       "connector.recovered",
};
```

### 1.2 Eventos Obrigatórios (Execução)

```typescript
const EXECUTION_EVENTS = {
  CONNECTOR_REQUEST_RECEIVED:   "connector.request.received",
  CONNECTOR_REQUEST_STARTED:    "connector.request.started",
  CONNECTOR_REQUEST_COMPLETED:  "connector.request.completed",
  CONNECTOR_REQUEST_FAILED:     "connector.request.failed",
  CONNECTOR_REQUEST_RETRIED:    "connector.request.retried",
  CONNECTOR_CACHE_HIT:          "connector.cache.hit",
  CONNECTOR_CACHE_MISS:         "connector.cache.miss",
  CONNECTOR_RATE_LIMITED:       "connector.rate.limited",
  CONNECTOR_CIRCUIT_OPEN:       "connector.circuit.open",
  CONNECTOR_CIRCUIT_CLOSED:     "connector.circuit.closed",
};
```

### 1.3 Estrutura do Evento

```typescript
interface ConnectorEvent {
  eventId: string;            // ID sequencial
  eventType: string;          // Ex: "connector.request.completed"
  connectorId: string;
  connectorName: string;
  timestamp: string;          // ISO 8601
  priority: EventPriority;    // HIGH | NORMAL | LOW
  payload: {
    requestId?: string;
    action?: string;
    status?: string;
    executionTimeMs?: number;
    errorCode?: string;
    metadata: Record<string, unknown>;
  };
  // Nunca inclui dados sensíveis ou tokens
}
```

---

## 2. Eventos Recebidos pelo Connector

Connectors do tipo INBOUND ou BIDIRECTIONAL podem receber eventos externos (webhooks, streams).

### 2.1 Processamento de Webhooks

```
Sistema Externo → Webhook endpoint → Connector → Normalizar → UEB
                                         │
                                   Validar assinatura
                                   do webhook (HMAC)
                                         │
                                    Aceitar ou rejeitar
```

```typescript
interface InboundEventHandler {
  // Validar autenticidade do evento recebido
  validateWebhookSignature(
    payload: Buffer,
    signature: string,
    secret: string
  ): boolean;
  
  // Normalizar evento externo → evento interno MemoryOS
  normalizeInboundEvent(
    rawEvent: unknown
  ): ConnectorEvent;
  
  // Processar e publicar no UEB
  handleInboundEvent(
    rawEvent: unknown,
    headers: Record<string, string>
  ): Promise<void>;
}
```

---

## 3. Comunicação com o Core

```
┌─────────────────────────────────────────────────────────────────┐
│          REGRAS DE COMUNICAÇÃO: CONNECTOR ↔ CORE                │
└─────────────────────────────────────────────────────────────────┘

O Connector NUNCA chama o Core diretamente.

Toda comunicação ocorre via:
  1. ConnectorResponse (retorno da execução)
  2. ConnectorEvent (via Universal Event Bus)
  3. MemoryUpdateProposal (proposta de atualização de memória)

O Core pode chamar o Connector apenas via:
  1. Connector Manager → ConnectorRequest

PROIBIDO:
  ❌ Connector chamar Core.interpret()
  ❌ Connector chamar Memory.save()
  ❌ Connector chamar Specialist.analyze()
  ❌ Connector injetar dependências do Core

PERMITIDO:
  ✅ Connector retornar ConnectorResponse com memoryUpdates[]
  ✅ Connector emitir eventos que o Core pode escutar via UEB
  ✅ Connector propor atualizações via MemoryUpdateProposal
```

---

## 4. Comunicação com Agentes Permanentes

```
Agentes Permanentes são entidades autônomas que operam de forma proativa.

Um Connector pode reagir a eventos de Agentes via UEB:

  Agente → UEB → Evento: "agent.task.requested"
       │
       ▼
  Connector Manager interpreta
       │
       ▼
  ConnectorRequest enviado ao Connector
       │
       ▼
  ConnectorResponse retornado ao Agente via UEB

Um Connector NUNCA conhece o Agente.
Ele apenas processa o ConnectorRequest normalizado.
```

---

## 5. Comunicação com Specialists

```
REGRA ABSOLUTA:
  Connectors NÃO conhecem Specialists.
  Specialists NÃO conhecem Connectors.

Se um Specialist precisar de dados externos:
  1. Specialist retorna análise ao Core
  2. Core instrui o Execution Planner
  3. Planner cria ConnectorRequest
  4. Connector Manager executa via Connector
  5. Resultado retorna ao Core
  6. Core fornece resultado ao Specialist (se necessário)

NUNCA: Specialist → Connector (chamada direta)
```

---

## 6. Comunicação entre Connectors

```
REGRA ABSOLUTA:
  Connectors NUNCA se comunicam diretamente.

Caso a execução de uma ação em ConnectorA
dependa de dados de ConnectorB:

  1. Connector Manager orquestra a sequência
  2. Request → ConnectorB (primeiro)
  3. Resultado do B incluído no request do A
  4. Request → ConnectorA (com dados do B injetados)

NUNCA: ConnectorA.call(ConnectorB)
SEMPRE: Orchestration via Connector Manager
```

### 6.1 Dependências entre Connectors — Diagrama

```
Objetivo: "Enviar relatório de vendas por e-mail"
       │
       ▼
Execution Planner detecta dependência:
  1. Bling Connector → buscar relatório
  2. Gmail Connector → enviar e-mail com relatório
       │
       ▼
Connector Manager orquestra:

  ┌──────────────┐     resultado     ┌──────────────┐
  │    Bling     │ ─────────────────►│    Gmail     │
  │  Connector   │                   │  Connector   │
  └──────────────┘                   └──────────────┘
       ↑                                   ↑
       │    Connector Manager controla     │
       └───────────────────────────────────┘
```

---

## 7. Gerenciamento de Contexto

```typescript
interface ConnectorContextManager {
  // Contexto de sessão — ativo apenas durante a execução
  getSessionContext(userId: string, sessionId: string): SessionContext;
  
  // O Connector não armazena contexto permanente
  // Toda persistência ocorre via MemoryUpdateProposal
  
  // Contexto de configuração — carregado na inicialização
  getConfig(): ConnectorConfig;
  
  // Contexto de autenticação — gerenciado pelo AuthManager
  getAuthContext(userId: string): AuthContext;
}
```

---

## 8. Gerenciamento de Memória (Proposta de Atualização)

O Connector **nunca** escreve diretamente na memória do usuário.

Ele **propõe** atualizações via `MemoryUpdateProposal`:

```typescript
interface MemoryUpdateProposal {
  proposalId: string;
  connectorId: string;
  requestId: string;
  userId: string;
  
  updates: {
    type: "ENTITY" | "FACT" | "EVENT" | "PREFERENCE";
    operation: "CREATE" | "UPDATE" | "DELETE";
    data: unknown;
    confidence: number;  // 0.0 a 1.0
    source: string;      // Ex: "GMAIL_EMAIL_READ"
  }[];
  
  // A Memory Engine decide se aceita, rejeita ou modifica a proposta
}
```

---

## 9. Cache

### 9.1 Política de Cache por Tipo de Ação

```
┌────────────────────────────────────────────────────────────┐
│                   POLÍTICA DE CACHE                        │
├──────────────────────┬─────────┬──────────────────────────┤
│ Tipo de Ação         │ Cache?  │ TTL Padrão               │
├──────────────────────┼─────────┼──────────────────────────┤
│ Leitura (GET, LIST)  │ ✅ Sim  │ 5 minutos                │
│ Pesquisa (SEARCH)    │ ✅ Sim  │ 2 minutos                │
│ Capacidades          │ ✅ Sim  │ 1 hora                   │
│ Disponibilidade      │ ✅ Sim  │ 30 segundos              │
│ Escrita (SEND, POST) │ ❌ Não  │ -                        │
│ Exclusão (DELETE)    │ ❌ Não  │ -                        │
│ Autenticação         │ ❌ Não  │ -                        │
│ Dados PII            │ ❌ Não  │ Nunca                    │
├──────────────────────┼─────────┼──────────────────────────┤
│ Configurável por     │ ✅ Sim  │ capability.cacheTtlSec   │
│ ConnectorCapability  │         │                          │
└──────────────────────┴─────────┴──────────────────────────┘
```

### 9.2 Chave de Cache

```
cache_key = SHA-256(
  connectorId +
  userId +
  action +
  JSON.stringify(payload, sorted_keys)
)

A chave garante:
  ✅ Isolamento por usuário
  ✅ Isolamento por Connector
  ✅ Determinismo (mesma entrada = mesma chave)
```

### 9.3 Invalidação de Cache

```typescript
// Eventos que invalidam cache automaticamente
const CACHE_INVALIDATION_TRIGGERS = {
  "connector.auth.revoked": "invalidate all for userId",
  "connector.disconnected": "invalidate all for connectorId",
  "connector.updated": "invalidate all for connectorId",
  "user.logout": "invalidate all for userId",
};
```

---

## 10. Logs

### 10.1 Estrutura do Log

```typescript
interface ConnectorLog {
  logId: string;
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  connectorId: string;
  requestId?: string;
  message: string;
  context: Record<string, unknown>;
  // NUNCA inclui: tokens, passwords, dados PII, payloads completos
}
```

### 10.2 Regras de Logging

```
OBRIGATÓRIO logar:
  ✅ Início e fim de cada request (INFO)
  ✅ Erros com contexto (ERROR)
  ✅ Retries (WARN)
  ✅ Cache hit/miss (DEBUG)
  ✅ Circuit Breaker state changes (WARN)
  ✅ Auth refresh (INFO)

PROIBIDO logar:
  ❌ Access tokens ou refresh tokens
  ❌ API keys ou senhas
  ❌ Dados PII do usuário (e-mails, CPF, etc.)
  ❌ Payloads completos de requests/responses
  ❌ Dados financeiros (números de cartão, etc.)
```

---

## 11. Telemetria

```typescript
interface ConnectorMetrics {
  connectorId: string;
  period: string;               // "1h" | "24h" | "7d" | "30d"
  collectedAt: string;
  
  // Volume
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retriedRequests: number;
  cachedRequests: number;
  
  // Latência
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  
  // Disponibilidade
  uptimePercent: number;
  circuitOpenCount: number;
  
  // Erros
  errorsByCategory: Record<ErrorCategory, number>;
  topErrors: { code: string; count: number }[];
  
  // Uso por ação
  requestsByAction: Record<string, number>;
  
  // Autenticação
  tokenRefreshCount: number;
  authFailureCount: number;
  
  // Cache
  cacheHitRate: number;
  cacheSize: number;
}
```

---

## 12. Políticas de Retry

### 12.1 Estratégias de Backoff

```typescript
type BackoffStrategy =
  | "NONE"           // Sem espera entre tentativas
  | "LINEAR"         // Espera fixa entre tentativas
  | "EXPONENTIAL"    // Espera dobra a cada tentativa
  | "JITTER"         // Exponencial + ruído aleatório
  | "RESPECT_HEADER"; // Usa o valor do header Retry-After

// Configuração padrão por categoria de erro
const DEFAULT_RETRY_CONFIG = {
  NETWORK_ERROR: {
    strategy: "EXPONENTIAL",
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    multiplier: 2.0
  },
  RATE_LIMIT: {
    strategy: "RESPECT_HEADER",
    maxRetries: 5,
    defaultDelayMs: 60000
  },
  TIMEOUT: {
    strategy: "LINEAR",
    maxRetries: 2,
    baseDelayMs: 1000
  },
  AUTH_ERROR: {
    strategy: "NONE",
    maxRetries: 1,           // Apenas 1 retry após refresh
    autoRefreshFirst: true
  }
};
```

### 12.2 Cálculo de Backoff Exponencial com Jitter

```
delay = min(maxDelay, baseDelay × multiplier^attempt + jitter)

Onde:
  attempt = número da tentativa (0-based)
  jitter = random(0, baseDelay × 0.1)

Exemplo (baseDelay=500ms, multiplier=2):
  Tentativa 0 (imediata): 0ms
  Tentativa 1: ~500ms + jitter
  Tentativa 2: ~1000ms + jitter
  Tentativa 3: ~2000ms + jitter (máximo)
```

---

## 13. Timeout

### 13.1 Níveis de Timeout

```
┌─────────────────────────────────────────────────────────────┐
│                    HIERARQUIA DE TIMEOUT                    │
├──────────────────────────────┬──────────────────────────────┤
│ Nível                        │ Timeout Padrão               │
├──────────────────────────────┼──────────────────────────────┤
│ Request total                │ 30 segundos                  │
│ Conexão TCP                  │ 5 segundos                   │
│ Resposta HTTP                │ 20 segundos                  │
│ Health check                 │ 5 segundos                   │
│ Auth flow                    │ 60 segundos                  │
│ Token refresh                │ 10 segundos                  │
│ Webhook processing           │ 15 segundos                  │
│ Graceful shutdown            │ 30 segundos                  │
├──────────────────────────────┼──────────────────────────────┤
│ Configurável por capability  │ capability.estimatedLatency  │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 14. Controle de Concorrência

```typescript
interface ConcurrencyControl {
  // Máximo de execuções simultâneas por Connector
  maxConcurrentRequests: number;   // Padrão: 50
  
  // Máximo por usuário
  maxConcurrentPerUser: number;    // Padrão: 10
  
  // Máximo por ação
  maxConcurrentPerAction?: Record<string, number>;
  
  // Comportamento quando limite atingido
  overflowBehavior: "QUEUE" | "REJECT" | "WAIT";
  
  // Mutex para operações não-idempotentes
  mutexEnabled: boolean;           // Para escritas e exclusões
  mutexTimeoutMs: number;          // Padrão: 5000ms
}
```

---

## 15. Controle de Fila

```typescript
interface QueuePolicy {
  // Fila por Connector
  maxQueueSize: number;           // Padrão: 1000 requests
  
  // Prioridades na fila
  priorityLevels: {
    HIGH: number;                 // % da fila reservada: 40%
    NORMAL: number;               // % da fila reservada: 50%
    LOW: number;                  // % da fila reservada: 10%
  };
  
  // Expiração de requests na fila
  requestTtlMs: number;           // Padrão: 60000ms
  
  // Comportamento quando fila cheia
  fullQueueBehavior: "REJECT_LOW" | "REJECT_ALL";
  
  // Dead Letter Queue para requests não processados
  dlqEnabled: boolean;
  dlqRetentionMs: number;         // Padrão: 3600000ms (1h)
}
```

---

## 16. Prioridades de Request

```typescript
type RequestPriority = "HIGH" | "NORMAL" | "LOW";

// Prioridade atribuída automaticamente pelo Connector Manager
const PRIORITY_RULES = {
  // Interação direta do usuário = HIGH
  userInitiated: "HIGH",
  
  // Tasks automáticas em background = NORMAL
  scheduledTask: "NORMAL",
  
  // Analytics e telemetria = LOW
  analytics: "LOW",
  
  // Retry de requests falhos = prioridade original
  retry: "inherit"
};
```

---

## 17. Execução Paralela

```typescript
// Requests independentes ao mesmo Connector (ou Connectors diferentes)
// podem ser executados em paralelo

interface ParallelExecution {
  // Máximo de execuções paralelas neste grupo
  maxParallel: number;
  
  // Estratégia de agregação dos resultados
  aggregationStrategy: "ALL" | "FIRST_SUCCESS" | "FASTEST";
  
  // Timeout geral do grupo
  groupTimeoutMs: number;
  
  // Comportamento se algum falha
  failureBehavior: "FAIL_ALL" | "IGNORE_PARTIAL" | "RETURN_PARTIAL";
}

// Exemplo: Buscar e-mails recentes + listar eventos do calendário em paralelo
const parallel = createParallelExecution({
  requests: [
    { connector: "gmail", action: "LIST_MESSAGES", payload: { limit: 10 } },
    { connector: "gcalendar", action: "LIST_EVENTS", payload: { days: 7 } }
  ],
  maxParallel: 2,
  aggregationStrategy: "ALL",
  groupTimeoutMs: 15000,
  failureBehavior: "RETURN_PARTIAL"
});
```

---

## 18. Alta Disponibilidade

```
┌─────────────────────────────────────────────────────────────────┐
│              ESTRATÉGIAS DE ALTA DISPONIBILIDADE                │
└─────────────────────────────────────────────────────────────────┘

1. RÉPLICAS ATIVAS
   Múltiplas instâncias do Connector ativas simultaneamente
   Load balancer distribui requests
   Failover automático em < 100ms

2. CIRCUIT BREAKER (já documentado no MCF-Lifecycle §10)

3. FALLBACK PARA CONNECTOR ALTERNATIVO
   Se GmailConnector falha → tentar OutlookConnector
   (Configurado pelo usuário nas preferências)
   Requer Service Layer para abstração

4. CACHE COMO FALLBACK DE LEITURA
   Em caso de falha do sistema externo:
   ├── Retornar dados em cache (se disponível)
   └── Indicar no response: metadata.cacheHit = true, metadata.stale = true

5. GRACEFUL DEGRADATION
   ├── Ação crítica falhou → retornar erro claro
   └── Ação opcional falhou → omitir resultado parcialmente
```

---

## 19. Escalabilidade

```
Cada Connector é stateless entre requests.
O estado de autenticação é centralizado no Auth Vault.
O cache é compartilhado (Redis/Memcached em produção).
Novas instâncias podem ser adicionadas sem configuração.

Targets de escalabilidade por tier:
┌─────────────────┬──────────────┬──────────────┬──────────────┐
│ Tier            │ Requests/min │ Connectors   │ Usuários     │
├─────────────────┼──────────────┼──────────────┼──────────────┤
│ Personal        │ 100          │ 10           │ 1            │
│ Professional    │ 1.000        │ 50           │ 10           │
│ Business        │ 10.000       │ 200          │ 100          │
│ Enterprise      │ 100.000      │ 1.000        │ 10.000       │
│ Platform        │ 1.000.000    │ 10.000+      │ 1.000.000    │
└─────────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 20. Balanceamento

```
INBOUND: Round-robin entre instâncias ativas
OUTBOUND: Least-connections para otimizar latência
BIDIRECTIONAL: Sticky session por userId (mesma instância para o mesmo usuário)

Saúde das instâncias verificada a cada 10 segundos.
Instâncias unhealthy removidas automaticamente do pool.
Nova instância adicionada ao pool após 3 health checks bem-sucedidos.
```

---

**Documento Oficial:** MCF-Operations  
**Versão:** 1.0  
**Status:** Aprovado  
**Parte:** 4 de 5 do MemoryOS Connector Framework