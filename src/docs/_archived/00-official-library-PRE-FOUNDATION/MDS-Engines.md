# MDS-Engines — Motores, Modelagem, Banco de Dados e Comunicação

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 2 de 4 do MDS

---

# PARTE II — IMPLEMENTAÇÃO DOS MOTORES

---

## 1. Natural Language Understanding (NLU)

```typescript
// packages/core/intent/nlu-engine.ts

@Injectable()
export class NLUEngine {
  constructor(
    private readonly llm:    LLMProvider,
    private readonly memory: MemoryEngine,
  ) {}

  async understand(raw: string, ctx: RequestContext): Promise<NLUResult> {
    const memoryCtx = await this.memory.getRelevant(ctx.userId, raw);

    const result = await this.llm.complete({
      model:  "gemini_3_flash",               // padrão — custo baixo
      prompt: this.buildNLUPrompt(raw, memoryCtx, ctx),
      schema: NLUResultSchema,                 // resposta JSON estruturada
    });

    return NLUResultSchema.parse(result);
  }

  private buildNLUPrompt(raw: string, mem: MemoryContext, ctx: RequestContext): string {
    return `
Você é o módulo de compreensão de linguagem natural do MemoryOS.
Idioma: ${ctx.language ?? "pt-BR"}.
Contexto recente do usuário: ${JSON.stringify(mem.recentGoals.slice(0, 5))}.
Entidades conhecidas: ${JSON.stringify(mem.knownEntities.slice(0, 10))}.

Texto do usuário: "${raw}"

Classifique com precisão:
- domain: domínio principal (TRAVEL, FINANCE, COMMUNICATION, ENTERPRISE, BLOCKCHAIN, HEALTH...)
- subDomain: sub-domínio específico
- confidence: 0.0 a 1.0
- entities: entidades detectadas (pessoas, lugares, valores, datas...)
- ambiguous: true se precisar de clarificação
- language: idioma detectado
    `.trim();
  }
}
```

## 2. Intent Engine

```typescript
// packages/core/intent/intent-engine.ts

@Injectable()
export class IntentEngine {
  constructor(
    private readonly nlu:     NLUEngine,
    private readonly context: ContextEngine,
    private readonly memory:  MemoryEngine,
    private readonly events:  UniversalEventBus,
  ) {}

  async process(raw: string, ctx: RequestContext): Promise<IntentResult> {
    const enrichedCtx  = await this.context.enrich(ctx);
    const nluResult    = await this.nlu.understand(raw, enrichedCtx);

    if (nluResult.ambiguous && !ctx.skipClarification) {
      return { ...nluResult, requiresClarification: true,
               clarificationQuestion: this.buildClarification(nluResult) };
    }

    const intent: IntentResult = {
      intentId:    generateId("int"),
      rawText:     raw,
      normalized:  nluResult.normalized,
      domain:      nluResult.domain,
      subDomain:   nluResult.subDomain,
      confidence:  nluResult.confidence,
      entities:    nluResult.entities,
      language:    nluResult.language,
      context:     enrichedCtx,
      detectedAt:  new Date().toISOString(),
    };

    await this.events.publish("intent.processed", { intentId: intent.intentId, domain: intent.domain });
    return intent;
  }
}
```

## 3. Goal Engine (MGIS Implementation)

