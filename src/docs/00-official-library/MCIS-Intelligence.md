# MCIS-Intelligence — Seleção, Contratos, Aprendizado e Integrações

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 3 de 4 do MCIS

---

## 1. Input Contracts

O Input Contract define formalmente o que um Connector aceita como entrada para cada ação.

### 1.1 Estrutura do Input Contract

```typescript
interface InputContract {
  actionId: string;
  
  // Schema JSON formal (validação automática)
  schema: JSONSchema;
  
  // Campos obrigatórios
  required: string[];
  
  // Exemplos canônicos
  examples: InputExample[];
  
  // Mapeamento semântico de campos
  semanticMapping: FieldSemanticMapping[];
  // Ex: campo "to" → ontologia "EMAIL_ADDRESS" ou "PERSON_IDENTIFIER"
  
  // Transformações aceitas automaticamente
  autoTransformations: AutoTransformation[];
  // Ex: PERSON_NAME → busca email na memória → EMAIL_ADDRESS
  
  // Validações específicas do domínio
  domainValidations: DomainValidation[];
}

interface FieldSemanticMapping {
  fieldName: string;
  ontologyType: string;           // Ex: "EMAIL_ADDRESS", "DATETIME", "CURRENCY_BRL"
  description: string;
  examples: string[];
  transformableFrom: string[];    // Outros tipos ontológicos que podem ser convertidos
}
```

### 1.2 Auto-Mapping de Entidades

O Auto-Mapping permite ao Core converter automaticamente entidades de um Connector para outro:

```
Exemplo: Core quer "enviar e-mail para João"

Core tem na memória:
  { name: "João", phone: "+55 11 9999-9999", email: "joao@empresa.com" }

GmailConnector.SEND_EMAIL requer:
  InputContract.to: EMAIL_ADDRESS

Auto-Mapping:
  PERSON_ENTITY → extrair campo email → EMAIL_ADDRESS → "joao@empresa.com"
  
Resultado: Core não precisa saber que GmailConnector precisa de email.
           O Auto-Mapping resolve automaticamente.
```

---

## 2. Output Contracts

```typescript
interface OutputContract {
  actionId: string;
  
  // Schema da resposta normalizada
  schema: JSONSchema;
  
  // Mapeamento semântico da saída
  semanticMapping: FieldSemanticMapping[];
  
  // O que este output pode alimentar (para composição de workflows)
  feedsInto: FeedDefinition[];
  // Ex: SEARCH_EMAILS output → pode alimentar READ_EMAIL input
  
  // Propostas de memória que este output gera
  memoryProposals: MemoryProposalTemplate[];
  
  // Dados que nunca devem aparecer na resposta normalizada
  strippedFields: string[];
  // Ex: internal_token, raw_auth_header
}
```

---

## 3. Seleção Inteligente de Connectors

O Connector Manager utiliza o MCIS para selecionar automaticamente o Connector mais adequado para cada tarefa.

### 3.1 Critérios de Seleção

```typescript
interface ConnectorSelectionEngine {
  select(
    goal: SelectionGoal,
    context: SelectionContext,
    constraints: SelectionConstraints
  ): SelectionResult;
}

interface SelectionGoal {
  requiredCapability: string;       // Capability semântica requerida
  semanticVerb: SemanticVerb;
  semanticObject: string;
  naturalLanguageGoal: string;      // Para matching semântico adicional
}

interface SelectionContext {
  userId: string;
  sessionId: string;
  
  // Histórico de uso (Camada de Aprendizado)
  preferredConnectors: string[];
  successHistory: ConnectorSuccessRecord[];
  
  // Contexto atual
  projectId?: string;
  activeConnectors: string[];       // Já autenticados nesta sessão
  
  // Preferências do usuário
  userPreferences: UserConnectorPreferences;
}

interface SelectionConstraints {
  // Critérios de seleção ordenados por prioridade
  costWeight: number;           // 0.0 a 1.0 — prioridade de custo
  performanceWeight: number;    // 0.0 a 1.0 — prioridade de velocidade
  availabilityWeight: number;   // 0.0 a 1.0 — prioridade de disponibilidade
  securityWeight: number;       // 0.0 a 1.0 — prioridade de segurança
  preferenceWeight: number;     // 0.0 a 1.0 — prioridade de preferência do usuário
  
  maxLatencyMs?: number;
  maxCost?: number;
  requiredPermissions?: string[];
  excludeConnectors?: string[];
}
```

