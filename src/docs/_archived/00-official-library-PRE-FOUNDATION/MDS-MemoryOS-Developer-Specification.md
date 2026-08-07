# MemoryOS Developer Specification (MDS)

**Versão:** 1.0  
**Status:** Manual Oficial de Engenharia  
**Tipo:** Especificação Técnica de Implementação  
**Posição:** MV → MPS → MAS → MES → MCF → MCIS → MGIS → **MDS**  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0  
**Referência Cruzada:** MDS-Engines · MDS-Platform · MDS-Connectors

---

## Declaração de Propósito

O MDS é o **Manual Oficial de Engenharia do MemoryOS**.

Ele transforma toda a arquitetura conceitual definida em MV, MPS, MAS, MES, MCF, MCIS e MGIS em **especificações técnicas completas e implementáveis**, servindo como guia definitivo para toda equipe de engenharia construir, manter e evoluir o MemoryOS.

O MDS **não altera** nenhuma decisão arquitetural anterior.  
Onde houver inconsistência detectada, ela é registrada como **Observação Arquitetural** — nunca como alteração.

> Toda implementação futura do MemoryOS deverá seguir rigorosamente esta especificação.

---

## Índice do MDS

| Arquivo | Partes cobertas |
|---|---|
| **MDS** (este) | I — Organização da Solução |
| **MDS-Engines** | II — Motores · III — Modelagem · IV — Banco de Dados · V — Comunicação |
| **MDS-Platform** | VI — Frontend · VII — Voice · VIII — Enterprise · IX — Specialists · XII — Testes · XIII — DevOps · XIV — Segurança |
| **MDS-Connectors** | X — Connectors Oficiais · XI — Marketplace · XV — Sprint Zero · Checklists · Declaração Final |

---

# PARTE I — ORGANIZAÇÃO DA SOLUÇÃO

---

## 1.1 Arquitetura Física

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ARQUITETURA FÍSICA MEMORYOS                             │
│                         (Visão de Infraestrutura)                            │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                        EDGE / CDN LAYER                                  │
  │         Cloudflare Workers (assets, auth edge, geo-routing)              │
  │         Vercel Edge (SSR/ISR web app)                                    │
  └──────────────────────────────────┬───────────────────────────────────────┘
                                     │ HTTPS / WSS
  ┌──────────────────────────────────▼───────────────────────────────────────┐
  │                       API GATEWAY (Kong / custom)                        │
  │   REST (v1) · gRPC · WebSocket · SSE · Rate Limit · Auth Middleware     │
  │   TenantResolver · RequestValidator · AuditLogger                        │
  └──────────┬────────────────────────────────────────────┬──────────────────┘
             │ gRPC                                       │ gRPC
  ┌──────────▼──────────────────┐         ┌──────────────▼──────────────────┐
  │      CORE SERVICES          │         │     CONNECTOR RUNTIME           │
  │  ─────────────────────────  │         │  ─────────────────────────────  │
  │  intent-service             │         │  connector-service              │
  │  goal-service (MGIS)        │         │  execution-service              │
  │  memory-service             │         │  sandbox-service                │
  │  planner-service            │         │  marketplace-service            │
  │  policy-service             │         │  mcis-registry-service          │
  │  context-service            │         │                                 │
  └──────────┬──────────────────┘         └──────────────┬──────────────────┘
             │                                           │
  ┌──────────▼────────────────────────────────────────── ▼──────────────────┐
  │                     INFRASTRUCTURE LAYER                                 │
  │                                                                          │
  │  ┌────────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
  │  │  PostgreSQL 16 │  │  Redis 7     │  │  pgvector / Pinecone       │  │
  │  │  (primary DB)  │  │  (cache/bus) │  │  (semantic memory search)  │  │
  │  └────────────────┘  └──────────────┘  └────────────────────────────┘  │
  │  ┌────────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
  │  │   S3 / R2      │  │  Kafka       │  │  OpenTelemetry Collector    │  │
  │  │  (files)       │  │  (events)    │  │  (Tempo + Loki + Prometheus)│  │
  │  └────────────────┘  └──────────────┘  └────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Arquitetura Lógica — Camadas (MAS §3 implementado)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ARQUITETURA LÓGICA — CAMADAS                            │