```typescript
// packages/mgis/engine/goal-engine.ts

@Injectable()
export class GoalEngine {
  constructor(
    private readonly decomposer:      GoalDecomposer,
    private readonly prioritizer:     GoalPrioritizer,
    private readonly conflictResolver: GoalConflictResolver,
    private readonly stateMachine:    GoalStateMachine,
    private readonly memory:          GoalMemoryManager,
    private readonly registry:        GoalRegistry,
    private readonly specialists:     SpecialistBus,
    private readonly policy:          PolicyEngine,
    private readonly events:          UniversalEventBus,
  ) {}

  async processIntent(intent: IntentResult, ctx: GoalContext): Promise<GoalPlan> {
    // 1. Verificar padrão similar na memória (evita decomposição redundante)
    const cached = await this.memory.findSimilarPlan(intent, ctx.userId);
    if (cached && cached.similarity > 0.88) return this.adaptCachedPlan(cached, ctx);

    // 2. Criar Goal raiz
    const root = GoalFactory.create(intent, ctx);

    // 3. Consultar Policy antes de qualquer coisa
    const policyResult = await this.policy.evaluate(root, ctx);
    if (!policyResult.allowed && policyResult.type === "HARD_BLOCK") {
      return this.buildBlockedPlan(root, policyResult);
    }

    // 4. Consultar Specialists para enriquecer a decomposição
    const insights = await this.specialists.consult(root);

    // 5. Decompor
    const decomp = await this.decomposer.decompose(root, ctx, insights);

    // 6. Detectar e resolver conflitos com goals ativos
    const active    = await this.memory.getActive(ctx.userId);
    const conflicts = this.conflictResolver.detect([...active, root]);
    const resolutions = conflicts.map(c => this.conflictResolver.resolve(c));

    // 7. Priorizar todos os subgoals
    const prioritized = this.prioritizer.prioritize(decomp.allGoals, ctx);

    // 8. Construir e persistir o GoalPlan
    const plan = this.buildPlan(root, decomp, prioritized, resolutions, ctx);
    await this.memory.save(plan);
    await this.stateMachine.transition(root.goalId, GoalState.WAITING);
    await this.events.publish("goal.created", { goalId: plan.goalPlanId, domain: root.ontologyDomain });

    return plan;
  }

  // GoalStateMachine — transições válidas (MGIS §6.2)
  private validateTransition(from: GoalState, to: GoalState): void {
    const allowed: Record<GoalState, GoalState[]> = {
      CREATED:    ["CLARIFYING", "WAITING"],
      CLARIFYING: ["WAITING"],
      WAITING:    ["BLOCKED", "PLANNING"],
      BLOCKED:    ["PLANNING", "CANCELLED"],
      PLANNING:   ["APPROVED"],
      APPROVED:   ["EXECUTING"],
      EXECUTING:  ["PAUSED", "COMPLETED", "FAILED"],
      PAUSED:     ["EXECUTING", "CANCELLED"],
      FAILED:     ["RECOVERING", "CANCELLED"],
      RECOVERING: ["EXECUTING"],
      COMPLETED:  ["ARCHIVED"],
      CANCELLED:  [],
      ARCHIVED:   [],
    };
    if (!allowed[from].includes(to)) {
      throw new InvalidGoalTransitionError(from, to);
    }
  }
}
```

## 4. Memory Engine

```typescript
// packages/core/memory/memory-engine.ts

@Injectable()
export class MemoryEngine {
  constructor(
    private readonly store:      MemoryStore,           // PostgreSQL
    private readonly vector:     VectorIndexManager,    // pgvector
    private readonly embedder:   EmbeddingProvider,     // text-embedding-3-small
    private readonly lifecycle:  MemoryLifecycleManager,
    private readonly dedup:      MemoryDeduplicator,
    private readonly events:     UniversalEventBus,
  ) {}

  async store(proposal: MemoryUpdateProposal): Promise<MemoryRecord> {
    MemoryUpdateProposalSchema.parse(proposal);

    // Deduplicação semântica
    const embedding   = await this.embedder.embed(proposal.content);
    const duplicates  = await this.vector.findSimilar(proposal.userId, embedding, 5, 0.95);
    if (duplicates.length > 0) return this.dedup.merge(duplicates[0], proposal);

    const record = await this.store.create({
      ...proposal,
      embedding,
      memoryTier:  "active",
      confidence:  proposal.confidence ?? 1.0,
      expiresAt:   this.lifecycle.computeExpiry(proposal),
    });

    await this.vector.index(record.id, record.userId, embedding);
    await this.events.publish("memory.fact.stored", { recordId: record.id, type: proposal.type });
    return record;
  }

  async retrieve(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const embedding = await this.embedder.embed(query.text);
    const results   = await this.vector.searchSimilar(query.userId, embedding, query.limit ?? 20);
    return results.filter(r => r.similarity >= (query.minSimilarity ?? 0.70));
  }

  async getRelevant(userId: string, context: string): Promise<MemoryContext> {
    const embedding   = await this.embedder.embed(context);
    const facts       = await this.vector.searchSimilar(userId, embedding, 20);
    const recentGoals = await this.store.getRecentGoals(userId, 10);
    const entities    = await this.store.getKnownEntities(userId, 10);
    return { facts, recentGoals, knownEntities: entities };
  }
}
```

