# MCF-Lifecycle — Ciclo de Vida, Estrutura e Descoberta de Capacidades

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 2 de 5 do MCF  
**Referência:** MCF §4 — Ciclo de Vida Completo

---

## 1. Estados Oficiais do Ciclo de Vida

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONNECTOR LIFECYCLE STATES                       │
└─────────────────────────────────────────────────────────────────────┘

          ┌─────────────┐
          │   CREATED   │  ← Objeto instanciado, não inicializado
          └──────┬──────┘
                 │ initialize()
                 ▼
          ┌─────────────┐
          │ INITIALIZED │  ← Config carregada, pronto para autenticar
          └──────┬──────┘
                 │ connect()
                 ▼
          ┌─────────────┐◄────────────────────────────┐
          │  CONNECTED  │  ← Autenticado e operacional │
          └──────┬──────┘                             │
                 │                                    │
        ┌────────┼────────┐                           │
        │        │        │                           │
  disconnect() error()  update()                   reconnect()
        │        │        │                           │
        ▼        ▼        ▼                           │
  ┌──────────┐ ┌───────┐ ┌────────────┐              │
  │DISCONNECT│ │FAILED │ │  UPDATING  │              │
  │  -ED     │ │       │ │            │              │
  └──────┬───┘ └───┬───┘ └─────┬──────┘              │
         │         │           │                      │
    destroy()   recover()  complete()                 │
         │         └────────────┘                     │
         │                │                           │
         ▼           reconnect()─────────────────────►┘
     ┌─────────┐
     │DESTROYED│  ← Terminal. Não pode ser reativado.
     └─────────┘
```

### 1.1 Tabela de Transições Válidas

| De | Para | Via | Condição |
|---|---|---|---|
| CREATED | INITIALIZED | initialize() | Config válida |
| INITIALIZED | CONNECTED | connect() | Credenciais válidas |
| CONNECTED | DISCONNECTED | disconnect() | Chamada explícita |
| CONNECTED | FAILED | error interno | Falha não recuperável |
| CONNECTED | UPDATING | update() | Nova versão disponível |
| DISCONNECTED | CONNECTED | reconnect() | Credenciais válidas |
| DISCONNECTED | DESTROYED | destroy() | Chamada explícita |
| FAILED | CONNECTED | recover() | Falha recuperável |
| FAILED | DESTROYED | destroy() | Falha não recuperável |
| UPDATING | CONNECTED | complete() | Atualização bem-sucedida |

---

## 2. Fase 1 — Instalação

A instalação não é responsabilidade do Connector em si, mas do **Connector Manager** e do **Connector Registry Engine (CRE)**.

```
┌─────────────────────────────────────────────────────────┐
│                  FLUXO DE INSTALAÇÃO                    │
└─────────────────────────────────────────────────────────┘

  1. Usuário ou administrador solicita instalação
         │
         ▼
  2. Connector Manager recebe o pacote do Connector
         │
         ▼
  3. Validação de Manifesto
     ├── Assinatura digital verificada? ✓
     ├── SDK compatibility ok? ✓
     ├── MemoryOS version ok? ✓
     └── Permissões declaradas? ✓
         │
         ▼
  4. Policy Engine autoriza permissões declaradas
         │
         ▼
  5. Registro no CRE (Connector Registry Engine)
     ├── register(manifest)
     ├── index por vendor, category, type, capability
     └── status: REGISTERED
         │
         ▼
  6. Connector disponível para uso
```

---

## 3. Fase 2 — Autenticação

```typescript
interface AuthFlow {
  // Tipo de autenticação suportado pelo Connector
  authType: AuthType;
  
  // Iniciação do fluxo de autenticação
  initiateAuth(params: AuthInitParams): Promise<AuthInitResult>;
  
  // Conclusão após callback/code exchange
  completeAuth(params: AuthCompleteParams): Promise<AuthCredentials>;
  
  // Refresh automático de token expirado
  refreshAuth(credentials: AuthCredentials): Promise<AuthCredentials>;
  
  // Revogação de acesso
  revokeAuth(credentials: AuthCredentials): Promise<void>;
  
  // Verificação de validade das credenciais
  validateAuth(credentials: AuthCredentials): Promise<AuthValidationResult>;
}

type AuthType =
  | "OAUTH2"           // Gmail, Google Calendar, Shopify
  | "OAUTH2_PKCE"      // Apps mobile e single-page
  | "API_KEY"          // Bling, TOTVS simples, Zebra
  | "BEARER_TOKEN"     // Tokens estáticos
  | "BASIC_AUTH"       // Sistemas legados
  | "SAML"             // SSO corporativo
  | "MTLS"             // Certificado mútuo TLS
  | "CUSTOM";          // Protocolos proprietários (Amadeus, Sabre)