└──────────────────────────────────────────────────────────────────────────────┘

  CAMADA 0 — CLIENT LAYER
  ──────────────────────────────────────────────────────────────────────
  Web App (React 19 + Vite)
  Mobile (React Native 0.74 + Expo)
  Desktop (Electron + React)
  Voice Interface (Web Speech API / Whisper)
  Public SDK (@memoryos/sdk-js, @memoryos/sdk-python)

  CAMADA 1 — GATEWAY LAYER
  ──────────────────────────────────────────────────────────────────────
  AuthMiddleware (JWT RS256 + refresh rotation)
  TenantResolver (Personal | Enterprise multi-tenant)
  RateLimiter (por plano: Free/Pro/Enterprise)
  RequestValidator (Zod schemas)
  AuditLogger (append-only, hash chain)

  CAMADA 2 — CORE INTELLIGENCE (MAS §3.1)
  ──────────────────────────────────────────────────────────────────────
  NLUEngine → IntentEngine → GoalEngine (MGIS) → Planner
  MemoryEngine (store + vector + lifecycle)
  ContextEngine (enrich + resolve)
  KnowledgeEngine (specialists + knowledge packs)
  PolicyEngine → PermissionEngine

  CAMADA 3 — SPECIALIST LAYER (MAS §3.3)
  ──────────────────────────────────────────────────────────────────────
  TravelSpecialist · FinanceSpecialist · MedicalSpecialist
  LegalSpecialist · IndustrialSpecialist · BlockchainSpecialist
  NutritionSpecialist · HRSpecialist · GovSpecialist

  CAMADA 4 — CONNECTOR LAYER (MCF + MCIS)
  ──────────────────────────────────────────────────────────────────────
  MCISRegistry (Capability · Entity · Action · Event · Workflow)
  CapabilityGraph (composição, equivalência, alternativas)
  ConnectorManager (seleção MCIS + fallback)
  ConnectorSandbox (isolamento, quota, network allowlist)
  ExecutionEngine (sequential + parallel + retry + circuit breaker)
  WorkflowEngine (multi-step + compensation)

  CAMADA 5 — INFRASTRUCTURE
  ──────────────────────────────────────────────────────────────────────
  UniversalEventBus (UEB — Kafka + Redis PubSub)
  Scheduler (cron + recurrent goals + conditional triggers)
  NotificationEngine (push + email + SMS + webhook)
  SecretManager (Vault + rotation)
  ObservabilityStack (OTel + Prometheus + Grafana)
