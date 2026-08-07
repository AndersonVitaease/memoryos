# MCS — MemoryOS Core Specification
## Core Architecture Boundaries & Responsibilities

**Versão:** 1.0  
**Status:** Documento Oficial da Arquitetura — Aprovado  
**Data:** 2026-07-10  
**Tipo:** Especificação do Core  
**Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MDS Architectural Principles

---

## Declaração

Este documento define oficialmente **o que pertence ao Core permanente do MemoryOS**.

| Documento | Define |
|---|---|
| **MV** | A visão estratégica |
| **MPS** | O que o produto representa |
| **MAS** | Como o sistema é construído |
| **MDS** | Como implementá-lo |
| **MRS** | Como os componentes trabalham em runtime |
| **MCS** | Quais responsabilidades pertencem ao Core permanente |

**Objetivo:** Preservar a estabilidade, reutilização e escalabilidade do MemoryOS durante muitos anos.

**Não altera:** Roadmap · Arquitetura · Runtime  
**Estabelece:** Limites claros entre o Core e os demais componentes.

---

# CAPÍTULO 1 — O QUE É O CORE

## Definição Oficial

O **Core** representa a parte **permanente e genérica** do MemoryOS.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE                                           │
│                                                                             │
│  O conjunto de componentes que permanecem estáveis independentemente de:   │
│    • qual mercado é atendido                                                │
│    • qual Connector está conectado                                          │
│    • qual Provider está sendo utilizado                                     │
│    • qual domínio de negócio está ativo                                     │
│                                                                             │
│  Todo mercado utiliza EXATAMENTE o mesmo Core.                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Regras Fundamentais do Core

| Regra | Descrição |
|---|---|
| **Genérico** | Nunca contém regras específicas de negócio |
| **Permanente** | Raramente alterado — apenas quando beneficia todos os domínios |
| **Universal** | Turismo, Saúde, Governo, E-commerce — mesmo Core |
| **Estável** | Mudanças passam por ADR + revisão técnica obrigatória |
| **Interface-First** | Core conhece apenas Interfaces, nunca implementações |

---

# CAPÍTULO 2 — RESPONSABILIDADES DO CORE

## Componentes Oficiais do Core

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE COMPONENTS                                     │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Componente                   │ Responsabilidade                             │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Context Management           │ Gerenciar o contexto ativo de cada sessão    │
│ Working Memory Engine        │ Memória temporária da sessão (MDS v1.6)      │
│ Long-Term Memory Engine      │ Persistência de conhecimento relevante       │
│ Knowledge Graph Engine       │ Grafo semântico de conhecimento (MDS v1.5)   │
│ Goal Detection Engine        │ Identificar objetivos do usuário             │
│ Planner Engine               │ Criar planos de execução em steps            │
│ Execution Engine             │ Executar planos aprovados (Sprint 17)        │
│ Universal Event Bus          │ Comunicação desacoplada entre motores        │
│ Governance Engine            │ Permissões, retenção e compliance            │
│ Security Gate                │ Auth → Permission → Risk → SecIntel          │
│ Identity Context Manager     │ Gerenciar múltiplos contextos por usuário    │
│ Session Manager              │ Criar, recuperar e encerrar sessões          │
│ Learning Engine              │ Aprender com execuções e feedback (MDS v1.4) │
│ Cognitive Orchestrator       │ Coordenar raciocínio e pipeline cognitivo    │
│ Audit Trail Engine           │ Registro imutável de toda ação               │
│ Capability Negotiation Eng.  │ Selecionar e ranquear capabilities (MDS v1.2)│
│ Ontology Engine              │ Classificação semântica por domínio          │
│ Consolidation Engine         │ Consolidar memória temporária em permanente  │
│ Journey Manager              │ Ciclo de vida completo de Jornadas           │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

## Descrição Detalhada

### Context Management
Mantém o contexto ativo de cada sessão, incluindo Working Memory, Identity Context e estado da Jornada atual. É o ponto central de acesso ao estado do sistema.

### Working Memory Engine (MDS v1.6)
Memória temporária com TTL por tipo. Armazena o estado da sessão corrente, outputs dos steps e entidades detectadas. Flush automático para Short-Term ao expirar.