## 5. Planner

```typescript
// packages/core/planner/planner.ts

@Injectable()
export class Planner {
  async buildExecutionPlan(
    goalPlan:  GoalPlan,
    mcis:      MCISRuntime,
  ): Promise<ExecutionPlan> {
    const steps: ExecutionStep[] = [];

    for (const pg of goalPlan.prioritizedGoals) {
      const caps = await mcis.discoverForGoal(pg);
      steps.push({
        stepId:       generateId("stp"),
        goalId:       pg.goalId,
        order:        steps.length + 1,
        connectorId:  caps[0]?.connectorId,
        action:       caps[0]?.name,
        inputMapping: this.resolveInputMapping(pg, steps),
        outputMapping: this.resolveOutputMapping(pg),
        parallel:     this.canParallelize(pg, steps),
        timeoutMs:    (caps[0]?.estimatedCostMs ?? 5000) * 3,
        retryPolicy:  DEFAULT_RETRY_POLICY,
        dependsOn:    this.resolveDependencies(pg, steps),
        onFailure:    pg.critical ? "ABORT" : "SKIP",
      });
    }

    const sorted = this.topologicalSort(steps);
    return {
      planId:         generateId("pln"),
      goalPlanId:     goalPlan.goalPlanId,
      steps:          sorted,
      parallelGroups: this.buildParallelGroups(sorted),
      criticalPath:   this.computeCriticalPath(sorted),
      estimatedMs:    this.estimateDuration(sorted),
      createdAt:      new Date().toISOString(),
    };
  }

  /** Kahn's algorithm — respeitando dependências declaradas */
  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    const inDegree = new Map(steps.map(s => [s.stepId, s.dependsOn?.length ?? 0]));
    const adj      = new Map<string, string[]>();
    for (const s of steps) {
      for (const dep of s.dependsOn ?? []) {
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(s.stepId);
      }
    }
    const queue  = steps.filter(s => inDegree.get(s.stepId) === 0);
    const sorted: ExecutionStep[] = [];
    while (queue.length > 0) {
      const s = queue.shift()!;
      sorted.push(s);
      for (const next of adj.get(s.stepId) ?? []) {
        inDegree.set(next, inDegree.get(next)! - 1);
        if (inDegree.get(next) === 0) queue.push(steps.find(x => x.stepId === next)!);
      }
    }
    if (sorted.length !== steps.length) throw new CircularDependencyError();
    return sorted;
  }
}
```

## 6. MCIS Runtime

```typescript
// packages/mcis/runtime/mcis-runtime.ts

@Injectable()
export class MCISRuntime {
  constructor(
    private readonly capabilityReg: CapabilityRegistry,
    private readonly entityReg:     EntityRegistry,
    private readonly actionReg:     ActionRegistry,
    private readonly eventReg:      EventRegistry,
    private readonly workflowReg:   WorkflowRegistry,
    private readonly graph:         CapabilityGraph,
    private readonly selection:     ConnectorSelectionEngine,
    private readonly hotPlug:       HotPlugManager,
  ) {}

  async discoverForGoal(goal: PrioritizedGoal): Promise<RankedCapability[]> {
    const candidates = await this.capabilityReg.findBySemanticVerb(goal.semanticVerb);
    const filtered   = candidates.filter(c => this.graph.isReachable(c.capabilityId, goal.ontologyDomain));
    return this.selection.rank(filtered, goal.context);
  }

  async register(connector: MemoryOSConnector): Promise<void> {
    const desc = connector.describe();
    this.validate(desc);
    await Promise.all([
      this.capabilityReg.registerBatch(desc.capabilities),
      this.entityReg.registerBatch(desc.entities),
      this.actionReg.registerBatch(desc.actions),
      this.eventReg.registerBatch(desc.events),
      this.workflowReg.registerBatch(desc.workflows),
    ]);
    this.graph.addEdges(desc.capabilities);
    await this.hotPlug.emit("CONNECTOR_HOT_PLUGGED", { connectorId: desc.identity.connectorId });
  }
}
```

