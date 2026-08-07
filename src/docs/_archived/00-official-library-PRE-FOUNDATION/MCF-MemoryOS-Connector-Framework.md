# MemoryOS Connector Framework (MCF)

**Versão:** 1.0  
**Status:** Oficial  
**Tipo:** Documento de Arquitetura — Connector Framework  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MPS 1.0  
**Referência Cruzada:** MCF-Architecture · MCF-Lifecycle · MCF-Security · MCF-Operations · MCF-Catalog

---

## Declaração de Propósito

Este documento define o padrão arquitetural oficial de todos os Connectors do MemoryOS.

Qualquer Connector — seja desenvolvido internamente, por parceiros certificados ou por terceiros — deverá obrigatoriamente seguir as regras, interfaces, contratos, ciclos de vida e políticas estabelecidas neste documento.

O MCF não altera nenhuma decisão do MAS ou do MES. Ele formaliza, expande e operacionaliza os princípios arquiteturais já estabelecidos aplicados especificamente à camada de Connectors.

O MCF é o **padrão definitivo e imutável** para integração no ecossistema MemoryOS.

---

## Índice Geral

- **MCF** (este arquivo) — Visão, Conceitos, Papel Arquitetural, Interface Padrão
- **MCF-Lifecycle** — Ciclo de Vida Completo, Estrutura Interna, Discovery, Saúde
- **MCF-Security** — Permissões, Autenticação, Assinatura Digital, Sandbox, Auditoria
- **MCF-Operations** — Comunicação, Cache, Logs, Telemetria, Retry, Fila, Concorrência
- **MCF-Catalog** — Marketplace, SDK, Templates, Fluxos, Exemplos Empresariais

---

# PARTE I — FUNDAMENTOS

---

## 1. Conceito Oficial de Connector

### 1.1 Definição

Um **Connector** é o único componente do MemoryOS autorizado a se comunicar com sistemas externos.

Ele representa a fronteira entre o mundo interno e controlado do MemoryOS e o mundo externo — APIs, bancos de dados, sistemas legados, blockchains, ERPs, marketplaces e qualquer infraestrutura fora do ecossistema.

> **Princípio Fundamental (MAS §3.1):** O Core pensa. Os Connectors executam.

Um Connector:
- **É** um executor puro de ações já decididas
- **É** uma camada de tradução entre contratos internos e APIs externas
- **É** a única fonte legítima de dados e efeitos externos
- **Não é** um tomador de decisões
- **Não é** um intérprete de intenções
- **Não é** um repositório de lógica de negócio
- **Não é** um Specialist, Service ou Capability

### 1.2 Identidade de um Connector

Todo Connector possui identidade única e imutável dentro do ecossistema:

```typescript
interface ConnectorIdentity {
  connectorId: string;          // ID único sequencial
  connectorName: string;        // Nome canônico (ex: "GmailConnector")
  vendor: string;               // Fabricante (ex: "google")
  connectorVersion: string;     // Versão semântica (ex: "2.1.0")
  connectorType: ConnectorType; // INBOUND | OUTBOUND | BIDIRECTIONAL
  sdkVersion: string;           // Versão do MCF SDK utilizada
  sdkCompatibility: string;     // Restrição de compatibilidade (ex: ">=1.0.0")
  minimumMemoryOSVersion: string;
  category: ConnectorCategory;
  description: string;
  tags: string[];
}
```

### 1.3 Tipos de Connector

```
┌─────────────────────────────────────────────────────────────┐
│                      CONNECTOR TYPES                        │
├──────────────┬──────────────┬──────────────────────────────┤
│   INBOUND    │   OUTBOUND   │       BIDIRECTIONAL          │
├──────────────┼──────────────┼──────────────────────────────┤
│ Recebe dados │ Envia dados  │ Envia e recebe dados         │
│ do sistema   │ ao sistema   │ bidirecional                 │
│ externo      │ externo      │                              │
├──────────────┼──────────────┼──────────────────────────────┤
│ Exemplos:    │ Exemplos:    │ Exemplos:                    │
│ - Webhooks   │ - Notific.   │ - Gmail                      │
│ - Firehose   │ - SMS        │ - Google Calendar            │
│ - IoT stream │ - Relatório  │ - Shopify                    │
│ - Chainlink  │ - Exportação │ - TOTVS                      │
│   oracles    │              │ - Bling                      │
└──────────────┴──────────────┴──────────────────────────────┘
```

