# MDS-Engines — Motores, Modelagem, Banco de Dados e APIs

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 2 de 4 do MDS

---

# PARTE II — IMPLEMENTAÇÃO DOS MOTORES

---

## 1. Intent Engine

```typescript
// packages/core/intent/intent-engine.ts

@Injectable()
export class IntentEngine {
  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly memoryEngine: MemoryEngine,
    private readonly contextEngine: ContextEngine,
  ) {}

  async process(raw: string, context: RequestContext): Promise<IntentResult> {
    // 1. Normalizar input
    const normalized = this.normalize(raw);

    // 2. Enriquecer com contexto e memória
    const enrichedContext = await this.contextEngine.enrich(context);
    const memoryContext   = await this.memoryEngine.getRelevant(context.userId, normalized);

    // 3. Chamar LLM para classificação
    const classification = await this.llmProvider.classify({
      input: normalized,
      context: enrichedContext,
      memory: memoryContext,
      schema: IntentClassificationSchema,
    });

    // 4. Validar resultado
    const validated = IntentClassificationSchema.parse(classification);

    return {
      intentId:    generateId("int"),
      rawText:     raw,
      normalized,
      domain:      validated.domain,
      subDomain:   validated.subDomain,
      confidence:  validated.confidence,
      ambiguous:   validated.confidence < 0.70,
      entities:    validated.entities,
      language:    validated.language,
      detectedAt:  new Date().toISOString(),
    };
  }

  private normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, " ");
  }
}

// Schema de classificação (Zod)
const IntentClassificationSchema = z.object({
  domain:     z.nativeEnum(IntentDomain),
  subDomain:  z.string().optional(),
  confidence: z.number().min(0).max(1),
  ambiguous:  z.boolean(),
  entities:   z.array(DetectedEntitySchema),
  language:   z.string(),
});
```

## 2. Goal Engine (MGIS Implementation)

```typescript
// packages/core/goal/goal-engine.ts

@Injectable()
export class GoalEngine {
  constructor(
    private readonly goalDecomposer:  GoalDecomposer,
    private readonly goalPrioritizer: GoalPrioritizer,
    private readonly conflictResolver: GoalConflictResolver,
    private readonly goalMemory:      GoalMemoryManager,
    private readonly goalRegistry:    GoalRegistry,
    private readonly specialistBus:   SpecialistBus,
    private readonly eventBus:        UniversalEventBus,
  ) {}

  async processIntent(intent: IntentResult, ctx: GoalContext): Promise<GoalPlan> {
    // 1. Buscar template similar na memória
    const existing = await this.goalMemory.findSimilar(intent, ctx.userId);
    if (existing && existing.confidence > 0.85) {
      return this.adaptExisting(existing, ctx);
    }

    // 2. Criar Goal raiz
    const rootGoal = await this.createGoal(intent, ctx);

    // 3. Consultar Specialists para enriquecer decomposição
    const specialistInsights = await this.specialistBus.consult(rootGoal);

    // 4. Decompor em subgoals
    const decomposition = await this.goalDecomposer.decompose(
      rootGoal, ctx, specialistInsights
    );

    // 5. Detectar e resolver conflitos
    const activeGoals = await this.goalMemory.getActive(ctx.userId);
    const conflicts   = this.conflictResolver.detect([...activeGoals, rootGoal]);
    const resolutions = conflicts.map(c => this.conflictResolver.resolve(c));

    // 6. Priorizar
    const prioritized = this.goalPrioritizer.prioritize(
      decomposition.allGoals, ctx
    );

    // 7. Construir GoalPlan
    const plan = this.buildPlan(rootGoal, decomposition, prioritized, resolutions, ctx);

    // 8. Persistir e emitir evento
    await this.goalMemory.save(plan);
    await this.eventBus.publish("goal.created", { goalId: plan.goalPlanId, userId: ctx.userId });

    return plan;
  }

  private async createGoal(intent: IntentResult, ctx: GoalContext): Promise<Goal> {
    const template = await this.goalRegistry.findByOntologyDomain(intent.domain);
    return {
      goalId:          generateId("gol"),
      intentId:        intent.intentId,
      title:           intent.normalized,
      ontologyDomain:  intent.domain,
      complexity:      this.classifyComplexity(intent),
      horizon:         this.classifyHorizon(intent, ctx),
      state:           GoalState.CREATED,
      context:         ctx,
      subGoals:        [],
      objectives:      [],
      constraints:     [],
      dependencies:    [],
      priority:        GoalPriority.NORMAL,
      memoryContext:   { recentGoals: ctx.recentGoals },
      createdAt:       new Date().toISOString(),
    };
  }
}
```

