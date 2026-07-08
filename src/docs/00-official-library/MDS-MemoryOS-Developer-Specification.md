# MemoryOS Developer Specification (MDS)

**Versão:** 1.0  
**Status:** Oficial  
**Tipo:** Manual Oficial de Engenharia  
**Posição na Biblioteca:** MV → MPS → MAS → MES → MCF → MCIS → MGIS → **MDS**  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0  
**Referência Cruzada:** MDS-Engines · MDS-Platform · MDS-Connectors

---

## Declaração de Propósito

O MDS é o **Manual Oficial de Engenharia do MemoryOS**.

Ele transforma toda a arquitetura conceitual definida em MV, MPS, MAS, MES, MCF, MCIS e MGIS em **especificações técnicas implementáveis**, servindo como guia definitivo para qualquer equipe de engenharia construir, manter e evoluir o MemoryOS.

O MDS **não altera** nenhuma decisão arquitetural anterior.  
Ele **implementa** essas decisões.

---

## Índice do MDS

- **MDS** (este arquivo) — Arquitetura Física, Lógica, Estrutura, Monorepo, Módulos, Configuração
- **MDS-Engines** — Implementação dos Motores, Modelagem, Banco de Dados, APIs
- **MDS-Platform** — Frontend, Voice, Enterprise, Marketplace, Specialists, Testes, DevOps, Segurança
- **MDS-Connectors** — Implementação dos 20 Connectors oficiais, Templates, Checklists, Roadmap

---

# PARTE I — ARQUITETURA DE IMPLEMENTAÇÃO

---

## 1.1 Arquitetura Física

```
┌─────────────────────────────────────────────────────────────────────┐
│                 ARQUITETURA FÍSICA MEMORYOS                         │
│                    (Visão de Infraestrutura)                        │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │                      CDN / Edge Layer                            │
  │         (Cloudflare Workers / Vercel Edge / AWS CloudFront)      │
  └──────────────────────────┬───────────────────────────────────────┘
                             │
  ┌──────────────────────────▼───────────────────────────────────────┐
  │                    API Gateway Layer                             │
  │         (Kong / AWS API Gateway / custom gRPC gateway)          │
  │   REST · gRPC · WebSocket · SSE · GraphQL (internal)            │
  └──────────────┬──────────────────────────────┬────────────────────┘
                 │                              │
  ┌──────────────▼──────────┐   ┌──────────────▼──────────────────┐
  │    Core Services        │   │    Connector Runtime            │
  │  ┌──────────────────┐   │   │  ┌────────────────────────────┐ │
  │  │ Intent Engine    │   │   │  │ Connector Manager          │ │
  │  │ Goal Engine      │   │   │  │ Connector Sandbox          │ │
  │  │ Memory Engine    │   │   │  │ Connector Registry (MCIS)  │ │
  │  │ Planner          │   │   │  │ Execution Engine           │ │
  │  │ Policy Engine    │   │   │  └────────────────────────────┘ │
  │  │ Context Engine   │   │   └─────────────────────────────────┘
  │  └──────────────────┘   │
  └─────────────────────────┘
                 │
  ┌──────────────▼──────────────────────────────────────────────────┐
  │                    Data Layer                                   │
  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
  │  │  PostgreSQL  │  │    Redis     │  │  Vector DB            │ │
  │  │  (primary)   │  │  (cache/bus) │  │  (pgvector/Pinecone)  │ │
  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │
  │  ┌──────────────┐  ┌──────────────┐                            │
  │  │   S3/R2      │  │  Kafka/SQS   │                            │
  │  │  (files)     │  │  (events)    │                            │
  │  └──────────────┘  └──────────────┘                            │
  └─────────────────────────────────────────────────────────────────┘
```

## 1.2 Arquitetura Lógica

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARQUITETURA LÓGICA                               │
│              (Camadas conforme MAS §3 — implementadas)              │
└─────────────────────────────────────────────────────────────────────┘

  CAMADA 0 — CLIENT
    Web App (React) · Mobile (React Native) · Desktop (Electron)
    Voice Interface · API Clients (SDKs)

  CAMADA 1 — GATEWAY
    AuthMiddleware · RateLimiter · RequestValidator
    SessionManager · TenantResolver

  CAMADA 2 — CORE INTELLIGENCE (MAS §3.1)
    IntentEngine → GoalEngine (MGIS) → Planner
    MemoryEngine → ContextEngine → KnowledgeEngine
    PolicyEngine → PermissionEngine

  CAMADA 3 — SPECIALIST LAYER (MAS §3.3)
    TravelSpecialist · FinanceSpecialist · MedicalSpecialist
    LegalSpecialist · IndustrialSpecialist · BlockchainSpecialist

  CAMADA 4 — CONNECTOR LAYER (MCF)
    ConnectorRuntime · ConnectorSandbox · ConnectorRegistry
    ConnectorManager · ExecutionEngine · WorkflowEngine

  CAMADA 5 — INFRASTRUCTURE
    EventBus (UEB) · Scheduler · NotificationEngine
    ObservabilityStack · SecretManager · AuditLogger