```

## 1.3 Estrutura do Monorepo Oficial

```
memoryos/                               # Monorepo raiz
│
├── apps/
│   ├── api/                            # NestJS — API principal
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── intent/             # IntentController + IntentModule
│   │   │   │   ├── goal/               # GoalController + GoalModule
│   │   │   │   ├── memory/             # MemoryController + MemoryModule
│   │   │   │   ├── connectors/         # ConnectorController + ConnectorModule
│   │   │   │   ├── executions/         # ExecutionController + ExecutionModule
│   │   │   │   ├── auth/               # AuthModule (OAuth, JWT, OIDC)
│   │   │   │   └── marketplace/        # MarketplaceModule
│   │   │   ├── gateway/                # WsGateway (WebSocket)
│   │   │   ├── middleware/             # Auth, Tenant, Rate, Audit
│   │   │   └── main.ts
│   │   └── Dockerfile
│   │
│   ├── web/                            # React 19 + Vite (web app)
│   ├── mobile/                         # React Native + Expo
│   ├── desktop/                        # Electron wrapper do web app
│   └── voice-service/                  # Node.js — Voice Pipeline server
│
├── packages/
│   ├── core/                           # @memoryos/core
│   │   ├── intent/                     # NLU + Intent Engine
│   │   ├── goal/                       # MGIS: Goal Engine + Decomposer + Graph
│   │   ├── memory/                     # Memory Engine + Vector + Lifecycle
│   │   ├── planner/                    # Planner + Critical Path
│   │   ├── context/                    # Context Engine + Enricher
│   │   ├── knowledge/                  # Knowledge Engine + Specialist Bus
│   │   └── policy/                     # Policy Engine + Permission Engine
│   │
│   ├── connector-sdk/                  # @memoryos/connector-sdk (MCF)
│   │   ├── base/                       # BaseConnector
│   │   ├── manifest/                   # ConnectorManifest + validation
│   │   ├── lifecycle/                  # ConnectorLifecycle
│   │   ├── hooks/                      # ConnectorHooks
│   │   ├── discovery/                  # ConnectorDiscovery
│   │   └── versioning/                 # Semver + compatibility
│   │
│   ├── mcis/                           # @memoryos/mcis (MCIS Runtime)
│   │   ├── registries/                 # Capability/Entity/Action/Event/Workflow
│   │   ├── graph/                      # CapabilityGraph
│   │   ├── search/                     # ConnectorSearch
│   │   ├── lookup/                     # ConnectorLookup
│   │   ├── selection/                  # SelectionEngine
│   │   └── compatibility/              # VersionNegotiation
│   │
│   ├── mgis/                           # @memoryos/mgis (MGIS Runtime)
│   │   ├── engine/                     # GoalEngine
│   │   ├── decomposer/                 # GoalDecomposer
│   │   ├── graph/                      # GoalGraph
│   │   ├── lifecycle/                  # GoalStateMachine
│   │   ├── conflict/                   # ConflictResolver
│   │   ├── priority/                   # PrioritizationEngine
│   │   ├── prediction/                 # GoalPredictionEngine
│   │   ├── memory/                     # GoalMemoryManager
│   │   └── registry/                   # GoalRegistry + GoalOntology
│   │
│   ├── specialists/                    # @memoryos/specialists-*
│   │   ├── travel/
│   │   ├── finance/
│   │   ├── medical/
│   │   ├── legal/
│   │   ├── blockchain/
│   │   ├── industrial/
│   │   └── nutrition/
│   │
│   ├── shared/                         # @memoryos/shared
│   │   ├── contracts/                  # Todas as interfaces TypeScript
│   │   ├── events/                     # Definições de eventos do UEB
│   │   ├── errors/                     # Hierarquia de erros
│   │   ├── validators/                 # Zod schemas reutilizáveis
│   │   ├── ids/                        # Geração de IDs determinísticos
│   │   └── utils/                      # Helpers puros (sem dependências)
│   │
│   └── infra/                          # @memoryos/infra
│       ├── database/                   # TypeORM / Drizzle + migrations
│       ├── cache/                      # Redis abstraction
│       ├── queue/                      # Kafka / BullMQ abstraction
│       ├── storage/                    # S3 / R2 abstraction
│       ├── secrets/                    # Vault + env abstraction
│       └── observability/              # OTel setup
│
├── connector-catalog/                  # Connectors oficiais (MCF + MCIS)
│   ├── gmail/
│   ├── google-calendar/
│   ├── google-drive/
│   ├── outlook/
│   ├── shopify/
│   ├── mercado-livre/
│   ├── bling/
│   ├── totvs/
│   ├── sabre/
│   ├── galileo/
│   ├── amadeus/
│   ├── phantom/
│   ├── metamask/
│   ├── layerzero/
│   ├── chainlink/
│   ├── openai/
│   ├── claude/
│   ├── gemini/
│   ├── zebra/
│   └── open-banking/
│
├── infra/
│   ├── terraform/                      # IaC (AWS / GCP / Cloudflare)
│   ├── k8s/                            # Kubernetes manifests (staging, prod)
│   │   ├── base/
│   │   ├── staging/
│   │   └── production/
│   ├── docker/                         # Dockerfiles por serviço
│   └── scripts/                        # Deploy, migrate, seed scripts
│
├── docs/
│   └── 00-official-library/            # Biblioteca oficial (MV, MPS, MAS...)
│
├── tools/
│   ├── connector-cli/                  # CLI: criar / publicar connector
│   ├── specialist-cli/                 # CLI: criar / publicar specialist
│   └── schema-gen/                     # Gera types a partir de schemas DB
│
├── package.json                        # Root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                          # Turborepo pipeline
├── tsconfig.base.json                  # Base TypeScript config
└── .env.example                        # Template de variáveis de ambiente
```

## 1.4 Separação de Domínios

```
┌──────────────────────────────────────────────────────────────────────┐
│               SEPARAÇÃO DE DOMÍNIOS                                  │
├────────────────────┬─────────────────────────────────────────────────┤
│ Domínio            │ Responsabilidade                                │
├────────────────────┼─────────────────────────────────────────────────┤
│ CORE               │ NLU, Goals, Memory, Planner, Policy             │
│                    │ Nunca conhece connectors específicos            │
│                    │ Tecnologia-agnóstico                            │
├────────────────────┼─────────────────────────────────────────────────┤
│ PERSONAL           │ Goals pessoais, memória pessoal                 │
│                    │ 1 user = 1 tenant isolado                       │
│                    │ Connectors pessoais (Gmail, Calendar...)        │
├────────────────────┼─────────────────────────────────────────────────┤
│ ENTERPRISE         │ Multi-tenant, RBAC, aprovações, delegações      │
│                    │ Knowledge base compartilhada da org             │
│                    │ Connectors org (TOTVS, ERP, CRM...)             │
├────────────────────┼─────────────────────────────────────────────────┤
│ RUNTIME            │ Execution Engine, Sandbox, Circuit Breaker      │
│                    │ Gerencia execução sem conhecer negócio          │
├────────────────────┼─────────────────────────────────────────────────┤
│ CONNECTOR RUNTIME  │ Carrega, executa, monitora Connectors           │
│                    │ Isolamento via worker_threads / Deno            │
├────────────────────┼─────────────────────────────────────────────────┤
│ SPECIALIST RUNTIME │ Carrega Knowledge Packs, responde perguntas     │
│                    │ Enriquece decomposição de Goals                 │
├────────────────────┼─────────────────────────────────────────────────┤
│ MARKETPLACE        │ Catálogo, instalação, billing, reviews          │
│                    │ Operação independente do Core                   │
└────────────────────┴─────────────────────────────────────────────────┘
```

## 1.5 Convenções de Nomenclatura

```typescript
// ─── ARQUIVOS ────────────────────────────────────────────────────
// kebab-case sempre
// intent-engine.ts
// goal-decomposer.ts
// gmail-connector.ts
// memory-store.repository.ts
// goal-created.event.ts
// create-goal.command.ts

