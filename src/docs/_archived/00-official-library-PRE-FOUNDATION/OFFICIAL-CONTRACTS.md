# OFFICIAL-CONTRACTS.md
# MemoryOS — Contratos Públicos Oficiais Congelados
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN

> Contratos congelados não podem ser alterados sem ADR aprovada por humano.
> Contratos marcados [PENDING] aguardam resolução de ADR.

---

## Convenção de Tipos

```typescript
// Tipos base reutilizados em múltiplos contratos

type GoalStatus   = "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED"
type EntryStatus  = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "REMOVED"
type HealthStatus = "SUCCESS" | "DEGRADED" | "FAILED"
type Verdict      = "APPROVED" | "REJECTED" | "INCONCLUSIVE"
type Importance   = "critical" | "high" | "medium" | "low"
type MemoryType   = "fact" | "decision" | "preference" | "pattern" | "event"
```

---

## EF-01 · Goal Runtime v0.1

**Status do contrato:** Official · Pending (promoção v1.0 via EF-24)

```typescript
interface GoalRuntime {
  createGoal(input: GoalInput): Goal
  getGoal(id: string): Goal | null
  updateStatus(id: string, status: GoalStatus): Goal
  listGoals(filter?: GoalFilter): Goal[]
  deleteGoal(id: string): boolean
  health(): HealthReport
  metrics(): GoalMetrics
  statistics(): GoalStatistics
}

interface Goal {
  id: string
  type: string
  priority: number
  status: GoalStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

---

## EF-02 · Goal Registry Service v1.0

**Status do contrato:** Official · Frozen

```typescript
interface GoalRegistryService {
  register(goal: Goal): RegistrationResult
  get(id: string): Goal | null
  list(filter?: GoalFilter): Goal[]
  update(id: string, data: Partial<Goal>): Goal
  delete(id: string): boolean
  statistics(): RegistryStatistics
  health(): HealthReport
}
```

---

## EF-03 · Goal Scheduler v1.0

**Status do contrato:** Official · Frozen

```typescript
interface GoalScheduler {
  schedule(goal: Goal, options?: ScheduleOptions): ScheduledGoal
  cancel(goalId: string): boolean
  getScheduled(goalId: string): ScheduledGoal | null
  listScheduled(filter?: ScheduleFilter): ScheduledGoal[]
  health(): HealthReport
  metrics(): SchedulerMetrics
}

// RESTRIÇÃO ARQUITETURAL: Apenas PATH B (background)
// Não invocar em path interativo (latência inaceitável)
```

---

## EF-04 · Goal Execution Queue v1.0

**Status do contrato:** Official · Frozen

```typescript
interface GoalExecutionQueue {
  enqueue(goal: Goal): ExecutionQueueEntry
  dequeue(): ExecutionQueueEntry | null
  peek(): ExecutionQueueEntry | null
  remove(queueId: string): boolean
  list(): ExecutionQueueEntry[]
  statistics(): QueueStatistics
  health(): HealthReport
  clear(): void
}

interface ExecutionQueueEntry {
  queueId: string
  goalId: string
  priority: number
  enqueueTime: string
  status: EntryStatus
  attempts: number
}

// RESTRIÇÃO ARQUITETURAL: Apenas PATH B (background)
// Ordering: Priority DESC → enqueueTime ASC (FIFO tiebreak)
```

---

## EF-05 · Execution Dispatcher v1.0

**Status do contrato:** Official · Frozen

```typescript
interface ExecutionDispatcher {
  dispatch(goal: Goal): DispatchResult
  dispatchReadyGoals(): DispatchResult[]
  cancelDispatch(goalId: string): boolean
  getDispatchStatus(goalId: string): DispatchStatus
  health(): HealthReport
  metrics(): DispatcherMetrics
}

// RESTRIÇÃO ARQUITETURAL: Apenas PATH B (background)
```

---

## EF-06 · Decision Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface DecisionEngine {
  decide(input: DecisionInput): ExecutionDecision
  evaluate(candidates: Candidate[]): EvaluationResult[]
  selectCandidate(evaluated: EvaluationResult[]): Candidate
  health(): HealthReport
  metrics(): DecisionMetrics
}

interface DecisionInput {
  goal: Goal
  context: Record<string, unknown>
  candidates: Candidate[]
}

interface ExecutionDecision {
  selectedCandidate: Candidate
  confidence: number
  risk: "low" | "medium" | "high"
  reasoning: string
}
```

---

## EF-07 · Planning Engine v1.0

**Status do contrato:** Official · Frozen
**Nota ADR-003:** O objeto `plan` no produto (analytics) será renomeado para `executionMetrics` após aprovação de ADR-003. Este contrato não é afetado — `ExecutionPlan` é o tipo exclusivo do Planning Engine.

```typescript
interface PlanningEngine {
  plan(decision: ExecutionDecision): ExecutionPlan
  createPlan(input: PlanInput): ExecutionPlan
  health(): HealthReport
  metrics(): PlanningMetrics
}

interface ExecutionPlan {
  id: string
  goalId: string
  steps: PlanStep[]
  complexity: "simple" | "moderate" | "complex"
  estimatedMs: number
  risk: "low" | "medium" | "high"
  status: "pending" | "active" | "completed" | "failed"
  createdAt: string
}

interface PlanStep {
  id: string
  type: string
  input: Record<string, unknown>
  estimatedMs: number
  required: boolean
}
```