### 3.2 Seleção Baseada em Custo

```typescript
interface CostModel {
  // Custo computacional (latência estimada em ms)
  computationalCostMs: number;
  
  // Custo de créditos MemoryOS
  creditCost: number;
  
  // Custo de quota (impacto no rate limit)
  quotaImpact: number;            // 0.0 = sem impacto, 1.0 = alta utilização
  
  // Custo financeiro real (para Connectors pagos)
  financialCost?: {
    amount: number;
    currency: string;
    per: "REQUEST" | "MONTH" | "YEAR";
  };
}
```

### 3.3 Seleção Baseada em Desempenho

```typescript
interface PerformanceModel {
  // Métricas dos últimos 7 dias
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  uptimePercent: number;
  errorRatePercent: number;
  
  // Velocidade de resposta do sistema externo
  externalSystemP50Ms: number;
  
  // Suporte a execução em lote
  supportsBatch: boolean;
  batchMaxSize?: number;
  
  // Suporte a streaming
  supportsStreaming: boolean;
}
```

### 3.4 Seleção Baseada em Disponibilidade

```typescript
interface AvailabilityModel {
  currentStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  consecutiveErrors: number;
  circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN";
  lastHealthCheckAt: string;
  scheduledMaintenanceWindow?: MaintenanceWindow;
  
  // Cobertura geográfica
  availableRegions: string[];
  
  // SLA do sistema externo
  externalSLA: {
    uptimePercent: number;
    supportedHours: string;       // Ex: "24/7" ou "9-18 BRT"
  };
}
```

### 3.5 Seleção Baseada em Segurança

```typescript
interface SecurityModel {
  certificationLevel: "CERTIFIED" | "PARTNER" | "COMMUNITY";
  sandboxed: boolean;
  signatureValid: boolean;
  lastSecurityAuditAt?: string;
  
  // Compliance
  lgpdCompliant: boolean;
  gdprCompliant: boolean;
  soc2Certified: boolean;
  pciDssCompliant: boolean;       // Para Connectors financeiros
  
  // Dados processados
  processesPII: boolean;
  processesFinancialData: boolean;
  dataResidency: string;          // "BR", "EU", "US"
}
```

### 3.6 Seleção Baseada em Contexto e Histórico

```
Algoritmo de Seleção por Pontuação:

score(connector) = 
  (1/costMs × costWeight) +
  (uptimePercent × availabilityWeight) +
  (1/p95Latency × performanceWeight) +
  (securityScore × securityWeight) +
  (userPreferenceScore × preferenceWeight)

Onde userPreferenceScore considera:
  - Connector já autenticado nesta sessão: +0.3
  - Connector mais usado pelo usuário historicamente: +0.2
  - Connector com menor taxa de erro para este usuário: +0.2
  - Connector preferido explicitamente: +0.5

Resultado final:
  Ranqueamento dos Connectors candidatos por score
  Seleção do top-1 (ou top-N para redundância)
```

---

## 4. Aprendizado sobre Utilização

### 4.1 Estrutura de Aprendizado

```typescript
interface ConnectorUsageLearning {
  // Registrado a cada execução
  recordUsage(record: UsageRecord): void;
  
  // Análise de padrões
  analyzePatterns(userId: string): UsagePattern[];
  
  // Sugestões automáticas
  suggestWorkflows(userId: string): WorkflowSuggestion[];
  suggestConnectors(userId: string): ConnectorSuggestion[];
  
  // Feedback
  recordOutcome(requestId: string, outcome: ExecutionOutcome): void;
}

interface UsageRecord {
  timestamp: string;
  userId: string;
  connectorId: string;
  action: string;
  success: boolean;
  latencyMs: number;
  goalContext: string;            // Contexto semântico da intenção original
  workflowId?: string;
  wasAutoSelected: boolean;       // Selecionado pelo MCIS automaticamente?
  userOverrode: boolean;          // Usuário substituiu a seleção automática?
}
```

### 4.2 Descoberta de Padrões