## 7. Execution Engine

```typescript
// packages/connectors/runtime/execution-engine.ts

@Injectable()
export class ExecutionEngine {
  constructor(
    private readonly manager:  ConnectorManager,
    private readonly cb:       CircuitBreakerRegistry,
    private readonly metrics:  MetricsCollector,
    private readonly events:   UniversalEventBus,
  ) {}

  async execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionResult> {
    const results: StepResult[] = [];
    const state  = new ExecutionState();

    for (const group of plan.parallelGroups) {
      const groupResults = group.length === 1
        ? [await this.executeStep(group[0], state, ctx)]
        : await Promise.allSettled(group.map(s => this.executeStep(s, state, ctx)))
            .then(rs => rs.map((r, i) =>
              r.status === "fulfilled" ? r.value
                : { stepId: group[i].stepId, status: "FAILED" as const, error: String(r.reason) }
            ));

      for (const r of groupResults) {
        results.push(r);
        if (r.status === "COMPLETED" && r.output) state.set(r.stepId, r.output);
        if (r.status === "FAILED" && group.find(s => s.stepId === r.stepId)?.onFailure === "ABORT") {
          return { planId: plan.planId, status: "FAILED", results, failedAt: r.stepId };
        }
      }
    }

    await this.events.publish("execution.completed", { planId: plan.planId });
    return { planId: plan.planId, status: "COMPLETED", results };
  }

  private async executeStep(step: ExecutionStep, state: ExecutionState, ctx: ExecutionContext): Promise<StepResult> {
    const breaker = this.cb.get(step.connectorId!);
    if (breaker.isOpen()) {
      const fallback = await this.manager.getFallback(step.connectorId!);
      if (!fallback) return { stepId: step.stepId, status: "FAILED", error: "CIRCUIT_OPEN_NO_FALLBACK" };
      return this.executeStep({ ...step, connectorId: fallback.connectorId }, state, ctx);
    }

    const connector = await this.manager.get(step.connectorId!);
    const input     = state.resolve(step.inputMapping);
    const t0        = Date.now();

    try {
      const output = await withTimeout(
        connector.execute({ action: step.action!, input, context: ctx }),
        step.timeoutMs
      );
      breaker.recordSuccess();
      this.metrics.record(step.connectorId!, Date.now() - t0, "SUCCESS");
      await this.events.publish("execution.step.completed", { stepId: step.stepId });
      return { stepId: step.stepId, status: "COMPLETED", output };
    } catch (err) {
      breaker.recordFailure();
      this.metrics.record(step.connectorId!, Date.now() - t0, "FAILED");
      if (step.retryPolicy?.maxAttempts > 0) return this.retryStep(step, state, ctx, err, 1);
      return { stepId: step.stepId, status: "FAILED", error: String(err) };
    }
  }
}
```

## 8. Policy Engine

```typescript
@Injectable()
export class PolicyEngine {
  async evaluate(goal: Goal, ctx: GoalContext): Promise<PolicyResult> {
    const checks = await Promise.all([
      this.checkAuthorization(goal, ctx),
      this.checkAgeRestriction(goal, ctx),
      this.checkBudgetLimit(goal, ctx),
      this.checkApprovalRequired(goal, ctx),
      this.checkRegulatoryCompliance(goal, ctx),
      this.checkTimeWindow(goal, ctx),
      this.checkConnectorPermissions(goal, ctx),
      this.checkTenantPolicy(goal, ctx),
    ]);

    const blocked = checks.find(c => c.result === "HARD_BLOCK");
    if (blocked) return { allowed: false, type: "HARD_BLOCK", reason: blocked.reason };

    const pending = checks.find(c => c.result === "PENDING_APPROVAL");
    if (pending) return { allowed: false, type: "PENDING_APPROVAL", reason: pending.reason,
                          approvalTemplate: pending.approvalTemplate };

    return { allowed: true };
  }
}
```

