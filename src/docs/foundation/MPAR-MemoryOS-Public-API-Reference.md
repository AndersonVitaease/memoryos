# MPAR — MemoryOS Public API Reference
## Official Public API Documentation

**Version:** 1.0  
**Status:** Official Reference  
**Foundation:** v1.0.0  
**Date:** 2026-07-10  

> **Nota:** Este documento documenta COMO utilizar as APIs públicas.  
> Para arquitetura, consulte MAS. Para runtime, consulte MRS. Para core boundaries, consulte MCS.  
> Para SDK spec, consulte MDPS. Para qualidade, consulte MQCCS. Para engineering, consulte MDH.

---

## Capítulo 1 — Filosofia da API

A API pública do MemoryOS segue os seguintes princípios imutáveis:

| Princípio | Descrição |
|---|---|
| **Pequena** | Exponha o mínimo necessário. Menos superfície = menos quebras. |
| **Consistente** | Nomes, padrões de retorno e tratamento de erro são uniformes. |
| **Previsível** | Dado o mesmo input, o mesmo output sempre. |
| **Tipada** | Todo parâmetro e retorno tem tipo explícito em TypeScript. |
| **Estável** | APIs públicas não quebram em versões MINOR. |
| **Versionada** | Toda interface carrega `version: string`. |
| **Retrocompatível** | Novos campos são opcionais; campos removidos têm grace period ≥ 6 meses. |
| **Auditável** | Toda chamada de mutação é registrada no AuditTrail. |

### Garantia de Estabilidade

Toda interface documentada neste documento é **API pública estável** do MemoryOS.

Mudanças somente ocorrem via: RFC → ADR → Implementação → MQCCS → Release  
(Ver MPEGS Capítulo 3 para o processo completo)

---

## Capítulo 2 — Core API

### WorkingMemoryEngine

**Responsabilidade:** Memória de trabalho de sessão. Armazena dados temporários com TTL e isolamento por identityContext.  
**Ciclo de vida:** Instanciado uma vez por Runtime; persiste entre requests da mesma sessão.

```typescript
interface IWorkingMemoryEngine {
  // Armazena um item na memória de trabalho
  store(item: WorkingMemoryItem): Promise<void>;

  // Recupera item por chave e contexto
  get(key: string, identityContext: string): WorkingMemoryRecord | null;

  // Remove item explicitamente
  remove(key: string, identityContext: string): void;

  // Retorna todos os itens de um contexto
  getByContext(identityContext: string): WorkingMemoryRecord[];

  // Promove para memória de longo prazo
  promote(key: string, identityContext: string): Promise<void>;
}

interface WorkingMemoryItem {
  key:             string;        // Identificador único no contexto
  value:           unknown;       // Qualquer valor serializável
  ttl?:            number;        // TTL em ms (default por tipo)
  identityContext: string;        // Isolamento por identidade
  priority?:       MemoryPriority;// "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
}

interface WorkingMemoryRecord extends WorkingMemoryItem {
  storedAt:  number;   // timestamp ms
  expiresAt: number;   // timestamp ms
  accessCount: number;
}

type MemoryPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
```

**TTL Defaults por Priority:**
- CRITICAL: sem TTL
- HIGH: 4 horas
- NORMAL: 1 hora
- LOW: 15 minutos

**Eventos publicados:**
- `memory.item.stored` — ao armazenar
- `memory.item.expired` — ao expirar
- `memory.item.promoted` — ao promover

---

### ExecutionEngine

**Responsabilidade:** Executa sequências de steps (PlanStep[]) com rollback, segurança e auditoria.  
**Ciclo de vida:** Stateless por execução; cada `execute()` cria um ExecutionContext isolado.

```typescript
interface IExecutionEngine {
  // Registra connector disponível para execução
  registerConnector(connector: IConnector): void;

  // Executa plano completo
  execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionResult>;

  // Lista connectors registrados
  listConnectors(): ConnectorMetadata[];
}

interface ExecutionPlan {
  planId:      string;
  sessionId:   string;
  userId:      string;
  journeyId?:  string;
  steps:       PlanStep[];
  timeout?:    number;    // ms total para o plano
}

interface PlanStep {
  stepId:       string;
  connectorId:  string;
  input:        unknown;
  required:     boolean;    // se false, falha não para o plano
  isReversible: boolean;    // se true, rollback será chamado em caso de falha
  parallel?:    boolean;    // executa em paralelo com próximo step
  timeout?:     number;     // ms para este step
  retryCount?:  number;     // tentativas (default 0)
}

interface ExecutionResult {
  executionId:  string;
  planId:       string;
  status:       "success" | "partial" | "failed" | "rolled_back";
  stepResults:  StepResult[];
  startedAt:    number;
  completedAt:  number;
  auditLog:     string[];
}

interface StepResult {
  stepId:      string;
  connectorId: string;
  status:      "success" | "failed" | "skipped" | "rolled_back";
  output?:     unknown;
  error?:      string;
  duration:    number;    // ms
  attempts:    number;
}

interface ExecutionContext {
  executionId:  string;
  sessionId:    string;
  userId:       string;
  journeyId?:   string;
  stepId?:      string;
  timeoutMs:    number;
  metadata?:    Record<string, unknown>;
}
```