```
Exemplos de padrões detectados automaticamente:

PADRÃO 1 — Sequência recorrente:
  Toda segunda-feira o usuário:
    1. Consulta pedidos Shopify
    2. Gera NF-e no Bling
    3. Envia NF-e por Gmail
  
  → MCIS sugere: "Criar workflow automático para toda segunda-feira"

PADRÃO 2 — Connector substituível:
  Quando GmailConnector está lento (>3s),
  o usuário frequentemente escolhe OutlookConnector
  
  → MCIS aprende: usar Outlook como fallback automático quando Gmail > 3s

PADRÃO 3 — Combinação frequente:
  ShopifyConnector + MercadoLivreConnector são sempre usados juntos
  
  → MCIS sugere: "Sincronização automática entre Shopify e Mercado Livre"
```

### 4.3 Estatísticas de Uso

```typescript
interface ConnectorUsageStatistics {
  connectorId: string;
  period: StatisticsPeriod;
  
  // Volume
  totalCalls: number;
  uniqueUsers: number;
  callsPerAction: Record<string, number>;
  
  // Qualidade
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  
  // Seleção
  autoSelectedCount: number;       // Vezes selecionado pelo MCIS
  manualSelectedCount: number;     // Vezes selecionado pelo usuário
  overrideRate: number;            // % das vezes que usuário substituiu
  
  // Composição
  mostComposedWith: ConnectorCompositionStat[];
  workflowParticipation: number;   // % das chamadas dentro de workflows
  
  // Tendências
  growthRate: number;              // % crescimento vs período anterior
  trendDirection: "UP" | "STABLE" | "DOWN";
}
```

---

## 5. Sugestão Automática de Workflows

```typescript
interface WorkflowSuggestion {
  suggestionId: string;
  confidence: number;             // 0.0 a 1.0
  
  // Descrição em linguagem natural
  title: string;                  // Ex: "Automatizar NF-e semanal"
  description: string;
  
  // Workflow sugerido
  workflow: ConnectorWorkflowDescriptor;
  
  // Por que foi sugerido
  rationale: string;
  basedOn: SuggestionBasis;
  // Ex: { type: "USAGE_PATTERN", frequency: 12, lastOccurrence: "..." }
  
  // Como ativar
  activationInstructions: string;
  
  // Economia estimada
  estimatedTimeSavedMinutes: number;
  estimatedCallsAutomated: number;
}
```

---

## 6. Sugestão Automática de Novos Connectors

```typescript
interface ConnectorSuggestion {
  suggestionId: string;
  
  // O que o usuário está tentando fazer que não consegue
  unmetCapability: string;
  // Ex: "Integrar com sistema de ERP legado da empresa"
  
  // Connectors sugeridos do marketplace
  suggestedConnectors: MarketplaceSuggestion[];
  
  // Capacidade de desenvolvimento próprio
  developmentTemplate?: ConnectorTemplateSuggestion;
  
  // Prioridade
  priority: "HIGH" | "MEDIUM" | "LOW";
  
  // Frequência com que este gap foi detectado
  gapFrequency: number;
}
```

---

## 7. Integrações com Módulos do MemoryOS

### 7.1 Integração com Agentes Permanentes

```
Agentes Permanentes são entidades autônomas que operam proativamente.
O MCIS permite que Agentes descubram e componham Connectors dinamicamente.

Fluxo:
  Agente ativo → goal: "monitorar e-mails críticos e responder automaticamente"
       │
       ▼
  MCIS.discover(goal) → retorna: GmailConnector(READ_EMAIL) + 
                                  GmailConnector(SEND_EMAIL)
       │
       ▼
  Agente compõe workflow com CapabilityGraph
       │
       ▼
  Executa sem intervenção humana

REGRA: O Agente nunca conhece "Gmail".
       Ele conhece "capacidade de ler e enviar mensagens".
       O MCIS resolve qual Connector satisfaz esta capacidade.
```

### 7.2 Integração com Specialists

```
Specialist de Viagem precisa verificar disponibilidade de voos:
  
  Specialist → MCIS.findByOntologyDomain("TRAVEL.GDS")
             → retorna: [SabreConnector, AmadeusConnector, GalileoConnector]
             → cada um com: capabilities, cost, performance, availability
  
  Specialist informa ao Core:
    "Capacidades de busca de voos disponíveis: 3 Connectors"
    "Recomendação: Amadeus (melhor cobertura para rotas Sul-Americanas)"
  
  Core → Planner → Execution Planner → AmadeusConnector.SEARCH_FLIGHTS()
  
  Specialist NUNCA chama o Connector diretamente.
  Ele fornece conhecimento. O pipeline decide e executa.
```