```

## 1.3 Estrutura Oficial do Monorepo

```
memoryos/
│
├── apps/
│   ├── web/                        # React web app
│   ├── mobile/                     # React Native
│   ├── desktop/                    # Electron wrapper
│   └── api/                        # Main API server (NestJS)
│
├── packages/
│   ├── core/                       # Core engine (MAS §3.1)
│   │   ├── intent/                 # Intent Understanding
│   │   ├── goal/                   # MGIS Goal Engine
│   │   ├── memory/                 # Memory Engine
│   │   ├── planner/                # Planner
│   │   ├── policy/                 # Policy Engine
│   │   └── context/                # Context Engine
│   │
│   ├── connectors/                 # Connector Runtime (MCF)
│   │   ├── runtime/                # Connector execution runtime
│   │   ├── sdk/                    # Connector SDK
│   │   ├── registry/               # MCIS Registry
│   │   └── sandbox/                # Isolation layer
│   │
│   ├── specialists/                # Specialist packages
│   │   ├── travel/
│   │   ├── finance/
│   │   ├── medical/
│   │   ├── legal/
│   │   └── blockchain/
│   │
│   ├── shared/                     # Shared utilities
│   │   ├── contracts/              # TypeScript interfaces
│   │   ├── events/                 # Event definitions (UEB)
│   │   ├── errors/                 # Error hierarchy
│   │   ├── validators/             # Zod schemas
│   │   └── utils/                  # Pure utilities
│   │
│   ├── infra/                      # Infrastructure abstractions
│   │   ├── database/               # DB clients + migrations
│   │   ├── cache/                  # Redis abstraction
│   │   ├── queue/                  # Kafka/SQS abstraction
│   │   ├── storage/                # S3/R2 abstraction
│   │   └── secrets/                # Secret Manager abstraction
│   │
│   └── marketplace/                # Marketplace runtime
│       ├── connector-marketplace/
│       ├── specialist-marketplace/
│       └── workflow-marketplace/
│
├── connector-catalog/              # Official connectors (MCF + MCIS)
│   ├── gmail/
│   ├── google-calendar/
│   ├── shopify/
│   ├── mercado-livre/
│   ├── bling/
│   ├── totvs/
│   ├── sabre/
│   └── ...
│
├── tools/
│   ├── connector-cli/              # CLI para criar novos connectors
│   ├── specialist-cli/             # CLI para criar specialists
│   └── schema-generator/           # Gera types de entity schemas
│
├── docs/
│   └── 00-official-library/        # Biblioteca oficial
│
├── infra/
│   ├── terraform/                  # IaC
│   ├── k8s/                        # Kubernetes manifests
│   ├── docker/                     # Dockerfiles
│   └── scripts/                    # Deploy scripts
│
├── package.json                    # Root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
└── tsconfig.base.json              # Base TS config
```

## 1.4 Convenções de Nomenclatura

```typescript
// ARQUIVOS
// kebab-case para todos os arquivos
// intent-engine.ts, goal-decomposer.ts, connector-registry.ts

// CLASSES
// PascalCase
class IntentEngine {}
class GoalDecomposer {}
class GmailConnector {}

// INTERFACES — prefixo I ou sufixo descritivo
interface IGoalEngine {}
interface ConnectorManifest {}   // sem 'I' quando nome é suficientemente descritivo

// TIPOS
type GoalState = "CREATED" | "PLANNING" | "EXECUTING" | "COMPLETED";
type ConnectorType = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";

// CONSTANTES
const MAX_GOAL_DEPTH = 10;
const DEFAULT_TIMEOUT_MS = 30_000;

// ENUMS
enum GoalPriority { LOW = 1, NORMAL = 5, HIGH = 8, CRITICAL = 10 }

// EVENTOS (UEB)
// domínio.recurso.ação — tudo em snake_case
"goal.created"
"connector.gmail.email_received"
"memory.fact.stored"
"execution.step.completed"