### 1.4 Categorias Oficiais

```typescript
type ConnectorCategory =
  | "messaging"    // Email, SMS, WhatsApp, Slack
  | "calendar"     // Google Calendar, Outlook Calendar
  | "storage"      // Google Drive, Dropbox, OneDrive
  | "crm"          // Salesforce, HubSpot, Pipedrive
  | "erp"          // TOTVS, SAP, Oracle
  | "ecommerce"    // Shopify, Mercado Livre, WooCommerce
  | "financial"    // Bling, QuickBooks, Conta Azul
  | "travel"       // Sabre, Amadeus, Galileo
  | "blockchain"   // LayerZero, Chainlink, Phantom
  | "iot"          // Zebra, sensores industriais
  | "payment"      // Stripe, PagSeguro, Mercado Pago
  | "telecom"      // Twilio, AWS SNS
  | "analytics"    // GA, Mixpanel, BigQuery
  | "other";
```

---

## 2. Papel do Connector na Arquitetura

### 2.1 Posição Oficial no Pipeline (MAS §5)

```
┌─────────────────────────────────────────────────────────┐
│                    MEMORYOS PIPELINE                    │
├─────────────────────────────────────────────────────────┤
│  Usuário                                                │
│    │                                                    │
│    ▼                                                    │
│  MemoryOS Core ──── interpreta intenção                 │
│    │                                                    │
│    ▼                                                    │
│  Context Builder ──── consolida contexto + memória      │
│    │                                                    │
│    ▼                                                    │
│  Planner ──── produz objetivo estruturado               │
│    │                                                    │
│    ▼                                                    │
│  Capability Detector ──── identifica habilidades        │
│    │                                                    │
│    ▼                                                    │
│  Specialists ──── fornecem conhecimento especializado   │
│    │                                                    │
│    ▼                                                    │
│  Service Layer ──── resolve domínio funcional           │
│    │                                                    │
│    ▼                                                    │
│  Policy Engine ──── autoriza ou bloqueia                │
│    │                                                    │
│    ▼                                                    │
│  Execution Planner ──── converte em plano executável    │
│    │                                                    │
│    ▼                                                    │
│  Connector Manager ──── seleciona Connector adequado    │
│    │                                                    │
│    ▼                                                    │
│  ███ CONNECTOR ███ ──── executa ação no sistema ext.    │
│    │                                                    │
│    ▼                                                    │
│  Sistema Externo                                        │
│    │                                                    │
│    ▼                                                    │
│  Resultado bruto                                        │
│    │                                                    │
│    ▼                                                    │
│  Connector (normaliza resposta)                         │
│    │                                                    │
│    ▼                                                    │
│  Memory Update ──── registra aprendizado                │
│    │                                                    │
│    ▼                                                    │
│  Resposta ao Usuário                                    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Regra de Ouro

O Connector **nunca** sabe por que está sendo chamado.

Ele sabe **apenas o que deve fazer** — a ação específica que foi solicitada pelo Execution Planner após todas as etapas anteriores do pipeline.

```
CORRETO:
  Execution Planner → Connector: "Enviar e-mail para joao@empresa.com com o assunto X e corpo Y"

INCORRETO:
  Connector decide: "O usuário quer responder o João, então vou buscar os e-mails dele primeiro"
```

### 2.3 Responsabilidades Exclusivas

| Responsabilidade | Connector | Core | Service | Specialist |
|---|:---:|:---:|:---:|:---:|
| Executar chamadas a APIs externas | ✅ | ❌ | ❌ | ❌ |
| Traduzir contratos internos → APIs externas | ✅ | ❌ | ❌ | ❌ |
| Normalizar respostas externas → contratos internos | ✅ | ❌ | ❌ | ❌ |
| Gerenciar tokens e credenciais | ✅ | ❌ | ❌ | ❌ |
| Interpretar intenções do usuário | ❌ | ✅ | ❌ | ❌ |
| Tomar decisões de negócio | ❌ | ✅ | ❌ | ❌ |
| Fornecer conhecimento especializado | ❌ | ❌ | ❌ | ✅ |
| Representar domínios funcionais | ❌ | ❌ | ✅ | ❌ |

---

## 3. Interface Padrão Obrigatória

Todo Connector deverá obrigatoriamente implementar a interface completa abaixo.

Nenhum Connector poderá ser registrado no Connector Registry Engine sem satisfazer esta interface integralmente.

### 3.1 Interface Completa

```typescript
interface MemoryOSConnector {