### Long-Term Memory Engine (MDS v1.6)
Persiste conhecimento relevante além da sessão. Deduplicação por fingerprint + userId. Recuperação via 13 RetrievalModes semânticos, temporais e contextuais.

### Knowledge Graph Engine (MDS v1.5)
Grafo semântico central. Nós tipados (CONCEPT, ENTITY, FACT, RULE, etc.), 36 RelationshipTypes, traversal BFS/DFS/Semantic, busca híbrida com RRF k=60.

### Goal Detection Engine
Identifica o objetivo do usuário a partir de linguagem natural, contexto histórico e Jornadas ativas. Nunca cria planos — apenas detecta e classifica objetivos.

### Planner Engine
Cria planos de execução com steps, dependências, prioridades e capabilities necessárias. Nunca executa — apenas planeja.

### Execution Engine (Sprint 17)
Executa planos aprovados de forma segura, auditável e desacoplada. Coordena Connectors via Interface. Nunca conhece APIs específicas. Suporta rollback, retry e execução paralela.

### Universal Event Bus
Comunicação assíncrona e desacoplada entre todos os motores. Publishers e subscribers independentes. Priority Scheduler, DLQ e retry com backoff exponencial.

### Governance Engine
Permissões (RBAC), visibilidade de dados, compliance (LGPD/GDPR), retenção e auditoria. `deleteUserKnowledge()` para direito ao esquecimento.

### Security Gate
Sequência obrigatória: Permission Engine → Approval Engine → Risk Engine → Security Intelligence. Executa antes de cada Step. Nunca ignorado.

### Identity Context Manager
Gerencia múltiplos contextos por usuário (PF, PJ, Projeto, etc.) com memória, permissões e auditoria isoladas por contexto.

### Session Manager
Cria, recupera e encerra sessões. Context Switching auditado. Jornadas preservadas entre sessões.

### Learning Engine (MDS v1.4)
Extrai padrões de execuções concluídas. Valida com confidence mínima. Consolida em Long-Term Memory. Nunca consolida aprendizado sem validação.

### Cognitive Orchestrator
Coordena o pipeline cognitivo: raciocínio, decisão, planejamento e execução. Não toma decisões — apenas orquestra o fluxo cognitivo.

### Audit Trail Engine
Registro imutável de toda ação. `buildAuditEntry()` chamado em todo estado de Step. Correlação completa: `userId → sessionId → journeyId → executionId → stepId`.

### Capability Negotiation Engine (MDS v1.2/1.3)
Seleciona, ranqueia e negocia capabilities disponíveis. Scoring multidimensional. Intelligence Layer com simulação, predição e recomendação.

### Ontology Engine (MDS v1.5)
Classifica nós do Knowledge Graph por domínio. AliasMap, SynonymMap e CanonicalNameMap. Evolução versionada de ontologias.

### Consolidation Engine
Consolida memória de curto prazo em longo prazo. Detecta padrões e elimina duplicatas. Compressão automática de conhecimento antigo.

### Journey Manager
Ciclo de vida completo de Jornadas: criação, pausa, retomada, bloqueio, conclusão e arquivamento. Persistência entre sessões sem perda de contexto.

---

# CAPÍTULO 3 — O QUE NÃO FAZ PARTE DO CORE

## Componentes que devem permanecer fora do Core

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FORA DO CORE — PROIBIDO                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CONNECTORS                PROVIDERS              SPECIALISTS              │
│  ─────────────             ─────────              ──────────               │
│  Gmail Connector           Wooba Adapter          Medical Specialist        │
│  GitHub Connector          Sabre Adapter          Legal Specialist          │
│  WhatsApp Connector        Shopify Adapter        Financial Specialist      │
│  Slack Connector           Gov.br Adapter         Tax Specialist            │
│  Notion Connector          Receita Federal        Tourism Specialist        │
│  HubSpot Connector         INSS Adapter           Pharma Specialist         │
│  Salesforce Connector      Detran Adapter         HR Specialist             │
│  Stripe Connector          INPI Adapter           Logistics Specialist      │
│                            Siscomex Adapter       Education Specialist      │
│                                                                             │
│  REGRAS DE NEGÓCIO         APIs EXTERNAS          DOMÍNIOS ESPECÍFICOS     │
│  ─────────────────         ─────────────          ────────────────────     │
│  Cálculo de imposto        OpenAI API             Turismo                  │
│  Regras de INSS            Anthropic API          Saúde                    │
│  Fórmulas financeiras      Base44 API             Financeiro               │
│  Protocolos médicos        Google API             Governo                  │
│  Regulamentos fiscais      AWS Services           E-commerce               │
│  Normas jurídicas          Stripe API             Logística                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Regra de ouro