**Eventos publicados:**
- `execution.started`
- `execution.step.completed`
- `execution.step.failed`
- `execution.completed`
- `execution.rolled_back`

---

### JourneyManager

**Responsabilidade:** Gerencia o ciclo de vida de Journeys — unidade primária de experiência do usuário.  
**Referência:** MRS Capítulo 4, ADR-005.

```typescript
interface IJourneyManager {
  create(input: CreateJourneyInput): Promise<Journey>;
  get(journeyId: string): Journey | null;
  list(userId: string): Journey[];
  pause(journeyId: string, reason?: string): Promise<void>;
  resume(journeyId: string): Promise<void>;
  complete(journeyId: string, summary?: string): Promise<void>;
  archive(journeyId: string): Promise<void>;
  addEvent(journeyId: string, event: JourneyEventInput): Promise<void>;
}

interface Journey {
  journeyId:   string;
  userId:      string;
  title:       string;
  status:      JourneyStatus;
  context:     JourneyContext;
  events:      JourneyEvent[];   // append-only
  createdAt:   number;
  updatedAt:   number;
  completedAt?: number;
}

type JourneyStatus = "draft" | "active" | "paused" | "blocked" | "completed" | "archived";

interface JourneyContext {
  identityContext: string;
  data:            Record<string, unknown>;  // contexto acumulado
  sessionIds:      string[];                  // sessões que contribuíram
}

interface JourneyEvent {
  eventId:     string;
  type:        string;            // ex: "status.changed", "step.completed"
  payload:     unknown;
  timestamp:   number;
  immutable:   true;             // nunca modificável
}
```

---

### EventBus

**Responsabilidade:** Comunicação assíncrona entre engines via eventos tipados com prioridade.  
**Referência:** ADR-004, RFC-004.

```typescript
interface IEventBus {
  publish(event: BusEvent): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): Subscription;
  unsubscribe(subscription: Subscription): void;
  getHistory(filter?: EventFilter): BusEvent[];
  getDLQ(): BusEvent[];             // Dead Letter Queue
  replayDLQ(): Promise<void>;
}

interface BusEvent {
  eventId:      string;             // UUID único (idempotência)
  type:         string;             // "domínio.entidade.ação"
  sourceEngine: string;
  priority:     EventPriority;
  payload:      unknown;
  timestamp:    number;
  sessionId?:   string;
}

type EventPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

type EventHandler = (event: BusEvent) => void | Promise<void>;

interface Subscription {
  subscriptionId: string;
  pattern:        string;           // suporta wildcards: "execution.*"
  createdAt:      number;
}

interface EventFilter {
  type?:        string;
  sourceEngine?: string;
  since?:       number;             // timestamp ms
  until?:       number;
}
```

**Wildcards suportados:**
- `execution.*` — todos os eventos de execution
- `*.completed` — todos os eventos do tipo completed
- `*` — todos os eventos

---

### AuditTrail

**Responsabilidade:** Registro imutável de todas as ações do sistema.  
**Referência:** ADR-006.

```typescript
interface IAuditTrail {
  record(entry: AuditInput): Promise<AuditRecord>;
  query(filter: AuditFilter): AuditRecord[];
  export(filter: AuditFilter, format: "json" | "csv"): string;
}

interface AuditInput {
  action:      string;           // "domínio.entidade.ação"
  userId:      string;
  sessionId:   string;
  journeyId?:  string;
  stepId?:     string;
  outcome:     "success" | "failure" | "blocked";
  details?:    Record<string, unknown>;
}

interface AuditRecord extends AuditInput {
  recordId:    string;
  timestamp:   number;
  immutable:   true;            // congelado via Object.freeze()
}

interface AuditFilter {
  userId?:      string;
  sessionId?:   string;
  journeyId?:   string;
  action?:      string;          // suporta wildcard: "execution.*"
  outcome?:     string;
  since?:       number;
  until?:       number;
  limit?:       number;
}
```