  // ─── Identidade ───────────────────────────────────────────
  readonly identity: ConnectorIdentity;
  readonly manifest: ConnectorManifest;

  // ─── Ciclo de Vida ────────────────────────────────────────
  initialize(config: ConnectorConfig): Promise<InitResult>;
  connect(auth: AuthCredentials): Promise<ConnectResult>;
  disconnect(): Promise<DisconnectResult>;
  destroy(): Promise<DestroyResult>;

  // ─── Saúde ────────────────────────────────────────────────
  status(): ConnectorStatus;
  healthCheck(): Promise<HealthCheckResult>;
  ping(): Promise<PingResult>;

  // ─── Capacidades ──────────────────────────────────────────
  capabilities(): ConnectorCapability[];
  supportsAction(action: string): boolean;
  supportsEvent(event: string): boolean;

  // ─── Execução ─────────────────────────────────────────────
  execute(request: ConnectorRequest): Promise<ConnectorResponse>;

  // ─── Eventos ──────────────────────────────────────────────
  subscribe(event: string, handler: EventHandler): UnsubscribeFn;
  emit(event: ConnectorEvent): void;

  // ─── Observabilidade ──────────────────────────────────────
  logs(): ConnectorLog[];
  metrics(): ConnectorMetrics;
  audit(): AuditEntry[];
}
```

### 3.2 Manifesto Obrigatório

Todo Connector possui um Manifesto imutável e assinado:

```typescript
interface ConnectorManifest {
  // Identidade
  manifestId: string;
  connectorId: string;
  connectorName: string;
  connectorVersion: string;
  vendor: string;
  description: string;
  category: ConnectorCategory;
  connectorType: ConnectorType;
  tags: string[];

  // SDK e Compatibilidade
  sdkVersion: string;
  sdkCompatibility: string;
  minimumMemoryOSVersion: string;

  // Capacidades
  supportedEvents: string[];
  supportedActions: string[];
  supportedCapabilities: string[];

  // Segurança
  permissions: string[];
  authType: AuthType;
  sandboxed: boolean;
  signatureAlgorithm: string;
  publicKey: string;
  signature: string;

  // Qualidade
  qualityLevel: "CERTIFIED" | "PARTNER" | "COMMUNITY";
  certificationDate?: string;
  certifiedBy?: string;

  // Metadados
  documentationUrl: string;
  repositoryUrl?: string;
  supportEmail: string;
  licenseType: string;
  metadata: Record<string, unknown>;
}
```

### 3.3 Contrato de Requisição

Toda chamada ao Connector segue o contrato abaixo, derivado do contrato oficial do MES §5:

```typescript
interface ConnectorRequest {
  requestId: string;           // ID único sequencial
  connectorId: string;
  action: string;              // Ação a executar
  payload: Record<string, unknown>;
  context: {
    userId: string;
    sessionId: string;
    conversationId: string;
    projectId?: string;
    correlationId: string;     // Para rastreabilidade
    requestedAt: string;       // ISO 8601
  };
  options: {
    timeout: number;           // ms
    retryPolicy: RetryPolicy;
    priority: RequestPriority;
    idempotencyKey?: string;
  };
}
```

### 3.4 Contrato de Resposta

```typescript
interface ConnectorResponse {
  requestId: string;
  connectorId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "TIMEOUT" | "UNAUTHORIZED";
  result?: unknown;
  error?: ConnectorError;
  metadata: {
    executionTimeMs: number;
    retryCount: number;
    cacheHit: boolean;
    externalSystemResponseTimeMs: number;
    respondedAt: string;       // ISO 8601
  };
  events: ConnectorEvent[];
  logs: ConnectorLog[];
  memoryUpdates: MemoryUpdateProposal[];
}
```

### 3.5 Contrato de Erro

```typescript
interface ConnectorError {
  code: string;                // Ex: "GMAIL_AUTH_EXPIRED"
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  retryAfterMs?: number;
  externalCode?: string;       // Código original do sistema externo
  externalMessage?: string;
  context: Record<string, unknown>;
}