> Se a funcionalidade só faz sentido para **um** mercado ou **um** sistema específico, ela não pertence ao Core.

---

# CAPÍTULO 4 — BOUNDARIES

## Diagrama de Camadas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          CORE                                       │   │
│  │                                                                     │   │
│  │  Context · Memory · Knowledge · Goal · Planner · Execution         │   │
│  │  EventBus · Security · Governance · Learning · Audit · Journey     │   │
│  │                                                                     │   │
│  │  ← GENÉRICO · PERMANENTE · UNIVERSAL →                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │ Interfaces apenas                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CORE FRAMEWORKS                                 │   │
│  │                                                                     │   │
│  │   MCF (Connector Framework) · MCIS (Connector Intelligence)        │   │
│  │   MGIS (Goal Intelligence) · MDS Engines                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  CONNECTOR FRAMEWORK                                │   │
│  │                                                                     │   │
│  │   ConnectorSDK · ConnectorRegistry · ConnectorSimulator            │   │
│  │   CapabilityNegotiation · ConnectorInterface                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      CONNECTORS                                     │   │
│  │                                                                     │   │
│  │   GmailConnector · GithubConnector · WhatsAppConnector             │   │
│  │   GovBrConnector · ShopifyConnector · StripeConnector · ...        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PROVIDER ADAPTERS                                │   │
│  │                                                                     │   │
│  │   WoobaAdapter · SabreAdapter · ReceitaFederalAdapter               │   │
│  │   OpenAIAdapter · AnthropicAdapter · ...                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SISTEMAS EXTERNOS                                 │   │
│  │                                                                     │   │
│  │   APIs · Databases · Serviços Governamentais · Plataformas         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Dependências Permitidas

```
✓  Core → IConnector (interface)
✓  Core → ISpecialist (interface)
✓  Core → IMemoryProvider (interface)
✓  Core → IEventPublisher (interface)
✓  Core → IPermissionProvider (interface)
✓  Connector → Core (para publicar eventos e acessar contexto)
✓  Specialist → Core (para consultar Knowledge Graph e Memory)
✓  Provider Adapter → Connector (implementação concreta)
```

## Dependências Proibidas

```
✗  Core → Connector (implementação concreta)
✗  Core → Provider Adapter
✗  Core → API externa (direta)
✗  Core → Regra de negócio específica
✗  Connector → outro Connector (direto)
✗  Specialist → outro Specialist (direto — usar Federation Engine)
```

---

# CAPÍTULO 5 — DEPENDENCY RULES

## Regra de Dependência Unidirecional

```
Todas as dependências apontam para DENTRO (em direção ao Core).
Jamais para FORA.

Sistema Externo
      ↑
Provider Adapter
      ↑
Connector
      ↑
Connector Framework
      ↑
CORE  ←────── conhece apenas Interfaces
```

## Regras Formais

| Regra | Descrição |
|---|---|
| **R1** | O Core nunca importa módulos de Connectors |
| **R2** | O Core nunca importa módulos de Provider Adapters |
| **R3** | O Core nunca referencia APIs externas (OpenAI, Stripe, etc.) |
| **R4** | O Core nunca contém lógica de negócio de domínio específico |
| **R5** | O Core comunica-se com o mundo externo exclusivamente via Interfaces |
| **R6** | Connectors implementam Interfaces do Core — nunca o contrário |
| **R7** | Specialists fornecem conhecimento ao Core — o Core não os chama diretamente |
| **R8** | O Event Bus é o único canal de comunicação entre motores |

## Verificação de Conformidade