**Imutabilidade:** Todo `AuditRecord` é congelado com `Object.freeze()` imediatamente após criação. Tentativas de modificação falham silenciosamente em modo não-strict e lançam `TypeError` em strict mode.

---

### SecurityGate

**Responsabilidade:** Avaliação de risco, permissões e políticas antes de toda ação externa.  
**Referência:** ADR-002, RFC-002.

```typescript
interface ISecurityGate {
  evaluate(request: SecurityRequest): SecurityDecision;
  addPolicy(policy: IPolicy): void;
  removePolicy(policyId: string): void;
  listPolicies(): PolicyMetadata[];
}

interface SecurityRequest {
  userId:          string;
  sessionId:       string;
  action:          string;
  resource:        string;
  estimatedImpact: RiskLevel;
  isReversible:    boolean;
  metadata?:       Record<string, unknown>;
}

interface SecurityDecision {
  authorized:       boolean;
  requiresApproval: boolean;
  riskLevel:        RiskLevel;
  reason?:          string;       // presente quando !authorized
  policyId?:        string;       // política que bloqueou
  auditRef:         string;       // referência ao AuditRecord criado
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
```

---

## Capítulo 3 — Connector API

**Referência:** MCF, MDH Capítulo 8.

### IConnector

```typescript
interface IConnector {
  readonly connectorId: string;
  readonly version:     string;

  execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult>;
  rollback?(previousState: unknown, ctx: ExecutionContext): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  getMetadata(): ConnectorMetadata;
}
```

### ConnectorMetadata

```typescript
interface ConnectorMetadata {
  connectorId:          string;
  version:              string;
  capabilities:         string[];
  riskLevel:            RiskLevel;
  isReversible:         boolean;
  supportsRollback?:    boolean;
  requiredPermissions?: string[];
  timeoutMs?:           number;     // timeout default
  retryConfig?:         RetryConfig;
}

interface RetryConfig {
  maxRetries:   number;       // default 3
  backoffMs:    number;       // base de backoff (ms)
  backoffType:  "linear" | "exponential";
}
```

### ConnectorResult

```typescript
interface ConnectorResult {
  status:       "success" | "failure" | "partial";
  outputData?:  unknown;
  errorCode?:   string;          // ver Capítulo 11
  errorMsg?:    string;
  auditLog:     string[];        // entradas de diagnóstico
  resourceRef:  string;          // ref: {executionId}:{stepId}
  metadata?:    Record<string, unknown>;
}
```

### HealthCheckResult

```typescript
interface HealthCheckResult {
  status:     "healthy" | "degraded" | "down";
  latencyMs?: number;
  message?:   string;
  checkedAt:  number;           // timestamp ms
}
```

### Padrão de Timeout

```typescript
// ctx.timeoutMs é sempre o timeout configurado no PlanStep
// Use AbortController para fetch/HTTP
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
try {
  const res = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timer);
}
```

### Circuit Breaker (Padrão Recomendado)

```typescript
// Implemente via RetryConfig + healthCheck
// O ExecutionEngine respeita ConnectorResult.status="failure"
// para decidir se tenta rollback ou segue para o próximo step
```

---

## Capítulo 4 — Specialist API

**Referência:** MCIS, MDH Capítulo 9.

### ISpecialist

```typescript
interface ISpecialist {
  readonly specialistId: string;
  readonly domain:       string;
  readonly capabilities: string[];

  // Determinístico — sem chamadas externas
  canHandle(query: string): boolean;

  // Processamento principal
  process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult>;

  getMetadata(): SpecialistMetadata;
}
```

### KnowledgeContext

```typescript
interface KnowledgeContext {
  userId:          string;
  sessionId:       string;
  identityContext: string;
  knowledgeProvider: IKnowledgeProvider;
  history?:        ConversationTurn[];
}

interface ConversationTurn {
  role:    "user" | "assistant";
  content: string;
  at:      number;   // timestamp ms
}
```

### SpecialistResult

```typescript
interface SpecialistResult {
  specialistId:    string;
  response:        string;
  confidence:      number;       // 0.0 – 1.0
  reasoning:       string[];     // passos de raciocínio explícitos
  sources:         string[];     // nodeIds usados
  recommendations: string[];     // próximos passos sugeridos
  metadata?:       Record<string, unknown>;
}
```

### SpecialistMetadata