## 3. Memory Engine

```typescript
// packages/core/memory/memory-engine.ts

@Injectable()
export class MemoryEngine {
  constructor(
    private readonly memoryStore:      MemoryStore,         // PostgreSQL
    private readonly vectorIndex:      VectorIndexManager,  // pgvector
    private readonly embeddingProvider: EmbeddingProvider,  // OpenAI/Gemini
    private readonly consolidator:     MemoryConsolidationManager,
    private readonly retrieval:        MemoryRetrievalEngine,
    private readonly eventBus:         UniversalEventBus,
  ) {}

  async store(proposal: MemoryUpdateProposal): Promise<MemoryRecord> {
    // 1. Validar proposta
    MemoryUpdateProposalSchema.parse(proposal);

    // 2. Verificar duplicatas
    const duplicate = await this.checkDuplicate(proposal);
    if (duplicate) return this.mergeOrReject(duplicate, proposal);

    // 3. Gerar embedding para busca semântica
    const embedding = await this.embeddingProvider.embed(proposal.content);

    // 4. Persistir
    const record = await this.memoryStore.create({
      ...proposal,
      embedding,
      memoryTier: "active",
      confidence: proposal.confidence ?? 1.0,
    });

    // 5. Indexar no vetor
    await this.vectorIndex.index(record.id, embedding);

    // 6. Emitir evento
    await this.eventBus.publish("memory.fact.stored", { recordId: record.id });

    return record;
  }

  async retrieve(query: MemoryQuery): Promise<MemorySearchResult[]> {
    return this.retrieval.search(query);
  }

  async getRelevant(userId: string, context: string): Promise<MemoryContext> {
    const embedding = await this.embeddingProvider.embed(context);
    const similar   = await this.vectorIndex.searchSimilar(userId, embedding, 20);
    return { facts: similar, recentGoals: await this.getRecentGoals(userId) };
  }
}
```

## 4. Planner

```typescript
// packages/core/planner/planner.ts

@Injectable()
export class Planner {
  async buildExecutionPlan(
    goalPlan: GoalPlan,
    mcisDiscovery: MCISDiscoveryResult
  ): Promise<ExecutionPlan> {

    const steps: ExecutionStep[] = [];

    for (const prioritizedGoal of goalPlan.prioritizedGoals) {
      const capabilities = mcisDiscovery.getCapabilitiesForGoal(prioritizedGoal.goalId);

      const step: ExecutionStep = {
        stepId:       generateId("stp"),
        goalId:       prioritizedGoal.goalId,
        order:        steps.length + 1,
        capabilities,
        connectorId:  capabilities[0]?.connectorId,   // Best match from MCIS
        inputMapping: this.resolveInputMapping(prioritizedGoal, steps),
        outputMapping: this.resolveOutputMapping(prioritizedGoal),
        parallel:     this.canParallelize(prioritizedGoal, steps),
        timeoutMs:    this.calculateTimeout(capabilities),
        retryPolicy:  this.getRetryPolicy(prioritizedGoal),
        onFailure:    "ABORT",
      };
      steps.push(step);
    }

    return {
      planId:          generateId("pln"),
      goalPlanId:      goalPlan.goalPlanId,
      steps:           this.topologicalSort(steps),
      parallelGroups:  this.detectParallelGroups(steps),
      criticalPath:    this.computeCriticalPath(steps),
      estimatedMs:     this.estimateTotalDuration(steps),
      createdAt:       new Date().toISOString(),
    };
  }

  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    // Kahn's algorithm para respeitar dependências
    const sorted: ExecutionStep[] = [];
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.stepId, step.dependsOn?.length ?? 0);
      for (const dep of step.dependsOn ?? []) {
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(step.stepId);
      }
    }

    const queue = steps.filter(s => (inDegree.get(s.stepId) ?? 0) === 0);
    while (queue.length > 0) {
      const step = queue.shift()!;
      sorted.push(step);
      for (const next of adj.get(step.stepId) ?? []) {
        inDegree.set(next, inDegree.get(next)! - 1);
        if (inDegree.get(next) === 0) {
          queue.push(steps.find(s => s.stepId === next)!);
        }
      }
    }
    return sorted;
  }
}
```