```bash
# Toda PR que toca o Core deve passar nesta verificação:
# Nenhum import direto de Connector, Provider ou API externa

grep -r "import.*Connector" packages/core/     # deve retornar vazio
grep -r "import.*Adapter"   packages/core/     # deve retornar vazio
grep -r "fetch("            packages/core/     # deve retornar vazio
grep -r "axios."            packages/core/     # deve retornar vazio
```

---

# CAPÍTULO 6 — INTERFACES OFICIAIS DO CORE

## Catálogo de Interfaces

```typescript
// ── Connector Interface ───────────────────────────────────────────────────

interface IConnector {
  connectorId:  string;
  capabilityId: string;
  execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult>;
  rollback?(executionRef: unknown, ctx: ExecutionContext): Promise<RollbackResult>;
  validate(input: unknown): ValidationResult;
  getMetadata(): ConnectorMetadata;
}

// ── Provider Adapter Interface ────────────────────────────────────────────

interface IProviderAdapter {
  providerId:   string;
  capabilityId: string;
  execute(genericInput: unknown, ctx: ExecutionContext): Promise<ProviderResult>;
  rollback?(executionRef: unknown, ctx: ExecutionContext): Promise<RollbackResult>;
  healthCheck(): Promise<HealthResult>;
  getMetadata(): ProviderMetadata;
}

// ── Specialist Interface ──────────────────────────────────────────────────

interface ISpecialist {
  specialistId: string;
  domain:       string;
  capabilities: string[];
  process(request: SpecialistRequest): Promise<SpecialistResponse>;
  getMetadata(): SpecialistMetadata;
}

// ── Memory Provider Interface ─────────────────────────────────────────────

interface IMemoryProvider {
  store(record: MemoryRecord): Promise<void>;
  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>;
  delete(memoryId: string): Promise<void>;
  getStats(): MemoryStats;
}

// ── Knowledge Provider Interface ─────────────────────────────────────────

interface IKnowledgeProvider {
  getNode(nodeId: string): Promise<KnowledgeNode | null>;
  search(query: SearchQuery): Promise<SearchResult>;
  createNode(data: Partial<KnowledgeNode>): Promise<KnowledgeNode>;
  link(from: string, to: string, rel: KnowledgeRelationship): Promise<void>;
}

// ── Event Publisher Interface ─────────────────────────────────────────────

interface IEventPublisher {
  publish(event: UniversalEvent): Promise<void>;
  publishBatch(events: UniversalEvent[]): Promise<void>;
}

// ── Event Subscriber Interface ────────────────────────────────────────────

interface IEventSubscriber {
  subscribe(eventType: string, handler: EventHandler): UnsubscribeFn;
  subscribePattern(pattern: string, handler: EventHandler): UnsubscribeFn;
}

// ── Execution Provider Interface ──────────────────────────────────────────

interface IExecutionProvider {
  execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionRecord>;
  getStatus(executionId: string): Promise<ExecutionStatus>;
  cancel(executionId: string): Promise<void>;
}

// ── Planner Interface ─────────────────────────────────────────────────────

interface IPlanner {
  plan(goal: GoalRecord, ctx: PlanningContext): Promise<ExecutionPlan>;
  validate(plan: ExecutionPlan): ValidationResult;
  describe(plan: ExecutionPlan): string;
}

// ── Permission Provider Interface ────────────────────────────────────────

interface IPermissionProvider {
  check(userId: string, action: string, resource: string): Promise<boolean>;
  grant(userId: string, action: string, resource: string): Promise<void>;
  revoke(userId: string, action: string, resource: string): Promise<void>;
}

// ── Governance Provider Interface ────────────────────────────────────────

interface IGovernanceProvider {
  audit(entry: AuditEntry): Promise<void>;
  getAuditTrail(executionId: string): Promise<AuditEntry[]>;
  applyRetention(policy: RetentionPolicy): Promise<void>;
  deleteUserData(userId: string): Promise<DeletionResult>;
}

// ── Learning Provider Interface ───────────────────────────────────────────

interface ILearningProvider {
  extract(execution: ExecutionRecord): Promise<LearningCandidate[]>;
  validate(candidate: LearningCandidate): Promise<ValidationResult>;
  consolidate(candidate: LearningCandidate): Promise<KnowledgeNode>;
}

// ── Identity Context Interface ────────────────────────────────────────────

interface IIdentityContextProvider {
  getActive(sessionId: string): Promise<IdentityContext>;
  switchContext(sessionId: string, contextId: string): Promise<void>;
  listContexts(userId: string): Promise<IdentityContext[]>;
}
```