// MÓDULOS / PACOTES
// @memoryos/core
// @memoryos/connector-sdk
// @memoryos/specialists-travel

// BANCO DE DADOS — tabelas
// snake_case, plural
// goals, goal_steps, connector_registrations, memory_facts

// VARIÁVEIS DE AMBIENTE
// SCREAMING_SNAKE_CASE com prefixo do serviço
// MOS_DATABASE_URL, MOS_REDIS_URL, MOS_JWT_SECRET
```

## 1.5 Versionamento Oficial

```
SEMVER: MAJOR.MINOR.PATCH

MAJOR — breaking changes na API pública ou contratos de motor
MINOR — novas features backward compatible
PATCH — bugfixes, performance, segurança

POLÍTICA:
  - Core Engine: versão independente (@memoryos/core@2.1.0)
  - Connector SDK: versão independente (@memoryos/connector-sdk@1.4.0)
  - Connectors oficiais: versão independente (gmail-connector@1.2.0)
  - API: versão na URL (/v1/, /v2/)

DEPRECATION:
  - Mínimo 2 minor versions de aviso antes de remover
  - Header: Deprecation + Sunset em todas as respostas de endpoints deprecated
  - CHANGELOG.md obrigatório em cada release

GIT WORKFLOW:
  main          → produção (protegida, só merge via PR)
  develop       → integração contínua
  feature/*     → features novas
  fix/*         → bugfixes
  connector/*   → desenvolvimento de novos connectors
  release/*     → preparação de release (RC)
```

## 1.6 Feature Flags

```typescript
// Sistema de Feature Flags — LaunchDarkly ou Unleash (open source)

interface FeatureFlag {
  key: string;                      // "goal_prediction_v2"
  enabled: boolean;
  rolloutPercentage: number;        // 0-100
  targetUsers?: string[];           // User IDs específicos
  targetOrgs?: string[];            // Org IDs
  metadata: Record<string, unknown>;
}

// Uso no código:
const flags = await featureFlagClient.getAll(userId);

if (flags.isEnabled("goal_prediction_v2")) {
  return await goalPredictionEngineV2.predict(context);
} else {
  return await goalPredictionEngine.predict(context);
}

// FLAGS OFICIAIS DE LANÇAMENTO:
const OFFICIAL_FLAGS = {
  VOICE_HANDS_FREE:           "voice_hands_free_mode",
  GOAL_AUTO_EXECUTE:          "goal_auto_execute",
  CONNECTOR_HOT_PLUG:         "connector_hot_plug",
  ENTERPRISE_MULTI_TENANT:    "enterprise_multi_tenant",
  BLOCKCHAIN_CONNECTORS:      "blockchain_connectors",
  AI_GOAL_PREDICTION:         "ai_goal_prediction",
  MARKETPLACE_V2:             "marketplace_v2",
} as const;
```

## 1.7 Sistema de Plugins e Módulos

```typescript
// Plugin Interface — para extensões de terceiros
interface MemoryOSPlugin {
  name: string;
  version: string;
  type: "CONNECTOR" | "SPECIALIST" | "WORKFLOW" | "SKILL" | "POLICY";

  // Lifecycle hooks
  onInstall(context: PluginContext): Promise<void>;
  onEnable(context: PluginContext): Promise<void>;
  onDisable(context: PluginContext): Promise<void>;
  onUninstall(context: PluginContext): Promise<void>;

  // Self-description (MCIS/MGIS)
  describe(): PluginDescriptor;

  // Sandbox permissions declaradas
  requiredPermissions: SandboxPermission[];
}

// Module Registry
class ModuleRegistry {
  private modules = new Map<string, MemoryOSModule>();

  register(module: MemoryOSModule): void {
    this.validateModule(module);
    this.modules.set(module.id, Object.freeze(module));
    this.eventBus.emit("module.registered", { moduleId: module.id });
  }

  resolve<T>(moduleId: string): T {
    const module = this.modules.get(moduleId);
    if (!module) throw new ModuleNotFoundException(moduleId);
    return module as T;
  }
}
```

## 1.8 Sistema de Configuração

```typescript
// Configuração hierárquica: defaults < env < file < runtime

interface MemoryOSConfig {
  // Core
  core: {
    intentConfidenceThreshold: number;   // default: 0.7
    goalMaxDepth: number;                 // default: 10
    plannerTimeoutMs: number;             // default: 30_000
    memoryTtlDays: number;               // default: 365
  };

  // Connectors
  connectors: {
    sandboxEnabled: boolean;             // default: true
    maxConcurrentExecutions: number;     // default: 50
    defaultTimeoutMs: number;            // default: 15_000
    retryPolicy: RetryPolicy;
  };

  // Performance
  performance: {
    cacheTtlSeconds: number;             // default: 300
    maxRequestSizeBytes: number;         // default: 10_485_760 (10MB)
    rateLimit: RateLimitConfig;
  };

  // Features
  features: FeatureFlagConfig;

  // Observability
  observability: ObservabilityConfig;
}

// Carregamento via Zod + dotenv
const config = await loadConfig({
  schema: MemoryOSConfigSchema,
  sources: ["env", ".env.local", "config.yaml"],
  validate: true,
  strict: true,
});
```

## 1.9 Separação Personal / Enterprise

```
┌─────────────────────────────────────────────────────────────────────┐
│              SEPARAÇÃO PERSONAL / ENTERPRISE                        │
├────────────────────────┬────────────────────────────────────────────┤
│ PERSONAL               │ ENTERPRISE                                 │
├────────────────────────┼────────────────────────────────────────────┤
│ 1 usuário / 1 tenant   │ N usuários / 1 org tenant                  │
│ Dados isolados por user│ Dados compartilhados na org + isolados user│
│ Connectors pessoais    │ Connectors org + pessoais                  │
│ Goals pessoais         │ Goals pessoais + org + delegados           │
│ Memória pessoal        │ Memória pessoal + org knowledge base       │
│ Policy: simples        │ Policy: hierárquica + RBAC + aprovações    │
│ Billing: por usuário   │ Billing: por org + seats                   │
│ SSO: opcional          │ SSO: obrigatório (SAML/OIDC)               │
│ Audit: básico          │ Audit: completo + exportável               │
└────────────────────────┴────────────────────────────────────────────┘

IMPLEMENTAÇÃO:
  TenantResolver middleware → detecta context (personal/enterprise)
  Toda query inclui: WHERE tenant_id = ? AND (user_id = ? OR is_org_shared = true)
  Connectors: ownership = USER | ORG
  Memory: visibility = PRIVATE | TEAM | ORG | PUBLIC
```

---

# PARTE II — ESTRUTURA DE SERVIÇOS

---

## 2.1 Mapa Oficial de Serviços

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MAPA DE MICROSERVIÇOS                             │
├──────────────────────┬────────────────────────────────────────────── ┤
│ Serviço              │ Responsabilidade                              │
├──────────────────────┼───────────────────────────────────────────────┤
│ api-gateway          │ Roteamento, auth, rate limit, logging         │
│ core-service         │ Intent, Goal, Planner, Context                │
│ memory-service       │ Memory Engine completo                        │
│ connector-service    │ Connector Runtime, Sandbox, Registry          │
│ execution-service    │ Execution Engine, Workflow Engine             │
│ notification-service │ Push, Email, SMS, WebSocket                   │
│ scheduler-service    │ Cron jobs, Background Goals, Recurrence       │
│ marketplace-service  │ Catálogo de Connectors/Specialists            │
│ auth-service         │ OAuth, JWT, OIDC, SAML                        │
│ audit-service        │ Log de auditoria imutável                     │
│ voice-service        │ STT, TTS, Voice Pipeline                      │
│ analytics-service    │ Métricas de uso, insights                     │
└──────────────────────┴───────────────────────────────────────────────┘

COMUNICAÇÃO ENTRE SERVIÇOS:
  Síncrona:  gRPC (inter-service)
  Assíncrona: Kafka (eventos domain)
  Real-time: Redis Pub/Sub (notificações internas)
```

## 2.2 Diagrama C4 — Nível de Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                core-service (C4 Level 3)                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │ IntentController (HTTP/gRPC)                                   │
  │   POST /v1/intent/process                                      │
  └──────────────────────┬─────────────────────────────────────────┘
                         │
                ┌────────▼────────┐
                │  IntentEngine   │
                │  (NLP + LLM)    │
                └────────┬────────┘
                         │ Intent
                ┌────────▼────────┐
                │   GoalEngine    │ ← MGIS implementation
                │  (decompose,    │
                │   prioritize,   │
                │   conflict)     │
                └────────┬────────┘
                         │ GoalPlan
                ┌────────▼────────┐
                │    Planner      │
                │  (builds        │
                │  ExecutionPlan) │
                └────────┬────────┘
                         │ ExecutionPlan (gRPC)
                         ▼
                  connector-service
```

---

**Documento Oficial:** MDS — MemoryOS Developer Specification  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 1 de 4 — Arquitetura, Estrutura, Módulos, Configuração, Serviços