## 5. Execution Engine

```typescript
// packages/connectors/runtime/execution-engine.ts

@Injectable()
export class ExecutionEngine {
  constructor(
    private readonly connectorManager: ConnectorManager,
    private readonly circuitBreaker:   CircuitBreakerRegistry,
    private readonly eventBus:         UniversalEventBus,
    private readonly metricsCollector: MetricsCollector,
  ) {}

  async execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionResult> {
    const results: StepResult[] = [];
    const state: ExecutionState = { data: {}, completed: new Set() };

    for (const group of plan.parallelGroups) {
      if (group.length === 1) {
        const result = await this.executeStep(group[0], state, ctx);
        results.push(result);
        state.completed.add(group[0].stepId);
        if (result.status === "FAILED" && group[0].onFailure === "ABORT") {
          return { planId: plan.planId, status: "FAILED", results, failedAt: group[0].stepId };
        }
        if (result.output) state.data[group[0].stepId] = result.output;
      } else {
        // Execução paralela
        const parallelResults = await Promise.allSettled(
          group.map(step => this.executeStep(step, state, ctx))
        );
        for (let i = 0; i < group.length; i++) {
          const pr = parallelResults[i];
          if (pr.status === "fulfilled") {
            results.push(pr.value);
            state.data[group[i].stepId] = pr.value.output;
          } else {
            results.push({ stepId: group[i].stepId, status: "FAILED", error: pr.reason });
          }
        }
      }
    }

    return { planId: plan.planId, status: "COMPLETED", results };
  }

  private async executeStep(
    step: ExecutionStep,
    state: ExecutionState,
    ctx: ExecutionContext
  ): Promise<StepResult> {
    const connector = await this.connectorManager.getConnector(step.connectorId!);
    const cb        = this.circuitBreaker.get(step.connectorId!);

    if (cb.isOpen()) {
      const fallback = await this.connectorManager.getFallback(step.connectorId!);
      if (fallback) return this.executeStep({ ...step, connectorId: fallback.connectorId }, state, ctx);
      return { stepId: step.stepId, status: "FAILED", error: "Circuit breaker OPEN, no fallback" };
    }

    const input = this.resolveInput(step.inputMapping, state.data);
    const start = Date.now();

    try {
      const output = await withTimeout(
        connector.execute({ action: step.action, input, context: ctx }),
        step.timeoutMs
      );
      this.metricsCollector.record(step.connectorId!, Date.now() - start, "SUCCESS");
      cb.recordSuccess();
      return { stepId: step.stepId, status: "COMPLETED", output };
    } catch (error) {
      cb.recordFailure();
      this.metricsCollector.record(step.connectorId!, Date.now() - start, "FAILED");
      if (step.retryPolicy && step.retryPolicy.maxAttempts > 0) {
        return this.retryStep(step, state, ctx, error);
      }
      return { stepId: step.stepId, status: "FAILED", error: String(error) };
    }
  }
}
```

## 6. Policy Engine