---

# CAPÍTULO 7 — EXTENSION MODEL

## Como adicionar novas funcionalidades

```
Nova funcionalidade identificada
          ↓
  ┌──────────────────────────────────────────────────────────────────┐
  │  DECISÃO DE EXTENSÃO                                             │
  │                                                                  │
  │  Pode ser implementada como Connector?   → SIM → Connector      │
  │  Pode ser implementada como Specialist?  → SIM → Specialist      │
  │  Pode ser implementada como Policy?      → SIM → Policy          │
  │  Pode ser implementada como Provider?    → SIM → Provider Adapter│
  │  Beneficia TODOS os mercados?            → SIM → Core (com ADR)  │
  │  Beneficia apenas um mercado?            → NÃO → Nunca no Core   │
  └──────────────────────────────────────────────────────────────────┘
```

## Tipos de Extensão

| Tipo | Quando usar | Exemplo |
|---|---|---|
| **Connector** | Integração com sistema externo | GmailConnector, StripeConnector |
| **Specialist** | Conhecimento de domínio específico | MedicalSpecialist, TaxSpecialist |
| **Policy** | Regra de negócio configurável | ApprovalPolicy, RetentionPolicy |
| **Provider Adapter** | Tradução de comando genérico → API específica | WoobaAdapter, SabreAdapter |
| **Configuration** | Comportamento variável por contexto | Timeouts, thresholds, languages |
| **Knowledge Package** | Conhecimento pré-carregado por domínio | MedicalOntology, LegalTerminology |

## Regra

> Nunca modifique o Core para atender a um novo mercado.  
> Crie um Connector, Specialist ou Provider Adapter.

---

# CAPÍTULO 8 — CORE EVOLUTION

## Quando o Core pode evoluir

O Core **somente** evolui quando a mudança:

| Critério | Descrição |
|---|---|
| ✓ **Universal** | Beneficia todos os domínios e mercados |
| ✓ **Reduz complexidade** | Simplifica a arquitetura existente |
| ✓ **Melhora desempenho** | Ganho mensurável de latência ou throughput |
| ✓ **Aumenta segurança** | Endurece o modelo de segurança global |
| ✓ **Aumenta escalabilidade** | Permite crescimento horizontal sem limitações |
| ✓ **Resolve lacuna estrutural** | Preenche ausência de interface ou contrato |

## Quando o Core **não** pode evoluir

| Situação | Alternativa |
|---|---|
| Atender apenas Turismo | Criar TourismSpecialist / TourismConnector |
| Integrar com API específica | Criar Provider Adapter |
| Implementar regra fiscal | Criar TaxPolicy + TaxSpecialist |
| Adicionar lógica médica | Criar MedicalSpecialist |
| Conectar com Gov.br | Criar GovBrConnector |

---

# CAPÍTULO 9 — STABILITY POLICY

## Política Oficial de Estabilidade

```
CORE STABILITY POLICY — MCS v1.0
═══════════════════════════════════════════════════════════════════════════════

OBJETIVO:
  O Core deve sofrer o menor número possível de alterações.
  Novas funcionalidades devem ser implementadas fora do Core.

FREQUÊNCIA ESPERADA DE ALTERAÇÕES:
  Interfaces públicas    → raramente (< 2 vezes por ano)
  Contratos de dados     → raramente (< 2 vezes por ano)
  Comportamentos internos → ocasionalmente (com ADR)
  Bugfixes               → conforme necessário (sem ADR se não muda interface)

PROIBIDO SEM ADR:
  • Adicionar novo componente ao Core
  • Remover componente existente
  • Alterar Interface pública
  • Alterar contrato de dados (schema)
  • Alterar comportamento observável

PERMITIDO SEM ADR:
  • Bugfixes que não alteram interface
  • Otimizações internas sem mudança de contrato
  • Melhoria de logs e observabilidade
  • Atualização de dependências internas (sem breaking change)
```

---