```

### 3.1 Fluxo OAuth 2.0 (padrão para Gmail, Google Calendar)

```
┌──────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────┐
│ MemoryOS │      │ Connector    │      │ Auth Server │      │ External │
│   Core   │      │  (Gmail)     │      │  (Google)   │      │   API    │
└────┬─────┘      └──────┬───────┘      └──────┬──────┘      └────┬─────┘
     │                   │                     │                   │
     │ initiateAuth()    │                     │                   │
     │──────────────────►│                     │                   │
     │                   │                     │                   │
     │ authUrl           │                     │                   │
     │◄──────────────────│                     │                   │
     │                   │                     │                   │
     │ [Usuário autoriza no browser]            │                   │
     │                   │                     │                   │
     │ completeAuth(code)│                     │                   │
     │──────────────────►│                     │                   │
     │                   │ exchange code       │                   │
     │                   │────────────────────►│                   │
     │                   │                     │                   │
     │                   │ access_token +      │                   │
     │                   │ refresh_token       │                   │
     │                   │◄────────────────────│                   │
     │                   │                     │                   │
     │ AuthCredentials   │                     │                   │
     │◄──────────────────│                     │                   │
     │                   │                     │                   │
     │ execute(request)  │                     │                   │
     │──────────────────►│                     │                   │
     │                   │ API call            │                   │
     │                   │────────────────────────────────────────►│
     │                   │                     │                   │
     │                   │         response    │                   │
     │                   │◄────────────────────────────────────────│
     │ ConnectorResponse │                     │                   │
     │◄──────────────────│                     │                   │
```

---

## 4. Fase 3 — Inicialização

```typescript
interface InitResult {
  status: "SUCCESS" | "FAILED";
  lifecycleState: "INITIALIZED";
  loadedConfig: ConnectorConfig;
  validatedPermissions: string[];
  discoveredCapabilities: ConnectorCapability[];
  error?: ConnectorError;
  initializationTimeMs: number;
}