type ErrorCategory =
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMIT"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "VALIDATION_ERROR"
  | "EXTERNAL_ERROR"
  | "INTERNAL_ERROR";
```

---

## 4. Estrutura Interna

### 4.1 Arquitetura Interna de um Connector

```
┌─────────────────────────────────────────────────────────┐
│                    CONNECTOR INTERNO                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌──────────────────────────┐   │
│  │  Public API     │    │    Lifecycle Manager     │   │
│  │  (Interface     │    │  CREATED → INITIALIZED   │   │
│  │   Padrão MCF)   │    │  → CONNECTED → DISCONN.  │   │
│  └────────┬────────┘    └──────────────────────────┘   │
│           │                                             │
│  ┌────────▼────────┐    ┌──────────────────────────┐   │
│  │  Request        │    │    Hook Manager          │   │
│  │  Validator      │    │  before/after hooks      │   │
│  └────────┬────────┘    └──────────────────────────┘   │
│           │                                             │
│  ┌────────▼────────┐    ┌──────────────────────────┐   │
│  │  Auth Manager   │    │    Retry Manager         │   │
│  │  (tokens,       │    │  (políticas de retry)    │   │
│  │   refresh,      │    └──────────────────────────┘   │
│  │   revoke)       │                                    │
│  └────────┬────────┘    ┌──────────────────────────┐   │
│           │             │    Circuit Breaker        │   │
│  ┌────────▼────────┐    │  (proteção de falhas)    │   │
│  │  Action         │    └──────────────────────────┘   │
│  │  Dispatcher     │                                    │
│  └────────┬────────┘    ┌──────────────────────────┐   │
│           │             │    Cache Manager          │   │
│  ┌────────▼────────┐    │  (TTL, invalidação)      │   │
│  │  API Client     │    └──────────────────────────┘   │
│  │  (adaptador     │                                    │
│  │   externo)      │    ┌──────────────────────────┐   │
│  └────────┬────────┘    │    Event Emitter          │   │
│           │             │  (eventos internos/ext.)  │   │
│  ┌────────▼────────┐    └──────────────────────────┘   │
│  │  Response       │                                    │
│  │  Normalizer     │    ┌──────────────────────────┐   │
│  └────────┬────────┘    │    Logger + Audit         │   │
│           │             │  (observabilidade)        │   │
│  ┌────────▼────────┐    └──────────────────────────┘   │
│  │  Response       │                                    │
│  │  Builder        │    ┌──────────────────────────┐   │
│  └─────────────────┘    │    Health Monitor         │   │
│                         │  (heartbeat, telemetria)  │   │
│                         └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Estrutura de Arquivos de um Connector

```
connectors/
└── gmail/
    ├── index.js                  # Ponto de entrada e exportação pública
    ├── manifest.json             # Manifesto assinado
    ├── GmailConnector.js         # Implementação da interface padrão MCF
    ├── auth/
    │   ├── GmailAuthManager.js   # OAuth 2.0 + refresh + revogação
    │   └── GmailTokenStore.js    # Armazenamento seguro de tokens
    ├── actions/
    │   ├── sendEmail.js
    │   ├── readEmail.js
    │   ├── searchEmails.js
    │   ├── deleteEmail.js
    │   └── listLabels.js
    ├── events/
    │   ├── newEmailReceived.js
    │   └── emailSent.js
    ├── adapters/
    │   └── GmailApiAdapter.js    # Chamadas reais à API do Google
    ├── normalizers/
    │   └── GmailResponseNormalizer.js
    ├── health/
    │   └── GmailHealthMonitor.js
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── fixtures/
    └── docs/
        └── README.md
```

---