```typescript
// packages/core/policy/policy-engine.ts

@Injectable()
export class PolicyEngine {
  async evaluate(
    goal: Goal,
    ctx: GoalContext
  ): Promise<PolicyEvaluationResult> {
    const checks = await Promise.all([
      this.checkAuthorization(goal, ctx),
      this.checkAgeRestriction(goal, ctx),
      this.checkBudgetLimit(goal, ctx),
      this.checkApprovalRequired(goal, ctx),
      this.checkRegulatoryCompliance(goal, ctx),
      this.checkTimeWindow(goal, ctx),
      this.checkConnectorPermissions(goal, ctx),
    ]);

    const blocked = checks.filter(c => c.result === "BLOCKED");
    const pending = checks.filter(c => c.result === "PENDING_APPROVAL");

    if (blocked.length > 0) {
      return { allowed: false, reason: blocked[0].reason, type: "HARD_BLOCK" };
    }
    if (pending.length > 0) {
      return { allowed: false, reason: pending[0].reason, type: "PENDING_APPROVAL",
               approvalGoalTemplate: pending[0].approvalGoalTemplate };
    }
    return { allowed: true };
  }

  private async checkAgeRestriction(goal: Goal, ctx: GoalContext): Promise<PolicyCheck> {
    const ageRestrictedDomains = ["ALCOHOL", "GAMBLING", "ADULT_CONTENT"];
    if (!ageRestrictedDomains.some(d => goal.ontologyDomain.includes(d))) {
      return { result: "APPROVED" };
    }
    const age = ctx.userProfile.age;
    if (!age || age < 18) {
      return { result: "BLOCKED", reason: "Ação não permitida por restrição de idade" };
    }
    return { result: "APPROVED" };
  }

  private async checkApprovalRequired(goal: Goal, ctx: GoalContext): Promise<PolicyCheck> {
    if (!ctx.approvalRequired) return { result: "APPROVED" };
    const financialGoals = goal.objectives.filter(o => o.estimatedCost > 0);
    const totalCost = financialGoals.reduce((s, o) => s + o.estimatedCost, 0);
    if (totalCost > (ctx.approvalThreshold ?? Infinity)) {
      return {
        result: "PENDING_APPROVAL",
        reason: `Valor R$${totalCost} excede limite de aprovação`,
        approvalGoalTemplate: "REQUEST_MANAGER_APPROVAL",
      };
    }
    return { result: "APPROVED" };
  }
}
```

---

# PARTE III — MODELAGEM

---

## 7. Domain Model Oficial

```typescript
// packages/shared/contracts/domain-models.ts

// ─── AGGREGATES ────────────────────────────────────────────────────

export class GoalAggregate {
  private readonly _events: DomainEvent[] = [];

  constructor(private state: Goal) {}

  get id(): string { return this.state.goalId; }
  get domainEvents(): DomainEvent[] { return [...this._events]; }

  transition(newState: GoalState): void {
    GoalStateMachine.validate(this.state.state, newState);
    const prev = this.state.state;
    this.state = { ...this.state, state: newState };
    this._events.push(new GoalStateChangedEvent(this.state.goalId, prev, newState));
  }

  clearEvents(): void { this._events.length = 0; }
  snapshot(): Goal    { return Object.freeze({ ...this.state }); }
}

// ─── REPOSITORIES ──────────────────────────────────────────────────

export interface GoalRepository {
  findById(id: string): Promise<GoalAggregate | null>;
  findByUserId(userId: string, filter?: GoalFilter): Promise<GoalAggregate[]>;
  save(aggregate: GoalAggregate): Promise<void>;
  delete(id: string): Promise<void>;
}

// ─── COMMANDS ──────────────────────────────────────────────────────

export interface CreateGoalCommand {
  readonly type: "CREATE_GOAL";
  readonly intentId: string;
  readonly userId: string;
  readonly rawText: string;
  readonly context: GoalContext;
}

export interface ExecuteGoalCommand {
  readonly type: "EXECUTE_GOAL";
  readonly goalId: string;
  readonly userId: string;
  readonly immediate: boolean;
}

// ─── QUERIES ───────────────────────────────────────────────────────

export interface GetActiveGoalsQuery {
  readonly type: "GET_ACTIVE_GOALS";
  readonly userId: string;
  readonly orgId?: string;
  readonly limit: number;
  readonly offset: number;
}

// ─── EVENTS ────────────────────────────────────────────────────────

export class GoalCreatedEvent implements DomainEvent {
  readonly type = "goal.created";
  readonly occurredAt = new Date().toISOString();
  constructor(
    readonly goalId: string,
    readonly userId: string,
    readonly domain: string,
  ) {}
}

export class GoalStateChangedEvent implements DomainEvent {
  readonly type = "goal.state_changed";
  readonly occurredAt = new Date().toISOString();
  constructor(
    readonly goalId: string,
    readonly from: GoalState,
    readonly to: GoalState,
  ) {}
}

// ─── FACTORY ───────────────────────────────────────────────────────

export class GoalFactory {
  static create(intent: IntentResult, ctx: GoalContext): GoalAggregate {
    const goal: Goal = {
      goalId:         generateId("gol"),
      intentId:       intent.intentId,
      title:          intent.normalized,
      ontologyDomain: intent.domain,
      complexity:     "SIMPLE",
      horizon:        "SHORT",
      state:          GoalState.CREATED,
      context:        ctx,
      subGoals:       [],
      objectives:     [],
      constraints:    [],
      dependencies:   [],
      priority:       GoalPriority.NORMAL,
      memoryContext:  { recentGoals: [] },
      createdAt:      new Date().toISOString(),
    };
    return new GoalAggregate(goal);
  }
}
```

