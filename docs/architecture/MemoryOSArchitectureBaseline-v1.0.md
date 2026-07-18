# MemoryOS Architecture Baseline v1.0

> **Status:** OFFICIALLY FROZEN  
> **Version:** 1.0.0  
> **Date:** 2026-07-18  
> **Phase:** Engineering First — COMPLETE | Beta — APPROVED  
> **Author:** MemoryOS Engineering Team  

---

## Index

1. [Visao Geral](#1-visao-geral)
2. [Arquitetura Oficial](#2-arquitetura-oficial)
3. [Componentes Oficiais](#3-componentes-oficiais)
4. [Contratos Oficiais (Interfaces)](#4-contratos-oficiais-interfaces)
5. [Dependencias Permitidas](#5-dependencias-permitidas)
6. [Regras Arquiteturais](#6-regras-arquiteturais)
7. [Principios SOLID](#7-principios-solid)
8. [Imutabilidade](#8-imutabilidade)
9. [Certificacao](#9-certificacao)
10. [Roadmap Beta](#10-roadmap-beta)

---

## 1. Visao Geral

### 1.1 Definicao Oficial

**MemoryOS e um Sistema Operacional Cognitivo.**

Diferentemente de um assistente de IA convencional, o MemoryOS nao responde — ele **lembra**, **raciocina**, **planeja** e **age** com base em uma memoria permanente, inteligente e estruturada.

O MemoryOS e a camada cognitiva persistente que vive entre o usuario e seus dados, conectores, agentes e objetivos.

### 1.2 Proposito

| Atributo | Descricao |
|---|---|
| **Missao** | Preservar e disponibilizar o conhecimento do usuario como uma memoria viva e permanente |
| **Visao** | Ser a unica fonte de verdade cognitiva do usuario — para sempre |
| **Diferencial** | Continuidade: o MemoryOS nunca esquece, nunca perde contexto, nunca reinicia do zero |

### 1.3 Escopo

**Dentro do escopo:**
- Armazenamento permanente de conhecimento, decisoes, tarefas e eventos
- Raciocinio sobre memoria historica e contexto ativo
- Orquestracao de conectores externos (Google, GitHub, WhatsApp, etc.)
- Execucao autonoma de objetivos via pipeline cognitivo
- Governanca arquitetural continua e auditoria automatica

**Fora do escopo:**
- Substituir ferramentas especializadas (IDE, CRM, ERP)
- Gerenciar infraestrutura externa
- Armazenar blobs binarios ou arquivos de grande porte diretamente
- Executar logica de negocio especifica de dominio sem um conector

### 1.4 Principios Fundadores

| # | Principio | Descricao |
|---|---|---|
| P1 | **Engineering First** | Arquitetura vem antes de features. Nenhuma funcionalidade sem contrato. |
| P2 | **Architecture First** | Toda decisao e documentada como ADR antes de ser implementada |
| P3 | **Single Source of Truth** | A Official Library e a unica fonte de verdade arquitetural |
| P4 | **Zero Breaking Changes** | Evolucao via extensao, nunca via modificacao destrutiva |
| P5 | **Zero Regressions** | Suites de certificacao devem passar a 100% antes de qualquer merge |
| P6 | **Auditability** | Toda acao do sistema e rastreavel com origem, confianca e timestamp |
| P7 | **Explainability** | Toda decisao cognitiva deve produzir uma justificativa legivel |
| P8 | **Versioned Architecture** | Toda mudanca arquitetural produz uma nova versao deste documento |

### 1.5 Limites Arquiteturais

```
+----------------------------------------------------------+
|                    MemoryOS Boundary                     |
|                                                          |
|  [ Cognitive Pipeline ]  [ Memory Store ]                |
|  [ Connector Runtime ]   [ Official Library ]            |
|  [ Governance Engine ]   [ Runtime Layer ]               |
|                                                          |
+----------------------------------------------------------+
         |                              |
  External Connectors            External Storage
  (Gmail, Drive, GitHub)         (Base44 Entities)
```

---

## 2. Arquitetura Oficial

### 2.1 Diagrama de Camadas

```
+================================================================+
|                     CONVERSATION LAYER                        |
|         ChatPage | VoicePanel | ConversationPipeline           |
+================================================================+
                              |
                              v
+================================================================+
|                       INTENT LAYER                            |
|    PrimaryConversationRouter | IntentRuntimeStage             |
|    ImplicitConnectorIntentDetector | NaturalLanguageGoalNorm.  |
+================================================================+
                              |
                              v
+================================================================+
|                        GOAL LAYER                             |
|    GoalRuntime | GoalRegistry | GoalScheduler                 |
|    GoalExecutionQueue | GoalIntelligenceEngine                |
+================================================================+
                              |
                              v
+================================================================+
|                      PLANNING LAYER                           |
|    PlanningEngine | CognitivePlanner | ConversationPlanningEng.|
|    PipelineBuilder | ExecutionChain                           |
+================================================================+
                              |
                              v
+================================================================+
|                      DECISION LAYER                           |
|    DecisionEngine | ReasoningEngine | MREEngine               |
|    StrategyFusionEngine | SpecialistRouter                    |
+================================================================+
                              |
                              v
+================================================================+
|                      EXECUTION LAYER                          |
|    ExecutionPipeline | ExecutionDispatcher | PipelineStage    |
|    ConnectorRuntimeStage | CapabilityRuntimeStage             |
+================================================================+
                              |
                              v
+================================================================+
|                       MEMORY LAYER                            |
|    UnifiedCognitiveMemoryEngine (UCME) | MemoryFusionEngine   |
|    WorkingMemoryEngine | MemoryStore | MemoryPipeline         |
+================================================================+
                              |
                              v
+================================================================+
|                      KNOWLEDGE LAYER                          |
|    KnowledgeFusionEngine | KnowledgeReconstructionEngine      |
|    OfficialLibrary | OfficialKnowledgeGraph                   |
+================================================================+
                              |
                              v
+================================================================+
|                     CONNECTOR LAYER                           |
|    ConnectorRuntime | UCRPipeline | ConnectorRegistry         |
|    GmailConnector | DriveConnector | CalendarConnector        |
+================================================================+
                              |
                              v
+================================================================+
|                    GOVERNANCE LAYER                           |
|    ArchitectureGovernanceEngine | EngineeringGovernance       |
|    ACL | ABV | ArchitectureValidation | CertificationEngine   |
+================================================================+
                              |
                              v
+================================================================+
|                      RUNTIME LAYER  [CERTIFIED EF-7.2.7]     |
|    IRuntimeStore | RuntimeRegistry | RuntimeResolver          |
|    RuntimeTelemetry | OfficialLibraryRuntimeProvider          |
|    ILoaderProvider | LoaderProvider | EnvironmentCapability   |
+================================================================+
```

### 2.2 Descricao das Camadas

| Camada | Responsabilidade | Status |
|---|---|---|
| **Conversation** | Interface com o usuario (texto/voz), streaming, sessoes | Certified |
| **Intent** | Classificacao de intencao, roteamento, deteccao implicita | Certified |
| **Goal** | Gestao de objetivos, scheduling, fila de execucao | Certified |
| **Planning** | Criacao de planos de execucao, orquestracao de estagios | Certified |
| **Decision** | Raciocinio, fusao de estrategias, selecao de especialistas | Certified |
| **Execution** | Execucao deterministica do pipeline, auditoria por estagio | Certified |
| **Memory** | Armazenamento e recuperacao cognitiva unificada (UCME) | Certified |
| **Knowledge** | Grafo de conhecimento, fusao, reconstrucao, Official Library | Certified |
| **Connector** | Integracao com servicos externos via contratos IConnector | Certified |
| **Governance** | Auditoria arquitetural continua, certificacao, regressao | Certified |
| **Runtime** | Abstracoes de ambiente, providers, loaders, telemetria | **FROZEN EF-7.2.7** |

---

## 3. Componentes Oficiais

### 3.1 Conversation Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| ChatInterface | `src/components/chat/ChatInterface.jsx` | UI de chat completa |
| VoicePanel | `src/components/voice/VoicePanel.jsx` | Interacao por voz |
| ConversationPipeline | `src/lib/conversation-platform/ConversationPipeline.ts` | Orquestracao de conversa |
| ConversationManager | `src/lib/conversation-platform/ConversationManager.ts` | Sessoes e persistencia |
| ConversationStreaming | `src/lib/conversation-platform/ConversationStreaming.ts` | Streaming de resposta |

### 3.2 Intent Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| PrimaryConversationRouter | `src/lib/primary-conversation-router/PrimaryConversationRouter.ts` | Roteamento principal |
| ImplicitConnectorIntentDetector | `src/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector.ts` | Deteccao implicita |
| NaturalLanguageGoalNormalizer | `src/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer.ts` | Normalizacao de objetivos |
| ConversationGoalBridge | `src/lib/conversation-goal-bridge/ConversationGoalBridge.ts` | Ponte conversa-objetivo |

### 3.3 Goal Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| GoalRuntime | `src/lib/goal-runtime-v01/GoalRuntime.ts` | Execucao de objetivos |
| GoalRegistry | `src/lib/goal-runtime-v01/GoalRegistry.ts` | Registro de objetivos |
| GoalScheduler | `src/lib/goal-scheduler/GoalScheduler.ts` | Agendamento |
| GoalExecutionQueue | `src/lib/goal-execution-queue/GoalExecutionQueue.ts` | Fila de execucao |
| GoalIntelligenceEngine | `src/lib/goal-intelligence/GoalIntelligenceEngine.ts` | Inteligencia de objetivos |
| GoalRegistryService | `src/lib/goal-registry-service/GoalRegistryService.ts` | Servico de registro |

### 3.4 Planning Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| PlanningEngine | `src/lib/planning-engine/PlanningEngine.ts` | Motor de planejamento |
| ConversationPlanningEngine | `src/lib/planning-engine-e022/ConversationPlanningEngine.ts` | Planejamento conversacional |
| PipelineBuilder | `src/lib/execution-chain/PipelineBuilder.ts` | Construcao do pipeline |
| ExecutionChain | `src/lib/execution-chain/ExecutionChain.ts` | Cadeia de execucao |
| CognitivePlanner | `src/lib/cognitive-dev-loop/CognitivePlanner.ts` | Planejador cognitivo |

### 3.5 Decision Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| DecisionEngine | `src/lib/decision-engine/DecisionEngine.ts` | Motor de decisao |
| MemoryReasoningEngine (MRE) | `src/lib/mre/MemoryReasoningEngine.ts` | Raciocinio sobre memoria |
| StrategyFusionEngine | `src/lib/strategy-fusion/StrategyFusionEngine.ts` | Fusao de estrategias |
| SpecialistRouter | `src/lib/specialist-router/SpecialistRouter.ts` | Roteamento por especialista |
| ReflectionEngine | `src/lib/reflection-engine/ReflectionEngine.ts` | Auto-reflexao |
| SelfEvaluationEngine | `src/lib/self-evaluation-engine/SelfEvaluationEngine.ts` | Auto-avaliacao |

### 3.6 Execution Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| ExecutionPipeline | `src/lib/execution-chain/ExecutionPipeline.ts` | Pipeline de execucao |
| ExecutionDispatcher | `src/lib/execution-dispatcher/ExecutionDispatcher.ts` | Despacho de execucao |
| KernelStage | `src/lib/execution-chain/stages/KernelStage.ts` | Estagio kernel |
| ConnectorRuntimeStage | `src/lib/execution-chain/stages/ConnectorRuntimeStageImpl.ts` | Estagio conector |
| CapabilityRuntimeStage | `src/lib/execution-chain/stages/CapabilityRuntimeStage.ts` | Estagio capacidade |
| AuditStage | `src/lib/execution-chain/stages/AuditStage.ts` | Estagio auditoria |
| ExplainabilityStage | `src/lib/execution-chain/stages/ExplainabilityStage.ts` | Estagio explicabilidade |

### 3.7 Memory Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| UnifiedCognitiveMemoryEngine (UCME) | `src/lib/ucme/UnifiedMemoryEngine.ts` | Memoria unificada (fonte central) |
| MemoryFusionEngine | `src/lib/ucme/MemoryFusionEngine.ts` | Fusao de evidencias |
| MemoryProviderRegistry | `src/lib/ucme/MemoryProviderRegistry.ts` | Registro de providers |
| WorkingMemoryEngine (WME) | `src/lib/wme/WorkingMemoryEngine.ts` | Memoria de trabalho |
| MemoryStore | `src/lib/memory-engine/memoryStore.js` | Armazenamento |
| MemoryReasoningEngine | `src/lib/mre/MemoryReasoningEngine.ts` | Raciocinio |
| LearningEngine | `src/lib/learning-engine/LearningEngine.ts` | Aprendizado |
| RetrievalEngine | `src/lib/retrieval-engine/RetrievalEngine.ts` | Recuperacao |

### 3.8 Knowledge Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| OfficialLibraryBootstrap | `src/lib/official-library/OfficialLibraryBootstrap.ts` | Inicializacao da biblioteca |
| OfficialLibraryProvider | `src/lib/official-library/OfficialLibraryProvider.ts` | Provider UCME |
| OfficialLibraryCatalog | `src/lib/official-library/OfficialLibraryCatalog.ts` | Catalogo de documentos |
| OfficialKnowledgeGraph | `src/lib/official-library/OfficialKnowledgeGraph.ts` | Grafo de conhecimento |
| KnowledgeFusionEngine | `src/lib/knowledge-fusion-engine/KnowledgeFusionEngine.ts` | Fusao de conhecimento |
| KnowledgeReconstructionEngine | `src/lib/knowledge-reconstruction/KnowledgeReconstructionEngine.ts` | Reconstrucao |
| GraphBuilder | `src/lib/official-library/GraphBuilder.ts` | Construcao do grafo |
| GraphStorage | `src/lib/official-library/GraphStorage.ts` | Armazenamento do grafo |

### 3.9 Connector Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| ConnectorRuntime | `src/lib/connector-runtime/ConnectorRuntime.ts` | Runtime de conectores |
| ConnectorRegistry | `src/lib/connector-runtime/ConnectorRegistry.ts` | Registro de conectores |
| UCRPipeline | `src/lib/ucr/UCRPipeline.ts` | Pipeline universal de conectores |
| GmailConnector | `src/lib/connector-runtime/connectors/GmailConnector.ts` | Conector Gmail |
| GoogleDriveConnector | `src/lib/connector-runtime/connectors/GoogleDriveConnector.ts` | Conector Drive |
| GoogleCalendarConnector | `src/lib/connector-runtime/connectors/GoogleCalendarConnector.ts` | Conector Calendar |
| GitHubConnector | `src/lib/connector-runtime/connectors/GitHubConnector.ts` | Conector GitHub |
| ConnectorBootstrap | `src/lib/connector-runtime/ConnectorBootstrap.ts` | Inicializacao |

### 3.10 Governance Layer

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| ArchitectureGovernanceEngine | `src/lib/architecture-governance/ArchitectureGovernanceEngine.ts` | Governanca arquitetural |
| EngineeringGovernance | `src/lib/engineering-governance/EngineeringGovernance.ts` | Governanca de engenharia |
| ArchitecturalBoundaryValidator (ABV) | `src/lib/abv/ArchitecturalBoundaryValidator.ts` | Validacao de fronteiras |
| ArchitectureBaselineEngine (ABE) | `src/lib/abe/ArchitectureBaselineEngine.ts` | Baseline arquitetural |
| EngineeringRegressionSuite | `src/lib/engineering-regression/EngineeringRegressionSuite.ts` | Suite de regressao |
| ACLRunner | `src/lib/acl/ACLRunner.ts` | Certificacao arquitetural |
| ArchitectureValidation | `src/lib/official-library/ArchitectureValidation.ts` | Validacao SOLID |

### 3.11 Runtime Layer (FROZEN EF-7.2.7)

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| IRuntimeStore | `src/lib/official-library/IRuntimeStore.ts` | Contrato de armazenamento |
| RuntimeRegistry | `src/lib/official-library/RuntimeRegistry.ts` | Implementa IRuntimeStore |
| IRuntimeResolver | `src/lib/official-library/IRuntimeResolver.ts` | Contrato de resolucao |
| RuntimeResolver | `src/lib/official-library/RuntimeResolver.ts` | Resolucao via IRuntimeStore |
| RuntimeTelemetry | `src/lib/official-library/RuntimeTelemetry.ts` | Metricas isoladas (SRP) |
| OfficialLibraryRuntimeProvider | `src/lib/official-library/OfficialLibraryRuntimeProvider.ts` | Facade de runtime |
| IRuntimeProvider | `src/lib/official-library/IRuntimeProvider.ts` | Contrato de provider |
| ViteRuntimeProvider | `src/lib/official-library/ViteRuntimeProvider.ts` | Provider Vite/Browser |
| NodeRuntimeProvider | `src/lib/official-library/NodeRuntimeProvider.ts` | Provider Node.js |
| Base44RuntimeProvider | `src/lib/official-library/Base44RuntimeProvider.ts` | Provider Base44 |
| ILoaderProvider | `src/lib/official-library/ILoaderProvider.ts` | Contrato de loader |
| LoaderProvider | `src/lib/official-library/LoaderProvider.ts` | Encapsula DocumentLoaderFactory |
| EnvironmentCapability | `src/lib/official-library/EnvironmentCapability.ts` | Representacao pura de ambiente |
| RuntimeScore | `src/lib/official-library/RuntimeScore.ts` | Score de providers (SRP) |
| RuntimeReason | `src/lib/official-library/RuntimeReason.ts` | Explicacao de selecao (SRP) |
| RuntimeSelector | `src/lib/official-library/RuntimeSelector.ts` | Selecao de providers (SRP) |

---

## 4. Contratos Oficiais (Interfaces)

### 4.1 Runtime Layer Interfaces

```typescript
// IRuntimeStore — armazenamento de providers
interface IRuntimeStore {
  register(provider: IRuntimeProvider): void;
  unregister(runtimeId: string): boolean;
  list(): readonly IRuntimeProvider[];
  getActive(): IRuntimeProvider;
  refresh(): void;
  clear(): void;
  has(runtimeId: string): boolean;
  get(runtimeId: string): IRuntimeProvider | undefined;
  readonly size: number;
  readonly lastSelectedId: string | null;
}

// IRuntimeProvider — contrato de provider de ambiente
interface IRuntimeProvider {
  readonly runtimeId:   string;
  readonly runtimeName: string;
  readonly priority:    number;
  readonly isAvailable: boolean;
  readonly reason:      string;
  readonly environment: string;
  supportsEnvironment(env: string): boolean;
  discovery(): IDocumentDiscovery;
  loader():    ILoaderProvider;
}

// IRuntimeResolver — resolucao de provider ativo
interface IRuntimeResolver {
  getActive(): IRuntimeProvider;
  refresh(): IRuntimeProvider;
  list(): readonly IRuntimeProvider[];
  explain(): readonly RuntimeReasonResult[];
}

// ILoaderProvider — acesso a loader de documentos
interface ILoaderProvider {
  readonly loaderId:   string;
  readonly loaderName: string;
  getLoader(): IDocumentLoader;
}
```

### 4.2 Connector Layer Interfaces

```typescript
// IConnector — contrato base para todos os conectores
interface IConnector {
  readonly connectorId:   string;
  readonly connectorName: string;
  readonly isConnected:   boolean;
  readonly capabilities:  string[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  execute(capability: string, params: Record<string, unknown>): Promise<ConnectorResult>;
  health(): Promise<ConnectorHealth>;
}

// IConnectorResult — resultado padrao de execucao
interface IConnectorResult<T = unknown> {
  readonly success:    boolean;
  readonly data:       T | null;
  readonly error:      string | null;
  readonly executedAt: string;
  readonly durationMs: number;
}
```

### 4.3 Memory Layer Interfaces

```typescript
// IMemoryProvider — provider de evidencias para UCME
interface IMemoryProvider {
  readonly providerId:   string;
  readonly providerName: string;
  search(query: UCMEQuery): Promise<UCMEEvidence[]>;
  health(): Promise<ProviderHealth>;
}

// IMemoryStore — armazenamento de memoria
interface IMemoryStore {
  store(record: MemoryRecord): Promise<void>;
  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>;
  update(id: string, delta: Partial<MemoryRecord>): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### 4.4 Execution Layer Interfaces

```typescript
// IPipelineStage — estagio do pipeline de execucao
interface IPipelineStage {
  readonly stageId:   string;
  readonly stageName: string;
  execute(context: ExecutionContext): Promise<ExecutionContext>;
  canExecute(context: ExecutionContext): boolean;
}

// IExecutionEngine — motor de execucao
interface IExecutionEngine {
  execute(plan: ExecutionPlan): Promise<ExecutionResult>;
  abort(executionId: string): Promise<void>;
  status(executionId: string): ExecutionStatus;
}
```

### 4.5 Planning Layer Interfaces

```typescript
// IPlanner — criacao de planos de execucao
interface IPlanner {
  plan(goal: Goal, context: PlanningContext): Promise<ExecutionPlan>;
  validate(plan: ExecutionPlan): ValidationResult;
  explain(plan: ExecutionPlan): string;
}
```

### 4.6 Decision Layer Interfaces

```typescript
// IDecisionEngine — tomada de decisao cognitiva
interface IDecisionEngine {
  decide(evidence: Evidence[], context: DecisionContext): Decision;
  explain(decision: Decision): DecisionExplanation;
  confidence(decision: Decision): number;
}
```

### 4.7 Document Discovery Interfaces

```typescript
// IDocumentDiscovery — descoberta de documentos por ambiente
interface IDocumentDiscovery {
  readonly runtimeId:   string;
  readonly runtimeName: string;
  readonly priority:    number;
  readonly isAvailable: boolean;
  discover(): Promise<DiscoveryResult>;
  list(): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
```

---

## 5. Dependencias Permitidas

### 5.1 Regra Geral

**Dependencias descem. Nunca sobem.**

Uma camada so pode depender de camadas abaixo dela na hierarquia. Toda dependencia e feita exclusivamente atraves de interfaces — nunca importando implementacoes concretas de outra camada.

### 5.2 Matriz de Dependencias

| Camada Origem | Camada Destino | Status |
|---|---|---|
| Conversation | Intent | PERMITIDO |
| Intent | Goal | PERMITIDO |
| Goal | Planning | PERMITIDO |
| Planning | Decision | PERMITIDO |
| Decision | Execution | PERMITIDO |
| Execution | Memory | PERMITIDO |
| Execution | Connector | PERMITIDO |
| Memory | Knowledge | PERMITIDO |
| Knowledge | Runtime | PERMITIDO |
| Connector | Runtime | PERMITIDO |
| Governance | Qualquer | PERMITIDO (read-only, auditoria) |
| Runtime | Qualquer | **PROIBIDO** |
| Knowledge | Connector | **PROIBIDO** |
| Memory | Planning | **PROIBIDO** |
| Decision | Conversation | **PROIBIDO** |
| Planning | Intent | **PROIBIDO** |
| Goal | Decision | **PROIBIDO** |
| Execution | Intent | **PROIBIDO** |
| Intent | Conversation | **PROIBIDO** |

### 5.3 Regras de Dependencia por Camada

```
Conversation
  └── Intent (via IntentClassifier interface)

Intent
  └── Goal (via IGoalRuntime interface)
  └── Memory (via UCME interface — leitura de contexto)

Goal
  └── Planning (via IPlanner interface)
  └── Memory (via UCME interface)

Planning
  └── Decision (via IDecisionEngine interface)
  └── Execution (via IExecutionEngine interface)

Decision
  └── Memory (via IMemoryProvider interface)
  └── Knowledge (via IOfficialLibraryProvider interface)

Execution
  └── Memory (via IMemoryStore interface)
  └── Connector (via IConnector interface)
  └── Governance (via IAuditSink interface)

Memory
  └── Knowledge (via IKnowledgeSource interface)

Knowledge
  └── Runtime (via IRuntimeProvider interface)

Connector
  └── Runtime (via IRuntimeProvider interface)

Governance
  └── All layers (via read-only audit interfaces — never mutates)

Runtime
  └── No dependencies on application layers (SEALED)
```

### 5.4 Dependencias Internas da Runtime Layer

```
OfficialLibraryBootstrap
  └── OfficialLibraryRuntimeProvider (via IRuntimeResolver only)

OfficialLibraryRuntimeProvider
  └── RuntimeResolver (via IRuntimeResolver interface)

RuntimeResolver
  └── RuntimeRegistry (via IRuntimeStore interface)
  └── RuntimeTelemetry (SRP — metrics delegation)
  └── RuntimeScore (scoring — no side effects)
  └── RuntimeReason (explanation — no side effects)

RuntimeRegistry (implements IRuntimeStore)
  └── RuntimeSelector (pure selection logic)
  └── RuntimeScore (pure scoring)

Providers (Vite/Node/Base44)
  └── ILoaderProvider (injected — never DocumentLoaderFactory directly)
  └── IDocumentDiscovery (self-contained)

EnvironmentCapability
  └── No dependencies (pure value representation)
```

---

## 6. Regras Arquiteturais

### 6.1 Regras de Importacao

| # | Regra | Nivel |
|---|---|---|
| R01 | **Nunca importar implementacoes concretas entre camadas** — usar sempre interfaces | OBRIGATORIO |
| R02 | **Nunca importar RuntimeRegistry diretamente** — usar IRuntimeStore | OBRIGATORIO |
| R03 | **Nunca importar DocumentLoaderFactory diretamente nos providers** — usar ILoaderProvider | OBRIGATORIO |
| R04 | **Nunca importar connectors concretos nos estagios** — usar IConnector | OBRIGATORIO |
| R05 | Importacoes circulares sao proibidas em qualquer circunstancia | OBRIGATORIO |

### 6.2 Regras de Contrato

| # | Regra | Nivel |
|---|---|---|
| R06 | Toda nova capacidade deve expor um contrato de interface antes da implementacao | OBRIGATORIO |
| R07 | Toda interface deve ser prefixada com `I` (ex: `IConnector`, `IRuntimeProvider`) | OBRIGATORIO |
| R08 | Toda interface publica deve ser imutavel — sem metodos de mutacao interna expostos | OBRIGATORIO |
| R09 | Toda interface deve documentar sua SRP em comentario JSDoc | RECOMENDADO |
| R10 | Zero `any` em interfaces publicas — usar tipos estritos | OBRIGATORIO |

### 6.3 Regras de Extensao

| # | Regra | Nivel |
|---|---|---|
| R11 | **Toda nova funcionalidade deve ser implementada como extensao** — nunca modificando codigo existente certificado | OBRIGATORIO |
| R12 | Novos conectores: implementar `IConnector`, registrar via `ConnectorRegistry.register()` — nenhuma outra mudanca | OBRIGATORIO |
| R13 | Novos providers de runtime: implementar `IRuntimeProvider`, registrar via `RuntimeRegistry.register()` | OBRIGATORIO |
| R14 | Novos providers de memoria: implementar `IMemoryProvider`, registrar via `MemoryProviderRegistry` | OBRIGATORIO |
| R15 | Novos estagios do pipeline: implementar `IPipelineStage`, registrar via `PipelineBuilder` | OBRIGATORIO |

### 6.4 Regras de Qualidade

| # | Regra | Nivel |
|---|---|---|
| R16 | Toda mudanca deve manter 100% das suites de certificacao passando | OBRIGATORIO |
| R17 | Nenhum deploy sem ArchitectureValidation score = 100 | OBRIGATORIO |
| R18 | Toda decisao arquitetural deve ser registrada como ADR | OBRIGATORIO |
| R19 | Nenhum componente de producao sem suite de testes comportamentais | OBRIGATORIO |
| R20 | Testes devem ser **comportamentais** — zero `toString()`, `includes()`, ou `reflection` em verificacoes de contrato | OBRIGATORIO |

### 6.5 Regras de Telemetria e Auditoria

| # | Regra | Nivel |
|---|---|---|
| R21 | Toda acao cognitiva deve produzir um registro auditavel com: origem, confianca, timestamp | OBRIGATORIO |
| R22 | Telemetria e separada de logica de negocio — SRP obrigatorio | OBRIGATORIO |
| R23 | Metricas de runtime vivem exclusivamente em `RuntimeTelemetry` | OBRIGATORIO |
| R24 | Toda resposta da UCME deve incluir: `providerId`, `confidence`, `justification`, `timestamp` | OBRIGATORIO |

---

## 7. Principios SOLID

### 7.1 Single Responsibility Principle (SRP)

**"Cada componente tem exatamente uma razao para mudar."**

| Componente | Unica Responsabilidade |
|---|---|
| `RuntimeRegistry` | Armazenar e selecionar providers |
| `RuntimeResolver` | Resolver o provider ativo (delega metricas) |
| `RuntimeTelemetry` | Colecionar e expor metricas de resolucao |
| `RuntimeScore` | Calcular score de um provider |
| `RuntimeReason` | Explicar a selecao de um provider |
| `RuntimeSelector` | Selecionar o melhor provider de uma lista |
| `ArchitectureValidation` | Validar conformidade SOLID |
| `EnvironmentCapability` | Representar capacidades de ambiente (pura) |
| `OfficialLibraryCatalog` | Manter catalogo de documentos |
| `GraphBuilder` | Construir grafo de conhecimento |
| `GraphStorage` | Armazenar grafo |
| `GraphQuery` | Consultar grafo |

**Violacao tipica:**
```typescript
// ERRADO — RuntimeResolver acumulando metricas
class RuntimeResolver {
  private _cacheHits = 0; // VIOLACAO SRP — mover para RuntimeTelemetry
  private _avgMs     = 0; // VIOLACAO SRP — mover para RuntimeTelemetry
}

// CORRETO — delegacao
class RuntimeResolver {
  getActive() {
    const t0 = Date.now();
    const provider = this._store.getActive();
    RuntimeTelemetry.recordResolution(Date.now() - t0, !wasCold); // delegado
    return provider;
  }
}
```

### 7.2 Open/Closed Principle (OCP)

**"Aberto para extensao, fechado para modificacao."**

A Runtime Layer e o exemplo canonico deste principio no MemoryOS:

```
Para adicionar um novo conector (ex: WhatsApp):
  1. Criar: WhatsAppRuntimeProvider implements IRuntimeProvider
  2. Registrar: RuntimeRegistry.register(new WhatsAppRuntimeProvider())
  3. Nenhuma outra mudanca necessaria.

Para adicionar um novo connector (ex: Notion):
  1. Criar: NotionConnector implements IConnector
  2. Registrar: ConnectorRegistry.register(new NotionConnector())
  3. Nenhuma outra mudanca necessaria.
```

**Componentes fechados para modificacao:**
- `RuntimeRegistry` (FROZEN)
- `RuntimeResolver` (FROZEN)
- `OfficialLibraryBootstrap` (FROZEN)
- `ConversationPipeline` core stages
- `UCMEEngine` core fusion logic

### 7.3 Liskov Substitution Principle (LSP)

**"Qualquer implementacao de uma interface deve ser substituivel sem quebrar o contrato."**

| Interface | Implementacoes Substituiveis |
|---|---|
| `IRuntimeProvider` | `ViteRuntimeProvider`, `NodeRuntimeProvider`, `Base44RuntimeProvider`, futuras |
| `IConnector` | `GmailConnector`, `DriveConnector`, `GitHubConnector`, futuras |
| `IMemoryProvider` | `ConversationMemoryProvider`, `GoogleDriveMemoryProvider`, `OfficialLibraryProvider`, futuras |
| `IDocumentDiscovery` | `ViteDocumentDiscovery`, `NodeDocumentDiscovery`, `Base44DocumentDiscovery`, futuras |
| `ILoaderProvider` | `LoaderProvider`, qualquer implementacao customizada |

**Verificacao LSP:**
```typescript
// Todo IRuntimeProvider deve satisfazer:
function verifyLSP(provider: IRuntimeProvider): void {
  console.assert(typeof provider.runtimeId === "string");
  console.assert(typeof provider.isAvailable === "boolean");
  console.assert(typeof provider.discovery === "function");
  console.assert(typeof provider.loader === "function");
  // Qualquer provider real pode substituir qualquer outro
}
```

### 7.4 Interface Segregation Principle (ISP)

**"Nenhum componente deve depender de metodos que nao usa."**

Exemplo de segregacao na Runtime Layer:

```typescript
// ERRADO — interface monolitica
interface IRuntimeAll {
  register();   // apenas o Registry usa
  getActive();  // Resolver e Provider usam
  score();      // apenas Score usa
  explain();    // apenas Reason usa
  cacheHits();  // apenas Telemetry usa
}

// CORRETO — interfaces segregadas
interface IRuntimeStore    { register(); list(); getActive(); ... }
interface IRuntimeResolver { getActive(); refresh(); explain(); }
interface ILoaderProvider  { getLoader(); loaderId; loaderName; }
// Cada consumidor depende apenas do que usa
```

Interfaces segregadas no sistema:
- `IRuntimeStore` — apenas operacoes de armazenamento
- `IRuntimeResolver` — apenas resolucao e diagnostico
- `ILoaderProvider` — apenas acesso a loader
- `IMemoryProvider` — apenas busca de evidencias
- `IConnector` — apenas execucao de capacidades
- `IPipelineStage` — apenas execucao de estagio

### 7.5 Dependency Inversion Principle (DIP)

**"Dependa de abstracoes, nunca de concrecoes."**

Hierarquia de dependencias no MemoryOS:

```
Alto nivel: OfficialLibraryBootstrap
  Depende de: IRuntimeResolver (abstrato)
    Implementado por: RuntimeResolver (concreto — invisivel ao Bootstrap)

Medio nivel: RuntimeResolver
  Depende de: IRuntimeStore (abstrato)
    Implementado por: RuntimeRegistry (concreto — invisivel ao Resolver)

Baixo nivel: RuntimeRegistry (implements IRuntimeStore)
  Depende de: IRuntimeProvider (abstrato)
    Implementado por: Vite/Node/Base44 (concretos)
```

**Injecao de dependencia nos providers:**
```typescript
// Providers recebem ILoaderProvider via construtor
class ViteRuntimeProvider implements IRuntimeProvider {
  constructor(private readonly lp: ILoaderProvider = LoaderProvider) {}
  loader(): ILoaderProvider { return this.lp; } // substituivel via DI
}
```

---

## 8. Imutabilidade

### 8.1 Politica de Imutabilidade

O MemoryOS aplica imutabilidade em tres niveis:

```
Nivel 1: Interfaces readonly
  - Propriedades de contratos sao sempre readonly
  - Nenhuma interface expoe setters

Nivel 2: Value Objects e DTOs
  - Resultados de operacoes sao Object.freeze()
  - Snapshots de telemetria sao imutaveis

Nivel 3: Configuracao e Registry
  - Providers registrados nao sao mutateis apos registro
  - IDs e nomes sao readonly
```

### 8.2 readonly em TypeScript

Toda propriedade de interface publica e declarada como `readonly`:

```typescript
interface IRuntimeProvider {
  readonly runtimeId:   string;   // nunca mutavel
  readonly runtimeName: string;   // nunca mutavel
  readonly priority:    number;   // nunca mutavel
  readonly isAvailable: boolean;  // estado declarado, nao mutavel externamente
  readonly reason:      string;   // descricao imutavel
  readonly environment: string;   // ambiente declarado
}
```

### 8.3 Object.freeze() em Value Objects

Resultados de operacoes sao sempre congelados:

```typescript
// BootstrapResult — imutavel apos criacao
this._result = Object.freeze({
  success: true,
  documentCount: metas.length,
  // ... todos os campos
});

// RuntimeTelemetry snapshot — imutavel
snapshot(): RuntimeTelemetrySnapshot {
  return Object.freeze({
    cacheHits:       this._cacheHits,
    cacheMisses:     this._cacheMisses,
    // ... todos os campos
    snapshotAt:      new Date().toISOString(),
  });
}

// ArchValidationReport — imutavel
return Object.freeze({
  rules:      Object.freeze(rules),
  score,
  certified:  score === 100,
  validatedAt: new Date().toISOString(),
});
```

### 8.4 Value Objects

| Value Object | Campos | Politica |
|---|---|---|
| `RuntimeScoreResult` | `runtimeId`, `totalScore`, `confidence` | `Object.freeze()` |
| `RuntimeReasonResult` | `runtimeId`, `selected`, `reasons`, `summary` | `Object.freeze()` |
| `BootstrapResult` | `success`, `documentCount`, `durationMs` | `Object.freeze()` |
| `RuntimeTelemetrySnapshot` | todos os campos de telemetria | `Object.freeze()` |
| `ArchValidationReport` | `rules`, `score`, `certified` | `Object.freeze()` |
| `ArchRule` | `id`, `principle`, `description`, `passed` | `Object.freeze()` |
| `OfficialChunk` | todos os campos de chunk | `Object.freeze()` |

### 8.5 Immutable DTOs

Toda transferencia de dados entre camadas usa DTOs imutaveis:

```typescript
// Correto — DTO imutavel
type EvidenceDTO = Readonly<{
  id:           string;
  content:      string;
  confidence:   number;
  authority:    string;
  timestamp:    string;
  providerId:   string;
  justification: string;
}>;

// Errado — DTO mutavel
type EvidenceDTO = {
  id:         string;
  confidence: number; // pode ser modificado por qualquer camada
};
```

### 8.6 Singletons HMR-Safe

Singletons sao implementados via `globalThis` para sobreviver ao Hot Module Replacement:

```typescript
const G = globalThis as typeof globalThis & { __SINGLETON__?: MyClass };
if (!G.__SINGLETON__) G.__SINGLETON__ = new MyClass();
export const MySingleton: MyClass = G.__SINGLETON__;
```

Esta tecnica garante que:
- O singleton nunca e reinstanciado em reloads de desenvolvimento
- O estado e preservado durante o ciclo de vida da aplicacao
- A referencia exportada e sempre a mesma instancia

---

## 9. Certificacao

### 9.1 Status da Certificacao

```
+=========================================================+
|          MEMORYOS ARCHITECTURE CERTIFICATION            |
+=========================================================+
|                                                         |
|  Architecture Version:    1.0.0                         |
|  Certification Date:      2026-07-18                    |
|  Architecture Status:     OFFICIALLY FROZEN             |
|  Engineering First:       COMPLETE                      |
|  Beta Approval:           APPROVED                      |
|                                                         |
+=========================================================+
```

### 9.2 Sprints Certificadas

| Sprint | Descricao | Status |
|---|---|---|
| Sprint 1 | Working Memory Engine | CERTIFIED |
| Beta 01-03 | Cognitive Engine baseline | CERTIFIED |
| Phase 5.x | Memory pipeline foundations | CERTIFIED |
| Phase 6.x | Cognitive pipeline, connectors | CERTIFIED |
| Phase 7.0 | Google Workspace Foundation | CERTIFIED |
| Phase 7.1.0 | Memory Reasoning Engine (MRE) | CERTIFIED |
| Sprint 8.1.1 | Conversation platform | CERTIFIED |
| Sprint 8.1.2 | Production pipeline | CERTIFIED |
| Sprint EF-6.3.x | Foundation Compliance Engine | CERTIFIED |
| Sprint EF-6.4.x | Architecture Baseline Engine | CERTIFIED |
| Sprint EF-6.5.0 | Capability Registry | CERTIFIED |
| Sprint EF-6.6.x | Connector Runtime Foundation | CERTIFIED |
| Sprint EF-6.7.0 | Engineering Regression Shield | CERTIFIED |
| Sprint EF-7.0 | Google Workspace Suite | CERTIFIED |
| Sprint EF-7.1.x | Gmail Production Certification | CERTIFIED |
| Sprint C-0.x | Connector Runtime v2 | CERTIFIED |
| Sprint P-0.x | Production Connector Standard | CERTIFIED |
| Sprint EF-7.2.0-3 | Official Library Foundation | CERTIFIED |
| Sprint EF-7.2.4 | Runtime Abstraction (IRuntimeProvider) | CERTIFIED |
| Sprint EF-7.2.5 | Runtime Hardening | CERTIFIED |
| Sprint EF-7.2.6 | Runtime Final Freeze | CERTIFIED |
| **Sprint EF-7.2.7** | **Runtime Layer Certification** | **CERTIFIED** |

### 9.3 Suite de Testes Certificadas

| Suite Range | Cobertura | Status |
|---|---|---|
| Suites 1–11 | Parser, Chunker, Indexer, Authority, Provider, UCME, Graph | PASS |
| Suites 12–19 | Catalog, Loader, Strategy, Comparator, Bootstrap, Watcher, Graph | PASS |
| Suites 20–28 | IDocumentDiscovery, Discovery implementations, Factory, Runtime | PASS |
| Suites 29–42 | Runtime EF-7.2.0–7.2.3 (Provider, Registry, Score, Reason, Selector) | PASS |
| Suites 43–58 | EF-7.2.4 Runtime Abstraction | PASS |
| Suites 59–72 | EF-7.2.5 Runtime Hardening | PASS |
| Suites 73–86 | EF-7.2.6 Runtime Final Freeze | PASS |
| **Suites 87–96** | **EF-7.2.7 Runtime Layer Certification** | **PASS** |
| **Total** | **96 suites — 100% PASS** | **CERTIFIED** |

### 9.4 Architecture Validation Score

```
ArchitectureValidation.validate()
+--------------------------------------------------+
| DIP (Dependency Inversion)    4/4   100%  PASS   |
| SRP (Single Responsibility)   4/4   100%  PASS   |
| ISP (Interface Segregation)   3/3   100%  PASS   |
| OCP (Open/Closed)             2/2   100%  PASS   |
| Immutability                  3/3   100%  PASS   |
| Encapsulation                 3/3   100%  PASS   |
+--------------------------------------------------+
| ARCHITECTURE SCORE:          19/19  100%  CERTIFIED |
+--------------------------------------------------+
```

### 9.5 Assinatura da Certificacao

```
CERTIFIED BY:   MemoryOS Engineering System
APPROVED FOR:   Beta Phase
ARCHITECTURE:   v1.0.0 — FROZEN
DATE:           2026-07-18T00:00:00.000Z
HASH:           MEMORYOS-ARCH-BASELINE-V1.0-20260718
NEXT REVIEW:    On any architectural change (triggers new version)
```

---

## 10. Roadmap Beta

### 10.1 Principio da Evolucao Beta

**Toda evolucao na fase Beta ocorre exclusivamente pela Connector Layer.**

A arquitetura esta congelada. Nenhuma camada interna sera modificada para suportar novos servicos. Todo novo servico externo e integrado implementando `IConnector` e registrando-o no `ConnectorRegistry`.

```
Beta Evolution Pattern:
  1. Definir capabilities (lista de acoes que o conector executa)
  2. Criar XxxConnector implements IConnector
  3. Criar XxxCapabilityExecutor
  4. Registrar: ConnectorRegistry.register(new XxxConnector())
  5. Registrar capacidades: CapabilityRegistry.register(...)
  6. Zero mudancas nas camadas acima
```

### 10.2 Conectores Planejados para Beta

| Conector | Tipo | Prioridade | Capacidades Principais |
|---|---|---|---|
| **Base44** | Platform | P0 | Entities CRUD, Functions, Auth, Storage |
| **Gmail** | Google Workspace | P0 | Read, Send, Search, Labels, Threads |
| **Google Drive** | Google Workspace | P0 | List, Read, Download, Upload, Search |
| **Google Calendar** | Google Workspace | P1 | Events, Availability, Create, Update |
| **GitHub** | Development | P1 | Repos, Issues, PRs, Commits, Search |
| **WhatsApp Business** | Messaging | P2 | Send, Receive, Templates, Media |
| **Google Docs** | Google Workspace | P2 | Read, Write, Comments |
| **Google Sheets** | Google Workspace | P2 | Read, Write, Formulas |
| **OneDrive** | Microsoft | P3 | List, Read, Download, Upload |
| **SharePoint** | Microsoft | P3 | Sites, Lists, Documents |
| **Slack** | Messaging | P3 | Messages, Channels, Users, Files |
| **Discord** | Messaging | P4 | Messages, Channels, Servers |
| **Notion** | Productivity | P4 | Pages, Databases, Blocks |
| **Dropbox** | Storage | P4 | Files, Folders, Share |
| **Airtable** | Database | P4 | Tables, Records, Views |

### 10.3 Criterios de Certificacao Beta de Conectores

Todo conector Beta deve satisfazer:

| Criterio | Descricao |
|---|---|
| **IConnector** | Implementacao completa da interface |
| **Health Check** | `health()` retorna `ConnectorHealth` valido |
| **Circuit Breaker** | Tolerancia a falhas implementada |
| **Rate Limiting** | Respeito aos limites do servico externo |
| **Audit Trail** | Toda execucao registrada com timestamp e resultado |
| **Test Suite** | Suite comportamental com coverage de todas as capacidades |
| **Error Handling** | Erros mapeados para `ConnectorError` padrao |
| **Retry Policy** | Politica de retry com backoff exponencial |

### 10.4 Expansao da Runtime Layer para Beta

A Runtime Layer suporta novos ambientes de execucao sem modificacao:

```typescript
// Para adicionar suporte a Cloudflare Workers (exemplo):
class CloudflareRuntimeProvider implements IRuntimeProvider {
  runtimeId   = "cloudflare-v1";
  runtimeName = "Cloudflare Workers Runtime";
  priority    = 80;
  environment = RuntimeEnvironment.CLOUDFLARE;
  get isAvailable() { return typeof caches !== "undefined" && !!globalThis.Request; }
  // ...
}

// Registro:
RuntimeRegistry.register(new CloudflareRuntimeProvider());
// Nenhuma outra mudanca necessaria.
```

### 10.5 Governanca Continua na Beta

Durante toda a fase Beta:

1. **ArchitectureValidation** executado em cada deploy — score deve ser 100
2. **EngineeringRegressionSuite** executado em cada PR — zero regressoes
3. **ABV (Architectural Boundary Validator)** monitora violacoes de fronteiras
4. **ABE (Architecture Baseline Engine)** compara contra este documento (v1.0)
5. Qualquer mudanca arquitetural gera nova versao deste documento (v1.1, v2.0, etc.)

---

## Apendice A: Glossario

| Termo | Definicao |
|---|---|
| **UCME** | Unified Cognitive Memory Engine — fonte central de toda consulta de memoria |
| **MRE** | Memory Reasoning Engine — motor de raciocinio sobre evidencias |
| **WME** | Working Memory Engine — memoria de trabalho de curto prazo |
| **ABV** | Architectural Boundary Validator — valida que camadas nao se acoplam incorretamente |
| **ABE** | Architecture Baseline Engine — compara arquitetura atual contra baseline frozen |
| **ACL** | Architecture Certification Layer — suite de certificacao arquitetural |
| **FCE** | Foundation Compliance Engine — conformidade com principios fundadores |
| **UCR** | Universal Connector Runtime — pipeline de execucao de conectores |
| **Official Library** | Conjunto de documentos MD que forma a fonte de verdade cognitiva do sistema |
| **DIP** | Dependency Inversion Principle — dependa de abstracoes, nunca de concrecoes |
| **SRP** | Single Responsibility Principle — cada componente tem uma unica razao para mudar |
| **Engineering First** | Fase de desenvolvimento onde arquitetura e certificacao tem prioridade absoluta |
| **FROZEN** | Estado de um componente certificado que nao pode ser modificado sem novo ADR |
| **Connector** | Integracao com servico externo via contrato IConnector — unico vetor de evolucao na Beta |

---

## Apendice B: Historico de Versoes

| Versao | Data | Autor | Descricao |
|---|---|---|---|
| 1.0.0 | 2026-07-18 | MemoryOS Engineering | Baseline inicial — Engineering First complete, Beta approved |

---

*Este documento e a Single Source of Truth arquitetural do MemoryOS.*  
*Qualquer mudanca neste documento deve ser acompanhada de um ADR e incremento de versao.*  
*Versao 1.0.0 — FROZEN — 2026-07-18*