### 7.3 Integração com o Planner

```typescript
// O Planner usa o MCIS para enriquecer o plano com informações de Connectors
interface PlannerMCISIntegration {
  // Verificar se um goal pode ser resolvido com Connectors disponíveis
  canResolve(goal: string): CapabilityResolvabilityResult;
  
  // Obter o melhor conjunto de Connectors para um plano
  planConnectors(
    plan: ExecutionPlan
  ): ConnectorAssignment[];
  
  // Estimar custo e tempo do plano
  estimatePlan(plan: ExecutionPlan): PlanEstimate;
  
  // Detectar dependências e ordenar steps
  orderSteps(
    steps: PlanStep[]
  ): OrderedPlanStep[];
}
```

### 7.4 Integração com o Execution Planner

```
Execution Planner usa MCIS para:

1. RESOLVER CAPACIDADES → CONNECTORS
   "SEND_EMAIL" → GmailConnector (ou OutlookConnector como fallback)

2. DETECTAR PARALELISMO
   CapabilityGraph.canRunInParallel(step1, step2)
   → Executar ShopifyConnector + BlingConnector simultaneamente

3. RESOLVER MAPEAMENTO DE DADOS
   step1.output → auto-mapping → step2.input
   (via OutputContract.feedsInto + InputContract.autoTransformations)

4. SELECIONAR FALLBACKS
   GmailConnector FAILED →
   CapabilityGraph.findAlternatives("SEND_EMAIL") →
   OutlookConnector → fallback automático

5. CALCULAR TIMEOUT POR STEP
   step.timeout = ConnectorCapabilityDescriptor.estimatedCostMs × 3
```

### 7.5 Integração com o Policy Engine

```
Policy Engine usa MCIS para verificar:

1. Permissões declaradas vs. permissões concedidas
   ConnectorPermissionDescriptor.required ⊆ user.grantedPermissions

2. Constraints ativas
   ConstraintRegistry.evaluate(capabilityId, context)
   → "Este Connector só pode ser usado em horário comercial"

3. Compliance
   SecurityModel.lgpdCompliant required para dados de PII
   SecurityModel.pciDssCompliant required para dados financeiros

4. Orçamento de créditos
   CostModel.creditCost × estimatedCalls ≤ user.remainingCredits
```

### 7.6 Integração com o Memory Engine

```
Memory Engine usa MCIS para:

1. ENRIQUECER CONTEXTO ANTES DA EXECUÇÃO
   MemoryRequirements.readsFromMemory → buscar na memória → injetar no request

2. PROCESSAR PROPOSTAS APÓS EXECUÇÃO
   OutputContract.memoryProposals → Memory Engine decide aceitar ou rejeitar
   
3. CONTROLE DE RETENÇÃO
   MemoryRequirements.retentionPolicy → configurar TTL automaticamente

Exemplo — GmailConnector:
  Antes: Memory Engine injeta email do João (de memórias anteriores)
  Depois: Memory Engine recebe proposta "João respondeu sobre a reunião"
          e decide salvar como FACT com confidence 0.9
```

### 7.7 Integração com o Event Bus (UEB)

```typescript
// Todo Connector com Intelligence integra ao UEB automaticamente
// via EventRegistry declarations

interface MCISEventBusIntegration {
  // Publicar eventos conforme EventRegistry
  publishEvent(eventType: string, payload: unknown): void;
  
  // Escutar eventos que podem disparar capabilities
  subscribeToTriggers(): void;
  
  // Registrar handlers conforme consumedEvents
  registerConsumedEvents(): void;
}

// Exemplo: ShopifyConnector declara que consome:
//   "BLING.INVOICE_CREATED" → para sincronizar status de pedido
// Isso é declarado no EventRegistry e wired automaticamente pelo MCIS
```

### 7.8 Integração com Marketplace

```
MCIS fornece ao Marketplace:
  - SelfDescription completo (metadados de descoberta)
  - UsageStatistics (popularidade, confiabilidade)
  - CompatibilityMatrix (com quais outros Connectors compõe bem)
  - WorkflowRegistry (workflows prontos disponíveis)
  - NaturalLanguageDescription (para busca por texto)

Marketplace usa MCIS para:
  - Busca semântica: "preciso de Connector para emitir notas fiscais"
    → findByNaturalQuery() → BlingConnector, ContaAzulConnector, ...
  - Recomendação: "usuários que usam ShopifyConnector também usam..."
  - Verificação de compatibilidade automática ao instalar
```