## 8. Error Hierarchy

```typescript
// packages/shared/errors/errors.ts

export class MemoryOSError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number = 500,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Core Errors
export class IntentAmbiguousError extends MemoryOSError {
  constructor(message = "Intenção ambígua — clarificação necessária") {
    super(message, "INTENT_AMBIGUOUS", 422, false);
  }
}

export class GoalNotFoundError extends MemoryOSError {
  constructor(goalId: string) {
    super(`Goal '${goalId}' não encontrado`, "GOAL_NOT_FOUND", 404, false);
  }
}

export class GoalBlockedByPolicyError extends MemoryOSError {
  constructor(reason: string) {
    super(reason, "GOAL_BLOCKED_BY_POLICY", 403, false);
  }
}

export class GoalConflictError extends MemoryOSError {
  constructor(conflictType: string) {
    super(`Conflito detectado: ${conflictType}`, "GOAL_CONFLICT", 409, false);
  }
}

// Connector Errors
export class ConnectorNotFoundError extends MemoryOSError {
  constructor(connectorId: string) {
    super(`Connector '${connectorId}' não encontrado`, "CONNECTOR_NOT_FOUND", 404, false);
  }
}

export class ConnectorTimeoutError extends MemoryOSError {
  constructor(connectorId: string, timeoutMs: number) {
    super(`Connector '${connectorId}' timeout após ${timeoutMs}ms`,
      "CONNECTOR_TIMEOUT", 504, true);
  }
}

export class ConnectorRateLimitError extends MemoryOSError {
  constructor(connectorId: string, retryAfterMs: number) {
    super(`Rate limit no connector '${connectorId}'`,
      "CONNECTOR_RATE_LIMIT", 429, true);
  }
}

export class CircuitBreakerOpenError extends MemoryOSError {
  constructor(connectorId: string) {
    super(`Circuit breaker OPEN para '${connectorId}'`,
      "CIRCUIT_BREAKER_OPEN", 503, true);
  }
}
```

---

# PARTE IV — BANCO DE DADOS

---

## 9. Schema Oficial (PostgreSQL)