// ─── CLASSES ─────────────────────────────────────────────────────
class IntentEngine {}
class GoalDecomposer {}
class GmailConnector {}
class PostgresGoalRepository {}

// ─── INTERFACES ───────────────────────────────────────────────────
// Sem prefixo 'I' — nome semântico é suficiente
interface GoalEngine {}
interface ConnectorManifest {}
interface MemoryRecord {}

// ─── TIPOS ────────────────────────────────────────────────────────
type GoalState = "CREATED" | "PLANNING" | "EXECUTING" | "COMPLETED";
type ConnectorType = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
type GoalHorizon = "INSTANT" | "SHORT" | "MEDIUM" | "LONG" | "PERMANENT";

// ─── EVENTOS (UEB) ────────────────────────────────────────────────
// domínio.recurso.ação — snake_case
"goal.created"
"goal.state_changed"
"connector.gmail.email_received"
"memory.fact.stored"
"execution.step.completed"
"marketplace.connector.installed"

// ─── MÓDULOS / PACOTES ────────────────────────────────────────────
"@memoryos/core"
"@memoryos/connector-sdk"
"@memoryos/mcis"
"@memoryos/mgis"
"@memoryos/shared"
"@memoryos/specialists-travel"

// ─── BANCO DE DADOS ──────────────────────────────────────────────
// Tabelas: snake_case, plural
// goals, goal_steps, memory_records, connector_registrations
// Colunas: snake_case
// created_at, tenant_id, ontology_domain

// ─── VARIÁVEIS DE AMBIENTE ────────────────────────────────────────
// Prefixo MOS_ + SCREAMING_SNAKE_CASE
// MOS_DATABASE_URL
// MOS_REDIS_URL
// MOS_JWT_SECRET
// MOS_VAULT_ADDR
```

## 1.6 Versionamento Oficial

```
SEMVER: MAJOR.MINOR.PATCH

MAJOR — Breaking change em contrato público ou motor
MINOR — Nova feature backward-compatible
PATCH — Bugfix, performance, segurança

PACOTES INDEPENDENTES:
  @memoryos/core             1.x.x
  @memoryos/connector-sdk    1.x.x  (MCF)
  @memoryos/mcis             1.x.x
  @memoryos/mgis             1.x.x
  @memoryos/shared           1.x.x
  API REST                   /v1/, /v2/ (na URL)
  Connectors oficiais        versão própria por connector