---

## EF-08 · Reflection Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface ReflectionEngine {
  evaluate(input: ReflectionInput): ReflectionResult
  reflect(executionResult: ExecutionResult, plan: ExecutionPlan): ReflectionResult
  health(): HealthReport
  metrics(): ReflectionMetrics
}

interface ReflectionInput {
  rawResponse: string
  plan: ExecutionPlan
  executionResult: ExecutionResult
}

interface ReflectionResult {
  verdict: Verdict
  confidence: number
  risk: "low" | "medium" | "high"
  cleanedResponse: string   // output de synthesizeResponse() incorporado
  evaluation: string
  suggestions: string[]
}
```

---

## EF-09 · Self Evaluation Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface SelfEvaluationEngine {
  evaluate(execution: CompletedExecution): SelfEvaluation
  score(execution: CompletedExecution): QualityScore
  health(): HealthReport
  metrics(): EvaluationMetrics
}

interface SelfEvaluation {
  id: string
  executionId: string
  qualityScore: number
  reliabilityScore: number
  performanceScore: number
  overallScore: number
  verdict: Verdict
  notes: string[]
}
```

---

## EF-10 · Knowledge Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface KnowledgeEngine {
  process(evaluations: SelfEvaluation[]): Knowledge[]
  filter(evaluations: SelfEvaluation[]): FilterResult
  health(): HealthReport
  metrics(): KnowledgeMetrics
  statistics(): KnowledgeStatistics
}

interface Knowledge {
  id: string
  sourceEvaluationId: string
  type: "fact" | "pattern" | "decision" | "preference"
  content: string
  importance: Importance
  confidence: number
  tags: string[]
  createdAt: string
}
```

---

## EF-11 · Learning Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface LearningEngine {
  learn(knowledge: Knowledge[]): Learning[]
  process(knowledge: Knowledge): Learning
  health(): HealthReport
  metrics(): LearningMetrics
  statistics(): LearningStatistics
}

interface Learning {
  id: string
  sourceKnowledgeId: string
  pattern: string
  strength: number
  applications: string[]
  createdAt: string
}
```

---

## EF-12 · Memory Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface MemoryEngine {
  store(learning: Learning): Memory
  storeMany(learnings: Learning[]): Memory[]
  retrieve(query: MemoryQuery): Memory[]
  health(): HealthReport
  metrics(): MemoryMetrics
  statistics(): MemoryStatistics
}

interface Memory {
  id: string
  sourceLearningId: string
  type: MemoryType
  content: string
  importance: Importance
  confidence: number
  tags: string[]
  createdAt: string
  // Imutável após criação — sem update
}
```

---

## EF-13 · Retrieval Engine v1.0

**Status do contrato:** Official · Frozen

```typescript
interface RetrievalEngine {
  retrieve(query: RetrievalQuery): RetrievalResult
  search(keywords: string[]): Memory[]
  findRelated(memoryId: string): Memory[]
  health(): HealthReport
  metrics(): RetrievalMetrics
}

interface RetrievalQuery {
  keywords: string[]
  types?: MemoryType[]
  limit?: number
  minConfidence?: number
}

interface RetrievalResult {
  memories: Memory[]
  totalFound: number
  searchDurationMs: number
}
```

---

## EF-14 · Capability Registry v1.0

**Status do contrato:** Official · Frozen

```typescript
interface CapabilityRegistry {
  register(capability: CapabilityDefinition): RegistrationResult
  get(capabilityId: string): CapabilityDefinition | null
  list(filter?: CapabilityFilter): CapabilityDefinition[]
  discover(goal: Goal): CapabilityDefinition[]
  health(): HealthReport
  metrics(): RegistryMetrics
}

interface CapabilityDefinition {
  id: string
  name: string
  description: string
  version: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  tags: string[]
}
```

---

## Contratos Pendentes (Reserved / Future)

### EF-22 · Intent Layer [PENDING — ADR-001]

```typescript
// Contrato preliminar — congelamento aguarda ADR-001 aprovada
interface IntentLayer {
  detect(message: string): IntentResult
}

interface IntentResult {
  intent_type: "query" | "command" | "reflection" | "unknown"
  query_types: Array<"tasks" | "decisions" | "documents" | "people" | "topics" | "knowledge" | "general">
  is_list_query: boolean
  search_keywords: string[]
  confidence: number
}
// Estratégia de implementação: aguarda ADR-001
```

---

### EF-21 · Conversation Engine [PENDING — Reserved]

```typescript
// Contrato derivado de runReasoningPlan() existente
// Congelamento após INT-07
interface ConversationEngine {
  process(input: ConversationInput): ConversationResult
  getOrCreateSession(userId: string, projectId?: string): ChatSession
}

interface ConversationResult {
  response: string
  sources: Source[]
  executionMetrics: ExecutionMetrics  // renomeado de 'plan' via ADR-003
}
```

---

*SPR-FREEZE-01 · 2026-07-11 · Status: OFFICIAL · FROZEN*
*Contratos congelados são imutáveis sem ADR aprovada.*