```sql
-- ─── TENANTS & USERS ─────────────────────────────────────────────

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(20) NOT NULL CHECK (type IN ('PERSONAL', 'ENTERPRISE')),
  name          VARCHAR(255) NOT NULL,
  plan          VARCHAR(50)  NOT NULL DEFAULT 'FREE',
  metadata      JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  full_name     VARCHAR(255),
  role          VARCHAR(50)  NOT NULL DEFAULT 'user',
  preferences   JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── GOALS ──────────────────────────────────────────────────────

CREATE TABLE goals (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id),
  intent_id       UUID,
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  ontology_domain VARCHAR(100) NOT NULL,
  complexity      VARCHAR(20)  NOT NULL,
  horizon         VARCHAR(20)  NOT NULL,
  state           VARCHAR(30)  NOT NULL DEFAULT 'CREATED',
  priority        INTEGER      NOT NULL DEFAULT 5,
  context         JSONB        NOT NULL DEFAULT '{}',
  constraints     JSONB        NOT NULL DEFAULT '[]',
  dependencies    JSONB        NOT NULL DEFAULT '[]',
  target_date     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_user_id    ON goals(user_id);
CREATE INDEX idx_goals_state      ON goals(state);
CREATE INDEX idx_goals_tenant_id  ON goals(tenant_id);

-- ─── MEMORY ─────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_records (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id),
  tenant_id       UUID          NOT NULL REFERENCES tenants(id),
  content         TEXT          NOT NULL,
  type            VARCHAR(50)   NOT NULL,   -- FACT, EVENT, PREFERENCE, DECISION
  memory_tier     VARCHAR(20)   NOT NULL DEFAULT 'active',
  confidence      FLOAT         NOT NULL DEFAULT 1.0,
  embedding       vector(1536),             -- OpenAI ada-002 dimensions
  source_type     VARCHAR(50),              -- document, message, goal_outcome
  source_id       UUID,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_user_id  ON memory_records(user_id);
CREATE INDEX idx_memory_tier     ON memory_records(memory_tier);
CREATE INDEX idx_memory_vector   ON memory_records USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── CONNECTOR REGISTRY ─────────────────────────────────────────

CREATE TABLE connector_registrations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id        VARCHAR(100) NOT NULL UNIQUE,
  connector_name      VARCHAR(255) NOT NULL,
  vendor              VARCHAR(100) NOT NULL,
  version             VARCHAR(20)  NOT NULL,
  category            VARCHAR(50)  NOT NULL,
  connector_type      VARCHAR(30)  NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  manifest            JSONB        NOT NULL,
  self_description    JSONB        NOT NULL,
  sdk_compatibility   VARCHAR(50),
  min_memoryos_ver    VARCHAR(20),
  certification_level VARCHAR(20)  NOT NULL DEFAULT 'COMMUNITY',
  tags                TEXT[]       NOT NULL DEFAULT '{}',
  registered_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── EXECUTIONS ─────────────────────────────────────────────────

CREATE TABLE execution_plans (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_plan_id    UUID         NOT NULL,
  user_id         UUID         NOT NULL REFERENCES users(id),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id),
  status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  steps           JSONB        NOT NULL DEFAULT '[]',
  result          JSONB,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ──────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id),
  user_id     UUID         REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100) NOT NULL,
  resource_id UUID,
  before      JSONB,
  after       JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);  -- Particionamento mensal

-- Partições mensais criadas automaticamente via pg_partman
```

## 10. Estratégia de Escalabilidade — DB

```
SHARDING STRATEGY:
  Chave de shard: tenant_id (para Enterprise) | user_id (para Personal)
  Shards: mínimo 16, configurável
  Routing: PgBouncer + hash consistente via tenant_id

READ REPLICAS:
  1 primary write + N read replicas (mínimo 2)
  Leituras de memory_records → always read replica
  Escritas → always primary

CONNECTION POOLING:
  PgBouncer: max_pool_size = 100 por shard
  Min pool: 10 | Max overflow: 20

PARTICIONAMENTO:
  audit_logs: RANGE por created_at (mensal)
  memory_records: LIST por memory_tier
  execution_plans: RANGE por created_at (semanal)

ÍNDICES:
  memory_records.embedding: IVFFlat (approximate) para perf
  goals: B-tree em (user_id, state, created_at)
  audit_logs: BRIN em created_at (append-only, compacto)

BACKUP:
  Continuous WAL archiving → S3
  Daily full snapshot
  Point-in-time recovery (PITR) até 30 dias
  RTO: < 1 hora | RPO: < 5 minutos
```