```typescript
interface SpecialistMetadata {
  specialistId: string;
  domain:       string;
  version:      string;
  languages:    string[];        // ex: ["pt-BR", "en-US"]
  expertise:    Record<string, number>;  // ex: { tax: 0.9 }
}
```

---

## Capítulo 5 — Knowledge API

**Referência:** MGIS, MDH Capítulo 10.

### KnowledgePackage

```typescript
interface KnowledgePackage {
  packageId:  string;
  domain:     string;
  version:    string;
  language:   string;
  nodes:      KnowledgeNode[];
  metadata:   KnowledgePackageMetadata;
}

interface KnowledgePackageMetadata {
  author:      string;
  rfc?:        string;
  createdAt:   string;          // ISO date
  description: string;
}
```

### KnowledgeNode

```typescript
interface KnowledgeNode {
  nodeId:     string;
  type:       KnowledgeNodeType;
  domain:     string;
  title:      string;
  content:    string;
  tags:       string[];
  relations:  KnowledgeRelation[];
  confidence: number;           // 0.0 – 1.0; mínimo 0.8
  source:     string;
  version:    string;
}

type KnowledgeNodeType =
  | "concept"
  | "procedure"
  | "fact"
  | "entity"
  | "rule"
  | "example";
```

### KnowledgeRelation

```typescript
interface KnowledgeRelation {
  nodeId:   string;
  relation: RelationType;
}

type RelationType =
  | "is_part_of"
  | "depends_on"
  | "similar_to"
  | "contradicts"
  | "examples"
  | "requires";
```

### IKnowledgeProvider

```typescript
interface IKnowledgeProvider {
  getByDomain(domain: string, intent?: string): KnowledgeNode[];
  getByNodeId(nodeId: string): KnowledgeNode | null;
  search(query: string, options?: SearchOptions): KnowledgeNode[];
  rank(nodes: KnowledgeNode[], query: string): KnowledgeNode[];
}

interface SearchOptions {
  domain?:        string;
  type?:          KnowledgeNodeType;
  minConfidence?: number;        // default 0.7
  limit?:         number;        // default 10
}
```

---

## Capítulo 6 — Event Bus API

**Referência:** ADR-004, RFC-004.

### Publicar Evento

```typescript
await eventBus.publish({
  eventId:      crypto.randomUUID(),       // garante idempotência
  type:         "execution.step.completed",
  sourceEngine: "ExecutionEngine",
  priority:     "NORMAL",
  payload:      { stepId, duration },
  timestamp:    Date.now(),
  sessionId:    ctx.sessionId,
});
```

### Subscrever com Wildcard

```typescript
const sub = eventBus.subscribe("execution.*", (event) => {
  console.log(event.type, event.payload);
});

// Cancelar subscrição
eventBus.unsubscribe(sub);
```

### Prioridades

| Priority | Uso | Latência Target |
|---|---|---|
| CRITICAL | Bloqueio de segurança, erro crítico | < 1ms |
| HIGH | Falha de journey, aprovação humana | < 5ms |
| NORMAL | Ações regulares do sistema | < 10ms |
| LOW | Logs, estatísticas, background | < 50ms |

### Dead Letter Queue

```typescript
// Eventos que falharam após maxRetries (default 3)
const failed = eventBus.getDLQ();

// Re-processar manualmente
await eventBus.replayDLQ();
```

---

## Capítulo 7 — Security API

**Referência:** ADR-002, MDIS.

### Uso do SecurityGate

```typescript
// OBRIGATÓRIO antes de toda ação externa de risco MEDIUM+
const decision = security.evaluate({
  userId:          ctx.userId,
  sessionId:       ctx.sessionId,
  action:          "connector.execute",
  resource:        connectorId,
  estimatedImpact: "HIGH",
  isReversible:    false,
});

if (!decision.authorized) {
  // Bloquear — registrar no AuditTrail (feito automaticamente)
  return { status: "failure", errorCode: "PERMISSION_DENIED", errorMsg: decision.reason };
}

if (decision.requiresApproval) {
  // Pausar Journey e aguardar aprovação humana
  await journeyManager.pause(ctx.journeyId, "awaiting_human_approval");
  return { requiresApproval: true, riskLevel: decision.riskLevel };
}
```

### IPolicy

```typescript
interface IPolicy {
  policyId:  string;
  version:   string;

  // Retorna true se a request deve ser BLOQUEADA
  evaluate(request: SecurityRequest): PolicyDecision;
}

interface PolicyDecision {
  blocked:          boolean;
  requiresApproval: boolean;
  reason?:          string;
}
```

### Identity Context