// Sequência obrigatória de inicialização
async function initialize(config: ConnectorConfig): Promise<InitResult> {
  // 1. Validar configuração recebida
  validateConfig(config);
  
  // 2. Carregar hooks registrados
  hookManager.load(config.hooks);
  
  // 3. Executar hook beforeInitialize
  await hookManager.run("beforeInitialize", config);
  
  // 4. Verificar compatibilidade de SDK
  checkSdkCompatibility(manifest.sdkCompatibility, SDK_VERSION);
  
  // 5. Descobrir capacidades disponíveis
  const capabilities = await discoverCapabilities(config);
  
  // 6. Registrar no CRE com capacidades atualizadas
  // (via Connector Manager — nunca diretamente)
  
  // 7. Executar hook afterInitialize
  await hookManager.run("afterInitialize", { config, capabilities });
  
  // 8. Transicionar estado: CREATED → INITIALIZED
  lifecycleManager.transition("INITIALIZED");
  
  return buildInitResult({ capabilities });
}
```

---

## 5. Fase 4 — Descoberta de Capacidades

O Discovery é o processo pelo qual o Connector informa ao MemoryOS **o que pode fazer** com o sistema externo conectado.

```typescript
interface ConnectorCapability {
  name: string;                  // Ex: "SEND_EMAIL"
  description: string;
  inputSchema: JSONSchema;       // Schema do payload de entrada
  outputSchema: JSONSchema;      // Schema da resposta normalizada
  requiresPermissions: string[];
  supportsBatch: boolean;
  supportsIdempotency: boolean;
  estimatedLatencyMs: number;
  rateLimitPerMinute?: number;
  cacheable: boolean;
  cacheTtlSeconds?: number;
}
```

### 5.1 Capacidades Padrão por Categoria

```
┌─────────────────────────────────────────────────────────────────┐
│               CAPACIDADES PADRÃO POR CATEGORIA                  │
├─────────────────┬───────────────────────────────────────────────┤
│ messaging       │ SEND_MESSAGE, READ_MESSAGE, DELETE_MESSAGE,   │
│                 │ LIST_MESSAGES, SEARCH_MESSAGES, REPLY,        │
│                 │ FORWARD, ARCHIVE, MARK_READ, ATTACH_FILE      │
├─────────────────┼───────────────────────────────────────────────┤
│ calendar        │ CREATE_EVENT, UPDATE_EVENT, DELETE_EVENT,     │
│                 │ LIST_EVENTS, GET_EVENT, CHECK_AVAILABILITY,   │
│                 │ SEND_INVITE, ACCEPT_INVITE, DECLINE_INVITE    │
├─────────────────┼───────────────────────────────────────────────┤
│ ecommerce       │ LIST_PRODUCTS, GET_PRODUCT, CREATE_ORDER,     │
│                 │ UPDATE_ORDER, CANCEL_ORDER, LIST_ORDERS,      │
│                 │ GET_INVENTORY, UPDATE_INVENTORY, GET_CUSTOMER │
├─────────────────┼───────────────────────────────────────────────┤
│ financial       │ GET_BALANCE, LIST_TRANSACTIONS, CREATE_INVOICE│
│                 │ UPDATE_INVOICE, LIST_INVOICES, GET_REPORT     │
├─────────────────┼───────────────────────────────────────────────┤
│ travel          │ SEARCH_FLIGHTS, BOOK_FLIGHT, CANCEL_BOOKING,  │
│                 │ GET_BOOKING, LIST_ITINERARIES, CHECK_FARES    │
├─────────────────┼───────────────────────────────────────────────┤
│ blockchain      │ GET_BALANCE, SEND_TRANSACTION, GET_TX_STATUS, │
│                 │ CALL_CONTRACT, READ_CONTRACT, SIGN_MESSAGE    │
└─────────────────┴───────────────────────────────────────────────┘
```

---

## 6. Fase 5 — Execução

```
┌─────────────────────────────────────────────────────────────┐
│                  FLUXO INTERNO DE EXECUÇÃO                  │
└─────────────────────────────────────────────────────────────┘

  ConnectorRequest recebido
         │
         ▼
  1. Validação do request
     ├── requestId presente?
     ├── action suportada?
     ├── payload válido (schema)?
     └── usuário autorizado? (via permissions)
         │
         ▼
  2. Hook: beforeExecute(request)
         │
         ▼
  3. Verificar cache
     ├── cacheable action?
     ├── cache hit? → retornar cached response
     └── cache miss? → continuar
         │
         ▼
  4. Verificar Circuit Breaker
     ├── OPEN? → retornar erro imediato
     └── CLOSED/HALF-OPEN? → continuar
         │
         ▼
  5. Verificar autenticação
     ├── token válido? → continuar
     └── token expirado? → refreshAuth() → continuar
         │
         ▼
  6. Dispatcher: selecionar handler da action
         │
         ▼
  7. Executar com Retry Policy
     ├── Tentativa 1
     ├── Falha retryable? → esperar backoff → Tentativa 2
     ├── Falha retryable? → esperar backoff → Tentativa 3
     └── Falha não retryable? → erro imediato
         │
         ▼
  8. Normalizar resposta externa → ConnectorResponse
         │
         ▼
  9. Atualizar cache (se cacheable)
         │
         ▼
  10. Emitir eventos relevantes
         │
         ▼
  11. Hook: afterExecute(request, response)
         │
         ▼
  12. Registrar log + audit + métricas
         │
         ▼
  13. Retornar ConnectorResponse
```

---

## 7. Fase 6 — Tratamento de Erros

```typescript
// Política de tratamento por categoria de erro
const ERROR_POLICY: Record<ErrorCategory, ErrorPolicy> = {
  AUTH_ERROR: {
    retryable: true,
    autoRefresh: true,
    maxRefreshAttempts: 1,
    fallback: "RETURN_ERROR_TO_CALLER"
  },
  NETWORK_ERROR: {
    retryable: true,
    maxRetries: 3,
    backoff: "EXPONENTIAL",
    baseDelayMs: 500,
    maxDelayMs: 30000
  },
  RATE_LIMIT: {
    retryable: true,
    respectRetryAfterHeader: true,
    maxRetries: 5,
    backoff: "RESPECT_HEADER"
  },
  PERMISSION_DENIED: {
    retryable: false,
    emitEvent: "CONNECTOR_PERMISSION_DENIED",
    notifyCore: true
  },
  NOT_FOUND: {
    retryable: false,
    returnNullResult: true
  },
  TIMEOUT: {
    retryable: true,
    maxRetries: 2,
    backoff: "LINEAR",
    baseDelayMs: 1000
  },
  EXTERNAL_ERROR: {
    retryable: false,
    logFull: true,
    emitEvent: "CONNECTOR_EXTERNAL_ERROR"
  },
  INTERNAL_ERROR: {
    retryable: false,
    circuitBreaker: true,
    alertOps: true
  }
};
```

---

## 8. Fase 7 — Monitoramento e Health Check

```typescript
interface HealthCheckResult {
  connectorId: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  checkedAt: string;
  latencyMs: number;
  details: {
    authValid: boolean;
    externalSystemReachable: boolean;
    lastSuccessAt: string;
    lastErrorAt?: string;
    consecutiveErrors: number;
    uptimePercent: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    requestsLastHour: number;
    errorsLastHour: number;
    errorRatePercent: number;
  };
}
```

### 8.1 Health Check Automático

```
Intervalo de verificação padrão: 60 segundos
Timeout do health check: 5 segundos
Limiar de degradação: errorRate > 5%
Limiar de unhealthy: errorRate > 25% ou consecutiveErrors > 5
Limiar de circuit open: consecutiveErrors > 10
```

---

## 9. Fase 8 — Desligamento

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE DESLIGAMENTO                    │
└─────────────────────────────────────────────────────────────┘

  disconnect() ou destroy() chamado
         │
         ▼
  1. Sinalizar: não aceitar novos requests
         │
         ▼
  2. Aguardar requests em andamento (graceful drain)
     └── Timeout máximo: 30 segundos
         │
         ▼
  3. Hook: beforeDisconnect()
         │
         ▼
  4. Flush do cache (se necessário)
         │
         ▼
  5. Fechar conexões com sistema externo
         │
         ▼
  6. Revogar tokens (apenas se destroy())
         │
         ▼
  7. Hook: afterDisconnect()
         │
         ▼
  8. Emitir evento: CONNECTOR_DISCONNECTED
         │
         ▼
  9. Atualizar status no CRE
         │
         ▼
  10. Flush de logs e métricas
         │
         ▼
  11. Transicionar estado: DISCONNECTED ou DESTROYED
```