# CAPÍTULO 10 — BACKWARD COMPATIBILITY

## Regras de Compatibilidade

| Regra | Descrição |
|---|---|
| **R1: Additive only** | Novas versões apenas adicionam — nunca removem campos obrigatórios |
| **R2: Deprecation first** | Campo removido deve ser deprecated por ≥ 1 versão antes da remoção |
| **R3: Semantic versioning** | MAJOR: breaking change · MINOR: nova feature · PATCH: bugfix |
| **R4: Migration plan** | Toda breaking change exige plano de migração documentado |
| **R5: Compatibility window** | Versão anterior suportada por ≥ 90 dias após release de breaking change |

## Fluxo de Breaking Change

```
Breaking change identificada
          ↓
ADR criado e aprovado
          ↓
Versão N: campo deprecated (warning em logs)
          ↓
Versão N+1: campo ainda presente (compatibilidade)
          ↓
Documentação de migração publicada
          ↓
Janela de migração (≥ 90 dias)
          ↓
Versão N+2: campo removido
```

---

# CAPÍTULO 11 — CORE GOVERNANCE

## Processo Obrigatório para Alterações

```
Proposta de alteração no Core
          ↓
Revisão de Arquitetura
  ├── Beneficia todos os domínios? → NÃO → Rejeitado
  └── SIM → Continua
          ↓
ADR (Architecture Decision Record) criado
  Campos obrigatórios:
    • Contexto do problema
    • Alternativas consideradas
    • Decisão tomada
    • Justificativa
    • Consequências esperadas
    • Riscos identificados
          ↓
Revisão Técnica (peer review obrigatório)
          ↓
Validação (testes determinísticos)
          ↓
Implementação
          ↓
Testes de regressão (100% de cobertura das interfaces)
          ↓
Documentação atualizada (MCS + MDS + MRS)
          ↓
Deploy
```

## Responsabilidades

| Papel | Responsabilidade |
|---|---|
| **Arquiteto** | Aprovar ADR e validar conformidade com MCS |
| **Engenheiro** | Implementar respeitando os contratos |
| **Revisor** | Validar que nenhuma dependência proibida foi criada |
| **QA** | Garantir que testes cobrem todas as interfaces alteradas |

---

# CAPÍTULO 12 — DESIGN PRINCIPLES

## Princípios obrigatórios do Core

| Princípio | Descrição |
|---|---|
| **Baixo Acoplamento** | Motores comunicam-se apenas via Event Bus e Interfaces |
| **Alta Coesão** | Cada componente tem responsabilidade única e bem definida |
| **SOLID** | SRP, OCP, LSP, ISP, DIP em todos os componentes |
| **Clean Architecture** | Dependências apontam para dentro (para o Core) |
| **Event Driven** | Nenhum motor chama outro diretamente |
| **Interface First** | Toda integração começa por uma Interface, não por implementação |
| **Context First** | Working Memory carregada antes de qualquer execução |
| **Security First** | Security Gate executado antes de cada Step |
| **Memory First** | Long-Term Memory consultada antes de repetir informações |
| **Journey First** | Toda sessão vinculada a uma Jornada ativa |

## Aplicação prática

```typescript
// ✓ CORRETO — Core depende de Interface
class ExecutionEngine {
  constructor(private readonly connector: IConnector) {}
}

// ✗ ERRADO — Core depende de implementação concreta
class ExecutionEngine {
  constructor(private readonly connector: GmailConnector) {}
}

// ✓ CORRETO — Comunicação via Event Bus
eventBus.publish("execution.completed", { executionId });

// ✗ ERRADO — Chamada direta entre motores
learningEngine.process(executionResult);
```

---

# CAPÍTULO 13 — CHECKLIST DE CONFORMIDADE

## Obrigatório em toda Sprint