```typescript
// Isola memória e auditoria por contexto de identidade
// Exemplos de valores: "pessoal", "empresa:acme", "projeto:alpha"
const identityContext = "empresa:acme";
const items = memory.getByContext(identityContext);
// Retorna APENAS itens deste contexto
```

---

## Capítulo 8 — Journey API

**Referência:** ADR-005, MRS Capítulo 4.

### Ciclo de Vida

```
draft → active → paused → active → completed
                        ↓
                    blocked → active
                        ↓
                    archived
```

### Criar e Gerenciar Journey

```typescript
// Criar
const journey = await journeyManager.create({
  userId:          "user-123",
  title:           "Consulta CPF",
  identityContext: "pessoal",
  initialData:     { cpf: "123.456.789-00" },
});

// Pausar (aguardar input ou aprovação)
await journeyManager.pause(journey.journeyId, "awaiting_document_upload");

// Retomar
await journeyManager.resume(journey.journeyId);

// Adicionar evento
await journeyManager.addEvent(journey.journeyId, {
  type:    "document.uploaded",
  payload: { documentId: "doc-456" },
});

// Completar
await journeyManager.complete(journey.journeyId, "CPF consultado com sucesso");
```

### CreateJourneyInput

```typescript
interface CreateJourneyInput {
  userId:          string;
  title:           string;
  identityContext: string;
  initialData?:    Record<string, unknown>;
  metadata?:       Record<string, unknown>;
}

interface JourneyEventInput {
  type:     string;
  payload:  unknown;
}
```

---

## Capítulo 9 — Audit API

**Referência:** ADR-006.

### Registrar Ação

```typescript
const record = await audit.record({
  action:    "connector.execute",   // formato: domínio.entidade.ação
  userId:    ctx.userId,
  sessionId: ctx.sessionId,
  journeyId: ctx.journeyId,
  stepId:    ctx.stepId,
  outcome:   "success",
  details:   { connectorId, duration: 120, inputSize: 256 },
});
// record.immutable === true sempre
```

### Consultar e Exportar

```typescript
// Busca
const records = audit.query({
  userId:   "user-123",
  action:   "connector.*",
  since:    Date.now() - 86_400_000,  // últimas 24h
  limit:    100,
});

// Exportar como JSON
const json = audit.export({ sessionId: "sess-abc" }, "json");

// Exportar como CSV
const csv = audit.export({ userId: "user-123" }, "csv");
```

### Retenção

| Tier | Retenção | Notas |
|---|---|---|
| active | 90 dias | Consulta direta |
| historical | 1 ano | Consulta com filtro |
| archived | Indefinido | Exportação sob demanda |

---

## Capítulo 10 — SDK API

**Referência:** MDPS.

### Core SDK — Inicialização

```typescript
import { createMemoryOSRuntime } from "@memoryos/core-sdk";

const runtime = createMemoryOSRuntime({
  userId:          "user-123",
  identityContext: "pessoal",
  config: {
    memory:   { maxCapacity: 500 },
    security: { defaultRiskLevel: "MEDIUM" },
    audit:    { enabled: true },
  },
});

// Acesso aos engines
const { memory, execution, journey, eventBus, audit, security } = runtime;
```

### Connector SDK — Scaffold

```typescript
import { BaseConnector } from "@memoryos/connector-sdk";

export class MyConnector extends BaseConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    // Validação automática via BaseConnector.validateInput()
    const v = this.validateInput(input, MyInputSchema);
    if (!v.ok) return this.failure(v.error);

    const data = await this.fetchWithTimeout(url, ctx.timeoutMs);
    return this.success(data);
  }
}
// BaseConnector fornece: validateInput, success, failure, fetchWithTimeout, log
```

### Specialist SDK — Scaffold

```typescript
import { BaseSpecialist } from "@memoryos/specialist-sdk";

export class MySpecialist extends BaseSpecialist {
  readonly specialistId = "my-specialist";
  readonly domain       = "my-domain";
  readonly capabilities = ["feature-a"];

  protected keywords = ["palavra-chave-1", "palavra-chave-2"];

  async process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult> {
    const nodes = ctx.knowledgeProvider.getByDomain(this.domain);
    return this.buildResult(query, nodes, ["Raciocínio explicitado"]);
  }
}
// BaseSpecialist fornece: canHandle() via keywords, buildResult()
```

### Utilities

```typescript
import { generateId, sleep, withRetry, withTimeout } from "@memoryos/utils";

const id = generateId();                         // UUID v4
await sleep(100);                                // ms
const result = await withRetry(fn, { maxRetries: 3, backoffMs: 100 });
const safe   = await withTimeout(fn, 5000);      // rejeita após 5s
```