---

## 10. Fase 9 — Atualização

```
┌─────────────────────────────────────────────────────────────┐
│               FLUXO DE ATUALIZAÇÃO (ROLLING)                │
└─────────────────────────────────────────────────────────────┘

  Nova versão disponível detectada
         │
         ▼
  1. Verificar compatibilidade da nova versão
     ├── sdkCompatibility ok?
     ├── minimumMemoryOSVersion ok?
     └── Sem breaking changes nas capabilities?
         │
         ▼
  2. Instanciar nova versão (paralela à atual)
         │
         ▼
  3. Inicializar nova versão
         │
         ▼
  4. Executar smoke tests na nova versão
         │
         ▼
  5. Redirecionar novos requests para nova versão
         │
         ▼
  6. Aguardar requests em andamento na versão antiga
         │
         ▼
  7. Desligar versão antiga gracefully
         │
         ▼
  8. Atualizar registro no CRE
         │
         ▼
  9. Emitir evento: CONNECTOR_UPDATED
```

---

## 11. Recuperação Automática

```typescript
interface RecoveryPolicy {
  // Tentativas automáticas de reconexão
  autoReconnect: boolean;
  maxReconnectAttempts: number;   // Padrão: 5
  reconnectBackoff: BackoffStrategy;
  
  // Circuit Breaker
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;     // Nº de falhas para OPEN
    successThreshold: number;     // Nº de sucessos para CLOSE
    openDurationMs: number;       // Tempo em OPEN antes de HALF-OPEN
  };
  
  // Fallback
  fallback: {
    enabled: boolean;
    strategy: "RETURN_CACHED" | "RETURN_ERROR" | "REDIRECT_TO_ALTERNATIVE";
    alternativeConnectorId?: string;
  };
}
```

### 11.1 Circuit Breaker — Estados

```
           falhas > threshold
CLOSED ──────────────────────► OPEN
  ▲                               │
  │ sucessos > successThreshold   │ após openDurationMs
  │                               ▼
  └──────────────────── HALF-OPEN
         1 request de teste
```

---

## 12. Versionamento de Connectors

Segue o padrão semântico definido no MCF SDK (Sprint 29):

```
MAJOR.MINOR.PATCH

MAJOR: Breaking change na interface ou contrato
MINOR: Nova capability ou ação (backward compatible)
PATCH: Bugfix ou otimização interna

Exemplos:
  1.0.0 → 2.0.0  MAJOR: mudança na interface padrão
  1.0.0 → 1.1.0  MINOR: nova action "ARCHIVE_EMAIL"
  1.0.0 → 1.0.1  PATCH: correção de bug no retry
```

### 12.1 Compatibilidade Entre Versões

```
sdkCompatibility: ">=1.0.0"  → Funciona com SDK 1.x.x e superior
sdkCompatibility: ">=1.0.0 <2.0.0"  → Apenas SDK 1.x.x
minimumMemoryOSVersion: "1.5.0"  → Requer MemoryOS 1.5.0 ou superior
```

---

**Documento Oficial:** MCF-Lifecycle  
**Versão:** 1.0  
**Status:** Aprovado  
**Parte:** 2 de 5 do MemoryOS Connector Framework