DEPRECATION POLICY:
  Mínimo 2 minor versions de aviso antes de remover
  Header Deprecation: <date> em todas as respostas deprecated
  Header Sunset: <date> indicando data de remoção
  CHANGELOG.md obrigatório em cada release

GIT FLOW:
  main         → produção (protected, merge via PR apenas)
  develop      → integração contínua
  feature/*    → novas features
  fix/*        → bugfixes
  connector/*  → desenvolvimento de connectors
  release/*    → preparação de release (RC)
  hotfix/*     → correção crítica em produção
```

## 1.7 Feature Flags

```typescript
// Sistema: Unleash (self-hosted) ou LaunchDarkly

interface FeatureFlag {
  key:                string;       // "goal_prediction_v2"
  enabled:            boolean;
  rolloutPercentage:  number;       // 0–100
  targetUserIds?:     string[];
  targetOrgIds?:      string[];
  targetPlans?:       string[];     // ["ENTERPRISE"]
}

// Flags oficiais de lançamento
const OFFICIAL_FLAGS = {
  GOAL_PREDICTION:            "goal_prediction_v2",
  GOAL_AUTO_EXECUTE:          "goal_auto_execute",
  CONNECTOR_HOT_PLUG:         "connector_hot_plug",
  VOICE_CONTINUOUS:           "voice_continuous_mode",
  ENTERPRISE_MULTI_TENANT:    "enterprise_multi_tenant",
  BLOCKCHAIN_CONNECTORS:      "blockchain_connectors_enabled",
  MARKETPLACE_V2:             "marketplace_v2",
  SPECIALIST_RUNTIME_V2:      "specialist_runtime_v2",
} as const;

// Uso
if (await flags.isEnabled(OFFICIAL_FLAGS.GOAL_PREDICTION, ctx.userId)) {
  return goalPredictionV2.predict(context);
}
```

## 1.8 Sistema de Configuração Hierárquica

```typescript
// Prioridade: defaults < .env < config.yaml < runtime secrets

const MemoryOSConfigSchema = z.object({
  core: z.object({
    intentConfidenceThreshold: z.number().min(0).max(1).default(0.70),
    goalMaxDepth:               z.number().int().positive().default(10),
    plannerTimeoutMs:           z.number().int().positive().default(30_000),
    memoryTtlDays:              z.number().int().positive().default(365),
  }),
  connectors: z.object({
    sandboxEnabled:         z.boolean().default(true),
    maxConcurrent:          z.number().int().positive().default(50),
    defaultTimeoutMs:       z.number().int().positive().default(15_000),
    maxMemoryMb:            z.number().int().positive().default(256),
  }),
  db: z.object({
    url:            z.string().url(),
    poolMin:        z.number().int().default(5),
    poolMax:        z.number().int().default(20),
    statementTimeout: z.number().int().default(30_000),
  }),
  redis: z.object({
    url: z.string(),
    ttlDefault: z.number().int().default(300),
  }),
  observability: z.object({
    otlpEndpoint:  z.string().url().optional(),
    logLevel:      z.enum(["debug", "info", "warn", "error"]).default("info"),
    metricsEnabled: z.boolean().default(true),
  }),
});

export type MemoryOSConfig = z.infer<typeof MemoryOSConfigSchema>;

export async function loadConfig(): Promise<MemoryOSConfig> {
  return MemoryOSConfigSchema.parse({
    ...loadDefaults(),
    ...loadFromEnv(),
    ...await loadFromVault(),
  });
}
```

## 1.9 Sistema de Plugins

```typescript
// Interface base para todo plugin (Connector, Specialist, Workflow, Skill, Policy, Agent)

interface MemoryOSPlugin {
  readonly pluginId:   string;
  readonly name:       string;
  readonly version:    string;
  readonly type:       "CONNECTOR" | "SPECIALIST" | "WORKFLOW" | "SKILL" | "POLICY" | "AGENT";
  readonly sdkVersion: string;

  // Lifecycle (MCF §4 para Connectors, análogo para outros tipos)
  onInstall(ctx: PluginContext):   Promise<void>;
  onEnable(ctx: PluginContext):    Promise<void>;
  onDisable(ctx: PluginContext):   Promise<void>;
  onUninstall(ctx: PluginContext): Promise<void>;

  // MCIS / MGIS self-description
  describe(): PluginDescriptor;

  // Sandbox: permissões mínimas declaradas
  requiredPermissions: SandboxPermission[];
}

// Module Registry — DI container interno
class ModuleRegistry {
  private readonly modules = new Map<string, MemoryOSPlugin>();

  register(plugin: MemoryOSPlugin): void {
    this.validateSignature(plugin);
    this.checkCompatibility(plugin);
    this.modules.set(plugin.pluginId, Object.freeze(plugin));
    this.eventBus.emit("plugin.registered", { pluginId: plugin.pluginId, type: plugin.type });
  }

  resolve<T extends MemoryOSPlugin>(pluginId: string): T {
    const plugin = this.modules.get(pluginId);
    if (!plugin) throw new PluginNotFoundException(pluginId);
    return plugin as T;
  }

  listByType(type: MemoryOSPlugin["type"]): MemoryOSPlugin[] {
    return [...this.modules.values()].filter(p => p.type === type);
  }
}
```

## 1.10 Diagrama C4 — Nível 1 (Contexto)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         C4 LEVEL 1 — CONTEXTO                              │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     linguagem natural      ┌───────────────────────────────┐
  │   Usuário    │──────────────────────────► │                               │
  │  (pessoa /   │                            │        MemoryOS               │
  │   empresa)   │◄────────────────────────── │   (plataforma inteligente     │
  └──────────────┘   resposta estruturada     │    de segunda memória)        │
                                              └──────────────┬────────────────┘
                                                             │
                    ┌────────────────────────┬───────────────┼───────────────────┐
                    │                        │               │                   │
             ┌──────▼──────┐        ┌────────▼──────┐ ┌─────▼─────┐  ┌─────────▼──────┐
             │  Sistemas   │        │  Sistemas     │ │  Sistemas  │  │   Marketplace  │
             │  de Email   │        │  de Finanças  │ │ de Viagem  │  │   de Plugins   │
             │  (Gmail etc)│        │  (Bling, ERP) │ │ (Sabre...) │  │   (Connectors) │
             └─────────────┘        └───────────────┘ └────────────┘  └────────────────┘
```

## 1.11 Diagrama C4 — Nível 2 (Containers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     C4 LEVEL 2 — CONTAINERS                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Cliente
  (Web / Mobile / API)
        │ HTTPS/WSS
        ▼
  ┌─────────────────┐
  │  API Gateway    │ ← Auth · Rate Limit · Tenant · Audit
  └────────┬────────┘
           │ gRPC
  ┌────────▼────────────────────────────────────────────────────────────────┐
  │                           CORE SERVICES                                 │
  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ │
  │  │intent-service│ │ goal-service │ │memory-service│ │planner-service │ │
  │  │              │ │   (MGIS)     │ │              │ │                │ │
  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────────┘ │
  │  ┌──────────────┐ ┌──────────────┐                                      │
  │  │policy-service│ │context-svc   │                                      │
  │  └──────────────┘ └──────────────┘                                      │
  └────────────────────────────────────┬───────────────────────────────────-┘
                                       │ gRPC
  ┌────────────────────────────────────▼───────────────────────────────────┐
  │                       CONNECTOR RUNTIME                                │
  │  ┌──────────────────┐ ┌────────────────┐ ┌──────────────────────────┐ │
  │  │connector-service │ │execution-svc   │ │  mcis-registry-service   │ │
  │  │(manager+sandbox) │ │(engine+workflow│ │  (MCIS Registries+Graph) │ │
  │  └──────────────────┘ └────────────────┘ └──────────────────────────┘ │
  └────────────────────────────────────────────────────────────────────────┘
           │ Kafka + Redis
  ┌────────▼────────────────────────────────────────────────────────────────┐
  │                      INFRASTRUCTURE                                     │
  │  PostgreSQL  ·  Redis  ·  pgvector  ·  Kafka  ·  S3/R2  ·  OTel       │
  └────────────────────────────────────────────────────────────────────────-┘
```

---

**Documento Oficial:** MDS — MemoryOS Developer Specification  
**Versão:** 1.0 · **Status:** Manual Oficial de Engenharia  
**Parte:** 1 de 4 — Organização da Solução