```
CHECKLIST — MCS v1.0 — OBRIGATÓRIO ANTES DE TODA PR QUE TOQUE O CORE
═══════════════════════════════════════════════════════════════════════════════

CLASSIFICAÇÃO
  [ ] Esta funcionalidade pertence realmente ao Core?
  [ ] Ela beneficia TODOS os mercados sem exceção?
  [ ] Poderia ser implementada como Connector?
  [ ] Poderia ser implementada como Specialist?
  [ ] Poderia ser implementada como Policy?
  [ ] Poderia ser implementada como Provider Adapter?
  [ ] Poderia ser implementada como Configuration?

DEPENDÊNCIAS
  [ ] O Core importa algum Connector, Provider ou API externa? (deve ser NÃO)
  [ ] Toda dependência externa usa Interface? (deve ser SIM)
  [ ] Nenhum motor chama outro motor diretamente? (deve ser SIM)
  [ ] Comunicação entre motores ocorre exclusivamente via Event Bus? (deve ser SIM)

CONTRATOS
  [ ] Interface pública foi alterada? → ADR obrigatório
  [ ] Contrato de dados foi alterado? → ADR + migration plan
  [ ] Breaking change existe? → Deprecation + janela de migração

GOVERNANÇA
  [ ] ADR foi criado e aprovado?
  [ ] Revisão técnica foi realizada?
  [ ] Testes determinísticos cobrem as interfaces alteradas?
  [ ] Documentação (MCS / MDS / MRS) foi atualizada?

ESTABILIDADE
  [ ] A mudança aumenta a reutilização? (deve ser SIM)
  [ ] A mudança aumenta a escalabilidade? (deve ser SIM)
  [ ] A mudança beneficia todos os mercados? (deve ser SIM)

SE QUALQUER RESPOSTA INDICAR DESVIO → REVISAR ANTES DE IMPLEMENTAR.
```

---

# CAPÍTULO 14 — CORE PRINCIPLES

## Os 10 Atributos Permanentes do Core

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE ATTRIBUTES                                     │
├──────────────────┬──────────────────────────────────────────────────────────┤
│ PEQUENO          │ Mínimo de componentes — sem inchaço                      │
│ GENÉRICO         │ Nenhuma regra de domínio específico                      │
│ ESTÁVEL          │ Raramente alterado — ADR obrigatório                     │
│ MODULAR          │ Componentes independentes e substituíveis                │
│ INDEPENDENTE     │ Sem dependências externas diretas                        │
│ TESTÁVEL         │ 100% das interfaces cobertas por testes determinísticos  │
│ AUDITÁVEL        │ Toda ação registrada no AuditTrail imutável              │
│ SEGURO           │ Security Gate antes de toda execução                     │
│ ESCALÁVEL        │ Stateless → escalabilidade horizontal                    │
│ EVOLUTIVO        │ Cresce sem quebrar compatibilidade                       │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

---

# CAPÍTULO 15 — DECLARAÇÃO FINAL

O **Core do MemoryOS** representa o núcleo permanente da plataforma.

```
O Core:
  ✓ é genérico
  ✓ é universal
  ✓ é estável
  ✓ é reutilizável para qualquer mercado
  ✓ conhece apenas Interfaces

O Core NUNCA:
  ✗ contém regras de Turismo, Saúde, Governo, E-commerce ou qualquer domínio específico
  ✗ depende de Connectors ou Provider Adapters concretos
  ✗ acessa APIs externas diretamente
  ✗ é modificado para atender apenas um mercado
```

**Toda especialização ocorre exclusivamente através de:**

| Mecanismo | Propósito |
|---|---|
| **Contexto** | Personalização por identidade e domínio |
| **Connectors** | Integração com sistemas externos |
| **Specialists** | Conhecimento especializado por domínio |
| **Policies** | Regras de negócio configuráveis |
| **Provider Adapters** | Tradução de comandos genéricos para específicos |
| **Knowledge** | Base de conhecimento especializada por domínio |
| **Configuration** | Comportamento variável por contexto |

O Core permanece **reutilizável para qualquer mercado**, preservando estabilidade, simplicidade e compatibilidade durante toda a vida útil da plataforma.

---

## Mapa de Documentos Oficiais

```
MV   → Visão estratégica
MPS  → O que o produto representa
MAS  → Como é construído
MDS  → Como implementar (v1.0 → v1.6 + Arch. Principles)
MRS  → Como funciona em runtime
MCS  → O que é o Core e seus limites  ← este documento
```

---

**MCS — MemoryOS Core Specification v1.0**  
**Data:** 2026-07-10 · **Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MDS Arch. Principles