## 5. UML — Diagrama de Classes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        <<interface>>                                   │
│                      MemoryOSConnector                                 │
├────────────────────────────────────────────────────────────────────────┤
│ + identity: ConnectorIdentity                                          │
│ + manifest: ConnectorManifest                                          │
│ + initialize(config): Promise<InitResult>                              │
│ + connect(auth): Promise<ConnectResult>                                │
│ + disconnect(): Promise<DisconnectResult>                              │
│ + destroy(): Promise<DestroyResult>                                    │
│ + status(): ConnectorStatus                                            │
│ + healthCheck(): Promise<HealthCheckResult>                            │
│ + ping(): Promise<PingResult>                                          │
│ + capabilities(): ConnectorCapability[]                                │
│ + execute(request): Promise<ConnectorResponse>                         │
│ + subscribe(event, handler): UnsubscribeFn                             │
│ + emit(event): void                                                    │
│ + logs(): ConnectorLog[]                                               │
│ + metrics(): ConnectorMetrics                                          │
│ + audit(): AuditEntry[]                                                │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ implements
         ┌──────────────────────┼─────────────────────┐
         │                      │                      │
┌────────▼──────────┐  ┌────────▼──────────┐  ┌────────▼──────────┐
│  GmailConnector   │  │  ShopifyConnector │  │  TOTVSConnector   │
├───────────────────┤  ├───────────────────┤  ├───────────────────┤
│ - authManager     │  │ - apiKey          │  │ - soap client     │
│ - apiClient       │  │ - shopDomain      │  │ - companyCode     │
│ - tokenStore      │  │ - rateLimiter     │  │ - module          │
└───────────────────┘  └───────────────────┘  └───────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        BaseConnector                                │
│                  (implementação base do MCF SDK)                    │
├─────────────────────────────────────────────────────────────────────┤
│ # lifecycleManager: LifecycleManager                                │
│ # hookManager: HookManager                                          │
│ # authManager: AuthManager                                          │
│ # retryManager: RetryManager                                        │
│ # cacheManager: CacheManager                                        │
│ # circuitBreaker: CircuitBreaker                                    │
│ # eventEmitter: EventEmitter                                        │
│ # logger: Logger                                                    │
│ # audit: AuditLogger                                                │
│ # healthMonitor: HealthMonitor                                      │
│ + initialize(): delegates to lifecycle                              │
│ + connect(): delegates to lifecycle + hooks                         │
│ + execute(): validates + dispatches + normalizes                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐    ┌───────────────────────┐
│  ConnectorManifest   │    │   ConnectorRegistry    │
├──────────────────────┤    │   (CRE — Sprint 30)   │
│ manifestId           │    ├───────────────────────┤
│ connectorId          │◄───│ register()             │
│ connectorVersion     │    │ unregister()           │
│ sdkCompatibility     │    │ search()               │
│ supportedActions[]   │    │ findByCapability()     │
│ permissions[]        │    │ checkCompatibility()   │
│ signature            │    └───────────────────────┘
└──────────────────────┘
```

---

## 6. Tabela de Compatibilidade Oficial

| Componente MCF | Depende de | Não depende de |
|---|---|---|
| Connector | Contrato MCF + SDK + CRE | Core, Specialists, Services, Memory |
| Manifesto | SDK MCF | APIs externas, banco de dados |
| ConnectorRegistry (CRE) | Manifesto MCF | Connectors reais, sistemas externos |
| ConnectorManager | CRE + Policy Engine | APIs externas |
| BaseConnector (SDK) | Contratos MCF | IA, banco, HTTP real |

---

## 7. Declaração de Conformidade MCF

Um Connector é **conforme** ao MCF quando:

1. Implementa integralmente a `MemoryOSConnector` interface
2. Possui Manifesto válido e assinado
3. Registra-se no Connector Registry Engine (CRE)
4. Não interpreta intenções
5. Não executa lógica de negócio
6. Não acessa memória do usuário diretamente
7. Emite todos os eventos obrigatórios
8. Produz logs e métricas conforme MCF-Operations
9. Suporta o ciclo de vida completo definido no MCF-Lifecycle
10. Passa na suíte de testes de certificação MCF

---

**Documento Oficial:** MCF — MemoryOS Connector Framework  
**Versão:** 1.0  
**Status:** Aprovado  
**Parte:** 1 de 5 — Fundamentos, Conceitos, Interface Padrão