## 9. Event Bus (UEB)

```typescript
// Kafka-backed Universal Event Bus

@Injectable()
export class UniversalEventBus {
  async publish(eventType: string, payload: unknown): Promise<void> {
    await this.kafka.producer.send({
      topic:    this.topicFor(eventType),
      messages: [{
        key:   generateId("evt"),
        value: JSON.stringify({ type: eventType, payload, ts: Date.now() }),
      }],
    });
  }

  subscribe(eventType: string, handler: EventHandler): UnsubscribeFn {
    const consumer = this.kafka.consumer({ groupId: `${this.serviceId}.${eventType}` });
    consumer.subscribe({ topic: this.topicFor(eventType) });
    consumer.run({ eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value!.toString());
      await handler(event);
    }});
    return () => consumer.disconnect();
  }

  // Para notificações internas de baixa latência (< 10ms): Redis PubSub
  publishLocal(channel: string, payload: unknown): void {
    this.redis.publish(channel, JSON.stringify(payload));
  }

  private topicFor(eventType: string): string {
    return `memoryos.${eventType.replace(/\./g, ".")}`;
  }
}
```

---

# PARTE III — MODELAGEM

---

## 10. Domain Model — Aggregates, Commands, Events, Repositories

```typescript
// ─── AGGREGATE ────────────────────────────────────────────────────────────

export class GoalAggregate {
  private _events: DomainEvent[] = [];

  constructor(private state: Goal) {}

  get id()            { return this.state.goalId; }
  get domainEvents()  { return [...this._events]; }
  clearEvents()       { this._events = []; }
  snapshot(): Goal    { return Object.freeze({ ...this.state }); }

  transition(to: GoalState): void {
    GoalStateMachine.assertValid(this.state.state, to);
    const from        = this.state.state;
    this.state        = { ...this.state, state: to };
    this._events.push(new GoalStateChangedEvent(this.state.goalId, from, to));
  }
}

// ─── FACTORY ──────────────────────────────────────────────────────────────

export class GoalFactory {
  static create(intent: IntentResult, ctx: GoalContext): GoalAggregate {
    return new GoalAggregate({
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
    });
  }
}

// ─── REPOSITORY ───────────────────────────────────────────────────────────

export interface GoalRepository {
  findById(id: string): Promise<GoalAggregate | null>;
  findByUserId(userId: string, filter?: GoalFilter): Promise<GoalAggregate[]>;
  findActiveByUserId(userId: string): Promise<GoalAggregate[]>;
  save(aggregate: GoalAggregate): Promise<void>;
  delete(id: string): Promise<void>;
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────

export interface CreateGoalCommand   { type: "CREATE_GOAL";   intentId: string; userId: string; context: GoalContext; }
export interface ExecuteGoalCommand  { type: "EXECUTE_GOAL";  goalId: string;   userId: string; immediate: boolean; }
export interface PauseGoalCommand    { type: "PAUSE_GOAL";    goalId: string;   userId: string; reason: string; }
export interface CancelGoalCommand   { type: "CANCEL_GOAL";   goalId: string;   userId: string; reason: string; }

// ─── QUERIES ──────────────────────────────────────────────────────────────

export interface ListActiveGoalsQuery  { userId: string; orgId?: string; limit: number; offset: number; }
export interface GetGoalDetailsQuery   { goalId: string; userId: string; }
export interface SearchGoalsQuery      { userId: string; text: string; domain?: string; limit: number; }

// ─── DOMAIN EVENTS ────────────────────────────────────────────────────────

export class GoalCreatedEvent implements DomainEvent {
  readonly type = "goal.created";
  readonly ts   = new Date().toISOString();
  constructor(readonly goalId: string, readonly userId: string, readonly domain: string) {}
}

export class GoalStateChangedEvent implements DomainEvent {
  readonly type = "goal.state_changed";
  readonly ts   = new Date().toISOString();
  constructor(readonly goalId: string, readonly from: GoalState, readonly to: GoalState) {}
}

export class GoalCompletedEvent implements DomainEvent {
  readonly type = "goal.completed";
  readonly ts   = new Date().toISOString();
  constructor(readonly goalId: string, readonly userId: string, readonly durationMs: number) {}
}

// ─── ERROR HIERARCHY ──────────────────────────────────────────────────────

export class MemoryOSError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number = 500,
    readonly retryable: boolean = false,
  ) { super(message); this.name = this.constructor.name; }
}

export class IntentAmbiguousError    extends MemoryOSError { constructor() { super("Intenção ambígua", "INTENT_AMBIGUOUS", 422, false); } }
export class GoalNotFoundError       extends MemoryOSError { constructor(id: string) { super(`Goal '${id}' não encontrado`, "GOAL_NOT_FOUND", 404, false); } }
export class GoalBlockedError        extends MemoryOSError { constructor(r: string) { super(r, "GOAL_BLOCKED_BY_POLICY", 403, false); } }
export class ConnectorTimeoutError   extends MemoryOSError { constructor(id: string, ms: number) { super(`Timeout ${id} após ${ms}ms`, "CONNECTOR_TIMEOUT", 504, true); } }
export class ConnectorRateLimitError extends MemoryOSError { constructor(id: string) { super(`Rate limit ${id}`, "CONNECTOR_RATE_LIMIT", 429, true); } }
export class CircuitBreakerOpenError extends MemoryOSError { constructor(id: string) { super(`Circuit OPEN ${id}`, "CIRCUIT_BREAKER_OPEN", 503, true); } }
export class InvalidGoalTransitionError extends MemoryOSError { constructor(f: string, t: string) { super(`Transição inválida: ${f} → ${t}`, "INVALID_GOAL_TRANSITION", 409, false); } }
```