### 7.9 Integração com Enterprise Governance

```typescript
interface EnterpriseGovernanceIntegration {
  // Auditoria centralizada de uso de Connectors
  auditConnectorUsage(
    organizationId: string,
    period: Period
  ): EnterpriseAuditReport;
  
  // Políticas corporativas sobre Connectors
  enforcePolicy(
    policy: EnterpriseConnectorPolicy
  ): PolicyEnforcementResult;
  // Ex: "Apenas Connectors CERTIFIED podem ser usados nesta organização"
  
  // Controle de Connectors por departamento
  setDepartmentPermissions(
    departmentId: string,
    allowedConnectors: string[]
  ): void;
  
  // Relatório de conformidade
  getComplianceReport(
    organizationId: string
  ): ComplianceReport;
}
```

---

## 8. Escalabilidade para Milhões de Connectors

### 8.1 Arquitetura Distribuída dos Registries

```
Para escalar a bilhões de capacidades:

CapabilityRegistry (distribuído):
  ├── Particionamento por OntologyDomain
  │   ├── Shard COMMUNICATION (Gmail, Slack, WhatsApp...)
  │   ├── Shard COMMERCE (Shopify, ML, Bling...)
  │   ├── Shard BLOCKCHAIN (Phantom, LayerZero, Chainlink...)
  │   └── Shard ENTERPRISE (TOTVS, SAP...)
  │
  ├── Indexação:
  │   ├── Índice por semanticVerb (O(1) lookup)
  │   ├── Índice por ontologyDomain (O(1) lookup)
  │   ├── Índice por keyword (full-text search)
  │   └── Índice por connectorId (O(1) lookup)
  │
  └── Cache de seleção:
      └── LRU cache dos top-1000 goals mais frequentes

CapabilityGraph (distribuído):
  ├── Particionamento por componente conectado
  ├── Cache de paths mais comuns
  └── Índice de equivalência para O(1) lookup de alternatives
```

### 8.2 Targets de Escalabilidade

```
┌──────────────────────────────────────────────────────────────┐
│              TARGETS DE ESCALABILIDADE MCIS                  │
├─────────────────────┬────────────────────────────────────────┤
│ Métrica             │ Target                                 │
├─────────────────────┼────────────────────────────────────────┤
│ Connectors          │ 100.000+ simultâneos                   │
│ Capabilities        │ 1.000.000.000 registradas              │
│ Registry lookup     │ < 1ms (O(1) via índice)                │
│ Semantic search     │ < 10ms para top-10 resultados          │
│ Capability Graph    │ < 5ms para encontrar path              │
│ Auto Registration   │ < 100ms Hot Plug completo              │
│ Version Negotiation │ < 10ms                                 │
│ Dependency Resolve  │ < 50ms para grafos complexos           │
│ Selection Score     │ < 5ms por Connector candidato          │
│ Usuários            │ 1.000.000.000 simultâneos              │
└─────────────────────┴────────────────────────────────────────┘
```

---

## 9. Compatibilidade Futura

```
GARANTIAS DE BACKWARD COMPATIBILITY DO MCIS:

1. SelfDescription é aditivo:
   Novos campos = sempre opcionais
   Campos existentes = nunca removidos ou renomeados

2. Registries são extensíveis:
   Novos tipos de Registry = adicionados sem impacto nos existentes
   Novas arestas no Capability Graph = backward compatible

3. Ontologia é hierárquica:
   Novos domínios/subdomínios = adicionados sem modificar a raiz
   Reclassificações = via aliasing (antigo → novo, ambos válidos)

4. Contratos de I/O são versionados:
   InputContract v1.1 é superset do v1.0
   Nunca remover campos obrigatórios sem major version

5. Algoritmo de seleção é plugável:
   SelectionEngine é uma interface
   Novas estratégias podem ser adicionadas sem alterar o contrato
   
6. MCIS vs. MCF:
   MCF define o executor (como fazer)
   MCIS define a inteligência (o que pode ser feito)
   Os dois evoluem independentemente
   Um Connector pode suportar MCF sem MCIS (degraded mode)
   Um Connector com MCIS é sempre backward compatible com MCF
```

---

**Documento Oficial:** MCIS-Intelligence  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 3 de 4 do MCIS