---

## Capítulo 11 — Error Model

### Error Codes Oficiais

| Code | Categoria | Descrição |
|---|---|---|
| `VALIDATION_ERROR` | Validation | Input inválido ou campo obrigatório ausente |
| `TYPE_MISMATCH` | Validation | Tipo incompatível com o esperado |
| `MISSING_FIELD` | Validation | Campo obrigatório não fornecido |
| `PERMISSION_DENIED` | Permission | SecurityGate bloqueou a execução |
| `APPROVAL_REQUIRED` | Permission | Requer aprovação humana |
| `IDENTITY_CONTEXT_MISMATCH` | Permission | Acesso a contexto não autorizado |
| `CONNECTOR_NOT_FOUND` | Execution | connectorId não registrado |
| `EXECUTION_TIMEOUT` | Execution | Timeout do PlanStep ou plano excedido |
| `EXECUTION_FAILED` | Execution | Step required falhou |
| `ROLLBACK_FAILED` | Execution | Rollback não foi possível |
| `CONNECTOR_UNAVAILABLE` | Connector | healthCheck retornou "down" |
| `CONNECTOR_DEGRADED` | Connector | healthCheck retornou "degraded" |
| `EXTERNAL_API_ERROR` | Connector | Serviço externo retornou erro |
| `TIMEOUT` | Timeout | Operação excedeu timeoutMs |
| `MAX_RETRIES_EXCEEDED` | Retry | Máximo de tentativas atingido |
| `DLQ_EVENT` | EventBus | Evento enviado para Dead Letter Queue |
| `JOURNEY_NOT_FOUND` | Journey | journeyId não encontrado |
| `JOURNEY_INVALID_TRANSITION` | Journey | Transição de status inválida |
| `AUDIT_IMMUTABILITY_VIOLATION` | Audit | Tentativa de modificar AuditRecord |

### ConnectorResult de Erro

```typescript
return {
  status:      "failure",
  errorCode:   "EXTERNAL_API_ERROR",
  errorMsg:    `GitHub API returned 429: rate limit exceeded`,
  auditLog:    [`attempt 1 failed at ${new Date().toISOString()}`],
  resourceRef: `ref:${ctx.executionId}:${ctx.stepId}`,
};
```

### Recuperação

```typescript
// Verificar se o erro é recuperável
const RECOVERABLE = new Set(["TIMEOUT", "MAX_RETRIES_EXCEEDED", "CONNECTOR_DEGRADED"]);
if (RECOVERABLE.has(result.errorCode)) {
  // Tentar novamente ou usar fallback
}

// Erros não recuperáveis → pausar Journey
const FATAL = new Set(["PERMISSION_DENIED", "ROLLBACK_FAILED"]);
if (FATAL.has(result.errorCode)) {
  await journeyManager.pause(ctx.journeyId, result.errorCode);
}
```

---

## Capítulo 12 — Versionamento

**Referência:** MPEGS Capítulo 8.

### SemVer

| Incremento | Quando | Retrocompatível |
|---|---|---|
| PATCH (x.x.N) | Correção de bug, sem mudança de interface | Sim |
| MINOR (x.N.0) | Nova feature opcional, novo campo optional | Sim |
| MAJOR (N.0.0) | Breaking change, remoção de campo, renaming | Não |

### Breaking Changes

Um breaking change é qualquer mudança que faça código que compilava antes deixar de compilar ou mudar comportamento silenciosamente:

- Remover método de interface pública
- Renomear campo obrigatório
- Alterar tipo de parâmetro
- Mudar comportamento de retorno

Todo breaking change exige RFC Crítica → Grace period ≥ 6 meses → MAJOR release.

### Deprecation

```typescript
/** @deprecated desde v1.2 — use `newMethod()` em vez disso. Será removido em v2.0. */
oldMethod(input: OldInput): OldResult;
```

### Compatibilidade

Novos campos são sempre `optional`:
```typescript
// ✅ CORRETO — adição retrocompatível
interface ConnectorMetadata {
  connectorId: string;
  version:     string;
  newField?:   string;   // opcional — não quebra código existente
}

// ❌ ERRADO — quebra código existente
interface ConnectorMetadata {
  connectorId: string;
  version:     string;
  newField:    string;   // obrigatório — breaking change
}
```

---

## Capítulo 13 — Code Examples

### Connector HTTP Completo