---

# PARTE IV — BANCO DE DADOS

---

## 11. Schema PostgreSQL Oficial

```sql
-- ─── EXTENSION ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- text search

-- ─── TENANTS ───────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('PERSONAL','ENTERPRISE')),
  name        VARCHAR(255) NOT NULL,
  plan        VARCHAR(50)  NOT NULL DEFAULT 'FREE',
  sso_config  JSONB        NOT NULL DEFAULT '{}',
  settings    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── USERS ─────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL UNIQUE,
  full_name   VARCHAR(255),
  role        VARCHAR(50)  NOT NULL DEFAULT 'user',
  age         SMALLINT,
  country     VARCHAR(10),
  language    VARCHAR(10)  NOT NULL DEFAULT 'pt-BR',
  preferences JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- ─── GOALS ─────────────────────────────────────────────────────────────────
CREATE TABLE goals (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id),
  intent_id       UUID,
  parent_goal_id  UUID         REFERENCES goals(id),
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  ontology_domain VARCHAR(100) NOT NULL,
  complexity      VARCHAR(20)  NOT NULL,
  horizon         VARCHAR(20)  NOT NULL,
  state           VARCHAR(30)  NOT NULL DEFAULT 'CREATED',
  priority        SMALLINT     NOT NULL DEFAULT 5,
  context         JSONB        NOT NULL DEFAULT '{}',
  constraints     JSONB        NOT NULL DEFAULT '[]',
  dependencies    JSONB        NOT NULL DEFAULT '[]',
  target_date     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_goals_user_state   ON goals(user_id, state);
CREATE INDEX idx_goals_tenant       ON goals(tenant_id);
CREATE INDEX idx_goals_parent       ON goals(parent_goal_id);

-- ─── MEMORY RECORDS ────────────────────────────────────────────────────────
CREATE TABLE memory_records (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES users(id),
  tenant_id    UUID          NOT NULL REFERENCES tenants(id),
  content      TEXT          NOT NULL,
  type         VARCHAR(50)   NOT NULL,  -- FACT | EVENT | PREFERENCE | DECISION | ENTITY
  memory_tier  VARCHAR(20)   NOT NULL DEFAULT 'active',
  confidence   FLOAT         NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  embedding    vector(1536),
  source_type  VARCHAR(50),
  source_id    UUID,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_memory_user_tier   ON memory_records(user_id, memory_tier);
CREATE INDEX idx_memory_embedding   ON memory_records
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_memory_content_trgm ON memory_records USING gin (content gin_trgm_ops);

-- ─── CONNECTOR REGISTRATIONS ───────────────────────────────────────────────
CREATE TABLE connector_registrations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id         VARCHAR(100) NOT NULL UNIQUE,
  connector_name       VARCHAR(255) NOT NULL,
  vendor               VARCHAR(100) NOT NULL,
  version              VARCHAR(20)  NOT NULL,
  category             VARCHAR(50)  NOT NULL,
  connector_type       VARCHAR(30)  NOT NULL,
  status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  manifest             JSONB        NOT NULL,
  self_description     JSONB        NOT NULL,
  certification_level  VARCHAR(20)  NOT NULL DEFAULT 'COMMUNITY',
  tags                 TEXT[]       NOT NULL DEFAULT '{}',
  registered_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_connector_status   ON connector_registrations(status);
CREATE INDEX idx_connector_category ON connector_registrations(category);

-- ─── CONNECTOR CREDENTIALS ────────────────────────────────────────────────
CREATE TABLE connector_credentials (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id),
  connector_id    VARCHAR(100) NOT NULL,
  access_token    TEXT         NOT NULL,   -- AES-256 encrypted
  refresh_token   TEXT,                    -- AES-256 encrypted
  scopes          TEXT[]       NOT NULL DEFAULT '{}',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, connector_id)
);

-- ─── EXECUTION PLANS ──────────────────────────────────────────────────────
CREATE TABLE execution_plans (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_plan_id  UUID        NOT NULL,
  user_id       UUID        NOT NULL REFERENCES users(id),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  steps         JSONB       NOT NULL DEFAULT '[]',
  result        JSONB,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
SELECT partman.create_parent('public.execution_plans', 'created_at', 'native', 'weekly');

-- ─── AUDIT LOG (APPEND-ONLY + HASH CHAIN) ──────────────────────────────────
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
  hash        CHAR(64)     NOT NULL,   -- SHA-256(prev_hash + entry_data)
  prev_hash   CHAR(64),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
SELECT partman.create_parent('public.audit_logs', 'created_at', 'native', 'monthly');
-- Regra: nunca DELETE ou UPDATE nesta tabela (trigger de proteção)
```