---

# PARTE V — APIs

---

## 11. REST API Oficial

```typescript
// Base URL: https://api.memoryos.ai/v1

// ─── INTENT / GOAL ───────────────────────────────────────────────

POST   /v1/process          // Processa intent → retorna GoalPlan + inicia execução
GET    /v1/goals            // Lista goals ativos do usuário
GET    /v1/goals/:id        // Detalhe de um goal
PATCH  /v1/goals/:id/state  // Transição de estado (pause, cancel, resume)
DELETE /v1/goals/:id        // Cancela e arquiva goal

// ─── MEMORY ──────────────────────────────────────────────────────

GET    /v1/memory           // Busca semântica na memória
POST   /v1/memory           // Adiciona fato manualmente
DELETE /v1/memory/:id       // Remove da memória

// ─── CONNECTORS ──────────────────────────────────────────────────

GET    /v1/connectors               // Lista connectors disponíveis
POST   /v1/connectors/connect       // Inicia autenticação OAuth de um connector
GET    /v1/connectors/:id/status    // Status de saúde do connector
POST   /v1/connectors/:id/execute   // Execução direta (avançado)

// ─── EXECUTIONS ──────────────────────────────────────────────────

GET    /v1/executions/:planId       // Status de uma execução
GET    /v1/executions/:planId/steps // Steps com resultados individuais

// ─── WEBSOCKET ──────────────────────────────────────────────────

// Endpoint: wss://api.memoryos.ai/v1/stream

// Eventos enviados ao cliente:
{ type: "goal.state_changed",  data: { goalId, from, to } }
{ type: "execution.step",      data: { stepId, status, output } }
{ type: "memory.updated",      data: { recordId, type } }
{ type: "notification",        data: { message, severity } }
```

## 12. gRPC API (Inter-service)

```protobuf
// proto/core.proto

syntax = "proto3";
package memoryos.core.v1;

service CoreService {
  rpc ProcessIntent (ProcessIntentRequest) returns (ProcessIntentResponse);
  rpc GetGoalPlan   (GetGoalPlanRequest)   returns (GetGoalPlanResponse);
  rpc UpdateGoalState (UpdateGoalStateRequest) returns (UpdateGoalStateResponse);
}

message ProcessIntentRequest {
  string raw_text  = 1;
  string user_id   = 2;
  string tenant_id = 3;
  GoalContext context = 4;
}

message ProcessIntentResponse {
  string goal_plan_id   = 1;
  GoalPlan goal_plan    = 2;
  bool requires_confirm = 3;
}

// proto/connector.proto

service ConnectorService {
  rpc Execute         (ConnectorExecuteRequest)  returns (ConnectorExecuteResponse);
  rpc GetStatus       (ConnectorStatusRequest)   returns (ConnectorStatusResponse);
  rpc DiscoverForGoal (DiscoverRequest)          returns (DiscoverResponse);
}
```

## 13. Rate Limiting e Retry

```typescript
// Rate Limit por plano (por minuto):
const RATE_LIMITS = {
  FREE:       { requests: 60,   tokens: 10_000  },
  PRO:        { requests: 600,  tokens: 100_000 },
  ENTERPRISE: { requests: 6000, tokens: 1_000_000 },
} as const;

// Retry Policy padrão
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts:     3,
  initialDelayMs:  500,
  backoffFactor:   2.0,   // exponential
  maxDelayMs:      10_000,
  retryableErrors: ["CONNECTOR_TIMEOUT", "CONNECTOR_RATE_LIMIT", "CIRCUIT_BREAKER_OPEN"],
};

// Circuit Breaker padrão
const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold:  5,    // OPEN após 5 falhas consecutivas
  successThreshold:  2,    // CLOSE após 2 sucessos no estado HALF_OPEN
  timeoutMs:        30_000, // HALF_OPEN após 30s
  halfOpenRequests:  1,
};
```

---

**Documento Oficial:** MDS-Engines  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 2 de 4 do MDS