```typescript
import type { IConnector, ConnectorResult, ExecutionContext } from "@memoryos/core";

export class HttpConnector implements IConnector {
  readonly connectorId = "http-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    const { url, method = "GET", headers = {}, body } = input as any;
    if (!url) return { status: "failure", errorCode: "MISSING_FIELD", errorMsg: "url is required", auditLog: [], resourceRef: "" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 30_000);
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!res.ok) return { status: "failure", errorCode: "EXTERNAL_API_ERROR", errorMsg: `HTTP ${res.status}`, auditLog: [`${method} ${url} → ${res.status}`], resourceRef: `ref:${ctx.executionId}:${ctx.stepId}` };
      const data = await res.json();
      return { status: "success", outputData: data, auditLog: [`${method} ${url} → 200`], resourceRef: `ref:${ctx.executionId}:${ctx.stepId}` };
    } catch (e: any) {
      const code = e.name === "AbortError" ? "TIMEOUT" : "EXTERNAL_API_ERROR";
      return { status: "failure", errorCode: code, errorMsg: e.message, auditLog: [], resourceRef: "" };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    try {
      await fetch("https://httpbin.org/get", { method: "HEAD" });
      return { status: "healthy" as const, checkedAt: Date.now() };
    } catch {
      return { status: "degraded" as const, checkedAt: Date.now() };
    }
  }

  getMetadata() {
    return { connectorId: this.connectorId, version: this.version, capabilities: ["http-get", "http-post"], riskLevel: "MEDIUM" as const, isReversible: false };
  }
}
```

### Connector OAuth

```typescript
export class OAuthConnector implements IConnector {
  readonly connectorId = "oauth-connector";
  readonly version     = "1.0.0";
  private token?: string;

  setToken(token: string) { this.token = token; }

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    if (!this.token) return { status: "failure", errorCode: "PERMISSION_DENIED", errorMsg: "OAuth token not set", auditLog: [], resourceRef: "" };
    const { url } = input as any;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    return { status: res.ok ? "success" : "failure", outputData: await res.json(), auditLog: [], resourceRef: `ref:${ctx.executionId}:${ctx.stepId}` };
  }

  async healthCheck() { return { status: this.token ? "healthy" : "degraded" as any, checkedAt: Date.now() }; }
  getMetadata() { return { connectorId: this.connectorId, version: this.version, capabilities: ["oauth-get"], riskLevel: "HIGH" as const, isReversible: false }; }
}
```

### Specialist Completo

```typescript
export class LegalSpecialist implements ISpecialist {
  readonly specialistId = "legal-specialist";
  readonly domain       = "legal";
  readonly capabilities = ["contract-analysis", "compliance", "risk"];

  private readonly KEYWORDS = ["contrato", "cláusula", "multa", "rescisão", "lei", "código civil"];

  canHandle(query: string): boolean {
    const q = query.toLowerCase();
    return this.KEYWORDS.some(k => q.includes(k));
  }

  async process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult> {
    const nodes = ctx.knowledgeProvider.getByDomain(this.domain);
    const relevant = nodes.filter(n => n.tags.some(t => query.toLowerCase().includes(t)));
    return {
      specialistId: this.specialistId,
      response:     relevant.length > 0 ? `Análise jurídica: ${relevant[0].content}` : "Consulte um advogado.",
      confidence:   relevant.length > 0 ? 0.88 : 0.40,
      reasoning:    [`Domínio legal detectado`, `${relevant.length} nós relevantes encontrados`],
      sources:      relevant.map(n => n.nodeId),
      recommendations: ["Consultar advogado para casos complexos"],
    };
  }

  getMetadata() { return { specialistId: this.specialistId, domain: this.domain, version: "1.0.0", languages: ["pt-BR"], expertise: { contract: 0.85, compliance: 0.80 } }; }
}
```

### Knowledge Package

```typescript
const legalPackage: KnowledgePackage = {
  packageId: "br-legal-v1",
  domain:    "legal",
  version:   "1.0.0",
  language:  "pt-BR",
  nodes: [
    {
      nodeId:     "clt-001",
      type:       "concept",
      domain:     "legal",
      title:      "CLT — Consolidação das Leis do Trabalho",
      content:    "A CLT é o conjunto de normas que regulam as relações de trabalho no Brasil...",
      tags:       ["clt", "trabalho", "empregado", "empregador"],
      relations:  [{ nodeId: "cf-001", relation: "is_part_of" }],
      confidence: 0.97,
      source:     "diario-oficial-brasil",
      version:    "1.0",
    },
  ],
  metadata: { author: "MemoryOS Legal Team", rfc: "RFC-NNN", createdAt: "2026-07-10", description: "Legislação trabalhista brasileira" },
};
```