## 12. Estratégia de Escalabilidade

```
SHARDING (horizontal):
  Chave: tenant_id (Enterprise) | user_id hash (Personal)
  Shards mínimo: 16 (configurável via Citus ou PgBouncer)
  Routing: hash ring consistente → sem resharding frequente

READ REPLICAS:
  1 primary (writes) + 2 read replicas mínimo
  memory_records selects → sempre em replica
  audit_logs inserts → primary com batch commit

CONNECTION POOLING:
  PgBouncer: pool_mode = transaction
  max_client_conn = 1000 | default_pool_size = 25 por shard

PARTICIONAMENTO NATIVO:
  audit_logs:      RANGE por created_at (mensal)
  execution_plans: RANGE por created_at (semanal)
  memory_records:  LIST por memory_tier (active/historical/archived)

BACKUP E RECOVERY:
  WAL archiving contínuo → S3 com retenção de 30 dias
  pg_basebackup diário (snapshot completo)
  PITR: < 5 minutos (RPO) | restore em < 1 hora (RTO)
  Testes de restore automatizados semanalmente

MULTI-TENANT ISOLATION:
  Nível lógico: WHERE tenant_id = $1 em todas as queries
  Nível físico (Enterprise Plus): schema separado por org
  Row-Level Security habilitado em tabelas críticas
```

---

# PARTE V — COMUNICAÇÃO

---

## 13. REST API — Contratos Oficiais