### Journey Completa

```typescript
// 1. Criar Journey
const journey = await journeyManager.create({
  userId:          "user-123",
  title:           "Análise de Contrato",
  identityContext: "empresa:acme",
  initialData:     { documentId: "doc-789" },
});

// 2. Executar plano
const result = await execution.execute({
  planId:    "plan-001",
  sessionId: "sess-abc",
  userId:    "user-123",
  journeyId: journey.journeyId,
  steps: [
    { stepId: "step-1", connectorId: "http-connector", input: { url: "..." }, required: true, isReversible: false, timeout: 10_000 },
    { stepId: "step-2", connectorId: "legal-specialist", input: { query: "analisar cláusula 5" }, required: false, isReversible: false, timeout: 5_000 },
  ],
}, { executionId: "exec-001", sessionId: "sess-abc", userId: "user-123", journeyId: journey.journeyId, timeoutMs: 30_000 });

// 3. Completar
if (result.status === "success") {
  await journeyManager.complete(journey.journeyId, "Análise concluída");
}
```

### Policy Personalizada

```typescript
export class RateLimitPolicy implements IPolicy {
  policyId = "rate-limit-policy";
  version  = "1.0.0";

  private counts = new Map<string, number>();

  evaluate(request: SecurityRequest): PolicyDecision {
    const key   = `${request.userId}:${request.action}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);

    if (count > 100) {
      return { blocked: true, requiresApproval: false, reason: "Rate limit exceeded (100/session)" };
    }
    return { blocked: false, requiresApproval: false };
  }
}

// Registrar no SecurityGate
security.addPolicy(new RateLimitPolicy());
```

---

## Capítulo 14 — Best Practices

| Prática | Por quê | Como |
|---|---|---|
| Interfaces First | Descoberta em tempo de compilação | Exporte `IConnector`, não `HttpConnector` |
| Composition | Flexibilidade sem herança profunda | Injete dependências no construtor |
| Dependency Injection | Testabilidade | Nunca instancie engines internamente |
| Event Driven | Desacoplamento | Use EventBus; não chame engines diretamente |
| Audit Everything | Rastreabilidade | `audit.record()` em toda mutação |
| Security First | Segurança por design | `security.evaluate()` antes de toda ação externa |
| Human Approval | Ações irreversíveis são perigosas | `requiresApproval: true` para HIGH/CRITICAL |
| Testing | Confiança no sistema | MRI: 3+ testes por componente; MQCCS ≥ 85% |
| Performance | UX responsiva | Cache em WorkingMemory; Promise.all para paralelos |

---

## Capítulo 15 — API Reference Interativa

> Consulte a página `/api-reference` para a referência interativa com busca, filtros, exemplos copiáveis e links para Foundation e MDH.

---

## Capítulo 16 — API Stability

### Declaração Oficial

Toda API documentada neste documento é **API pública estável** do MemoryOS Foundation.

A partir desta declaração:
1. Nenhuma API pública pode ser modificada sem RFC aprovada
2. Breaking changes requerem grace period mínimo de 6 meses
3. Todo campo novo é adicionado como `optional`
4. A versão de toda interface é incrementada via SemVer

### Processo de Mudança

```
RFC (proposta) → Discussão (14d mínimo) → ADR (decisão) →
Implementação → MRI (100% pass) → MQCCS (≥85%) → Release
```

### Interfaces Estáveis (v1.0)

| Interface | Versão | Status |
|---|---|---|
| IConnector | 1.0 | Stable |
| ISpecialist | 1.0 | Stable |
| IKnowledgeProvider | 1.0 | Stable |
| IEventBus | 1.0 | Stable |
| IAuditTrail | 1.0 | Stable |
| ISecurityGate | 1.0 | Stable |
| IJourneyManager | 1.0 | Stable |
| IWorkingMemoryEngine | 1.0 | Stable |
| IExecutionEngine | 1.0 | Stable |
| IPolicy | 1.0 | Stable |

---

## Referências

| Documento | Relevância |
|---|---|
| MAS | Arquitetura do sistema |
| MRS | Runtime e ciclo de vida |
| MCS | Core boundaries |
| MDPS | SDK specification |
| MQCCS | Qualidade e certificação |
| MPEGS | Processo de evolução |
| MDH | Engineering guide |
| MCF | Connector framework |
| MCIS | Connector intelligence |
| MGIS | Goal intelligence |

---

*MPAR — MemoryOS Public API Reference v1.0 — Official — 2026-07-10*