```
BASE URL: https://api.memoryos.ai/v1

AUTENTICAÇÃO:
  Authorization: Bearer <jwt_access_token>
  Refresh: POST /v1/auth/refresh { refresh_token }

ENDPOINTS CORE:
  POST   /v1/process             → processa intent → GoalPlan → inicia execução
  GET    /v1/goals               → lista goals do usuário (paginado)
  GET    /v1/goals/:id           → detalhe completo do goal
  PATCH  /v1/goals/:id/state     → { state: "PAUSED" | "CANCELLED" }
  GET    /v1/goals/:id/execution → status da execução em tempo real

MEMÓRIA:
  GET    /v1/memory              → busca semântica  ?q=texto&limit=20
  POST   /v1/memory              → adiciona fato manualmente
  DELETE /v1/memory/:id          → remove (LGPD: direito ao esquecimento)
  GET    /v1/memory/export       → exportação completa (LGPD: portabilidade)

CONNECTORS:
  GET    /v1/connectors                → lista disponíveis com status
  POST   /v1/connectors/:id/connect   → inicia OAuth
  GET    /v1/connectors/oauth/callback → callback OAuth (redirect)
  DELETE /v1/connectors/:id/disconnect → desconecta
  GET    /v1/connectors/:id/health    → status de saúde

MARKETPLACE:
  GET    /v1/marketplace/connectors   → catálogo público
  POST   /v1/marketplace/install      → instala plugin { pluginId }
  DELETE /v1/marketplace/uninstall/:id → desinstala

PADRÃO DE RESPOSTA:
  { data: T, meta: { requestId, duration, version }, error: null }
  { data: null, meta: { requestId }, error: { code, message, retryable } }

HTTP STATUS:
  200 OK | 201 Created | 204 No Content
  400 Bad Request | 401 Unauthorized | 403 Forbidden
  404 Not Found | 409 Conflict | 422 Unprocessable Entity
  429 Too Many Requests | 500 Internal Server Error | 503 Service Unavailable
```

## 14. WebSocket — Protocolo de Real-time

```typescript
// wss://api.memoryos.ai/v1/stream

// HANDSHAKE:
// Client → { type: "AUTH", token: "<jwt>" }
// Server → { type: "AUTH_OK", sessionId: "...", userId: "..." }
// ou:
// Server → { type: "AUTH_FAIL", reason: "..." }

// EVENTOS DO SERVIDOR → CLIENTE:
{ type: "goal.state_changed",     data: { goalId, from, to, at } }
{ type: "execution.step",         data: { planId, stepId, status, output, connectorId } }
{ type: "execution.completed",    data: { planId, status, durationMs } }
{ type: "memory.updated",         data: { recordId, type, content } }
{ type: "notification",           data: { id, severity, title, message, goalId? } }
{ type: "connector.status",       data: { connectorId, status, latencyMs } }

// COMANDOS DO CLIENTE → SERVIDOR:
{ type: "PAUSE_GOAL",  goalId: "..." }
{ type: "RESUME_GOAL", goalId: "..." }
{ type: "CANCEL_GOAL", goalId: "...", reason: "..." }
{ type: "PING" }                        // heartbeat (resposta: PONG)

// RECONEXÃO:
// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
// Replay de eventos perdidos via: { type: "REPLAY", since: "<iso-timestamp>" }
```

## 15. Rate Limits, Retry e Timeout

```typescript
// Rate limits por plano (por minuto, sliding window)
const RATE_LIMITS = {
  FREE:           { requestsPerMin: 60,   tokensPerMin: 10_000  },
  PRO:            { requestsPerMin: 600,  tokensPerMin: 100_000 },
  ENTERPRISE:     { requestsPerMin: 6000, tokensPerMin: 1_000_000 },
} as const;

// Headers de resposta quando rate-limited:
// Retry-After: 30
// X-RateLimit-Limit: 60
// X-RateLimit-Remaining: 0
// X-RateLimit-Reset: <unix-timestamp>

// Retry policy padrão
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts:     3,
  initialDelayMs:  500,
  backoffFactor:   2.0,       // exponential
  jitterMs:        200,       // evita thundering herd
  maxDelayMs:      10_000,
  retryableCodes:  ["CONNECTOR_TIMEOUT", "CONNECTOR_RATE_LIMIT", "CIRCUIT_BREAKER_OPEN"],
};

// Circuit Breaker padrão por Connector
const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold:  5,        // OPEN após 5 falhas consecutivas
  successThreshold:  2,        // CLOSE após 2 successos no HALF_OPEN
  timeoutMs:        30_000,    // HALF_OPEN após 30s
};
```

---

**Documento Oficial:** MDS-Engines  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 2 de 4 do MDS