# MDS v1.2 — Capability Negotiation Engine — Especificação Completa

**Versão:** 1.2  
**Status:** Revisão Oficial — Adenda ao MDS v1.1  
**Data:** 2026-07-09  
**Tipo:** Aprofundamento Arquitetural (complementa, não substitui, não remove)  
**Alinhamento:** MAS 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0 · MDS v1.1

---

## Declaração de Revisão

Esta revisão aprofunda o **Capability Negotiation Engine** introduzido no MDS v1.1, consolidando seus contratos internos, modelos, interfaces, métricas e políticas com o mesmo nível de profundidade do restante do Manual Oficial de Engenharia.

**Não remove** nenhuma seção.  
**Não altera** nenhuma decisão existente.  
**Não modifica** MAS, MPS, MCF, MCIS, MGIS, MES.  
**Apenas complementa e aprofunda** a arquitetura já definida.

---

# REVISÃO 1 — CAPABILITY RANKING

---

## 1.1 Objetivo e Responsabilidades

O **CapabilityRanking** é o subsistema responsável por ordenar todos os candidatos de uma Capability antes da seleção final. Ele produz uma lista ordenada por score composto, garantindo que o Negotiation Engine sempre trabalhe com alternativas ranqueadas e auditáveis.

**Responsabilidades:**
- Receber lista bruta de `CapabilityCandidate[]` do MCIS Runtime
- Aplicar scoring multi-critério a cada candidato
- Ordenar em ordem decrescente de score total
- Marcar candidatos inelegíveis (health crítico, policy block, circuit aberto)
- Produzir `CapabilityRanking` imutável e auditável
- Publicar eventos de início e conclusão do ranking

## 1.2 Interface Principal

```typescript
// packages/core/negotiation/capability-ranking.ts

export interface ICapabilityRanking {
  rank(
    candidates:  CapabilityCandidate[],
    step:        ExecutionStep,
    ctx:         NegotiationContext
  ): Promise<RankedCapabilityList>;
}

export interface RankedCapabilityList {
  rankingId:   string;
  stepId:      string;
  planId:      string;
  ranked:      RankedCapability[];          // ordenado DESC por score.total
  ineligible:  IneligibleCapability[];      // excluídos antes do ranking
  totalCandidates: number;
  eligibleCount:   number;
  rankedAt:    string;
  durationMs:  number;
}

export interface RankedCapability {
  rank:        number;                      // 1 = melhor
  connectorId: string;
  connectorName: string;
  version:     string;
  score:       CapabilityScore;             // definido em MDS v1.1
  isPreferred: boolean;                     // preferência explícita de usuário/org
  isCertified: boolean;                     // MCIS certification status
  region:      string;
  estimatedCostMs: number;
  estimatedLatencyMs: number;
  sla:         SLAContract;
  tags:        string[];
}

export interface IneligibleCapability {
  connectorId: string;
  reason:      IneligibilityReason;
  code:        string;
}

export type IneligibilityReason =
  | "CIRCUIT_OPEN"
  | "HEALTH_CRITICAL"
  | "POLICY_BLOCKED"
  | "QUOTA_EXCEEDED"
  | "VERSION_INCOMPATIBLE"
  | "GEO_RESTRICTED"
  | "LICENSE_INVALID"
  | "MAINTENANCE_WINDOW";
```

## 1.3 Implementação

```typescript
@Injectable()
export class CapabilityRankingService implements ICapabilityRanking {
  constructor(
    private readonly scorer:       CapabilityScorer,
    private readonly eligibility:  EligibilityChecker,
    private readonly eventBus:     UniversalEventBus,
    private readonly metrics:      CapabilityMetrics,
  ) {}

  async rank(
    candidates: CapabilityCandidate[],
    step:       ExecutionStep,
    ctx:        NegotiationContext
  ): Promise<RankedCapabilityList> {
    const t0        = Date.now();
    const rankingId = generateId("rnk");

    await this.eventBus.publish("capability.rank_started", {
      rankingId, stepId: step.stepId, planId: ctx.planId,
      candidateCount: candidates.length,
    });

    // 1. Separar elegíveis de inelegíveis
    const { eligible, ineligible } = await this.eligibility.filter(candidates, ctx);

    // 2. Scoring paralelo de todos os elegíveis
    const scored = await Promise.all(
      eligible.map(c => this.scorer.score(c, step, ctx))
    );

    // 3. Ordenar decrescente por score.total, com tie-break determinístico
    const ranked = scored
      .sort((a, b) => {
        const diff = b.score.total - a.score.total;
        if (Math.abs(diff) > 0.001) return diff;
        // Tie-break 1: latência
        if (a.score.latencyScore !== b.score.latencyScore)
          return b.score.latencyScore - a.score.latencyScore;
        // Tie-break 2: disponibilidade histórica
        if (a.score.availScore !== b.score.availScore)
          return b.score.availScore - a.score.availScore;
        // Tie-break 3: nome (determinismo absoluto)
        return a.connectorId.localeCompare(b.connectorId);
      })
      .map((c, i) => ({ ...c, rank: i + 1 }));

    const result: RankedCapabilityList = {
      rankingId,
      stepId:          step.stepId,
      planId:          ctx.planId,
      ranked,
      ineligible,
      totalCandidates: candidates.length,
      eligibleCount:   eligible.length,
      rankedAt:        new Date().toISOString(),
      durationMs:      Date.now() - t0,
    };

    await this.eventBus.publish("capability.rank_completed", {
      rankingId, stepId: step.stepId,
      topConnectorId: ranked[0]?.connectorId,
      eligibleCount: eligible.length,
      ineligibleCount: ineligible.length,
      durationMs: result.durationMs,
    });

    this.metrics.recordRanking(result);
    return result;
  }
}
```

## 1.4 EligibilityChecker

```typescript
@Injectable()
export class EligibilityChecker {
  async filter(
    candidates: CapabilityCandidate[],
    ctx:        NegotiationContext
  ): Promise<{ eligible: CapabilityCandidate[]; ineligible: IneligibleCapability[] }> {
    const results = await Promise.all(candidates.map(c => this.check(c, ctx)));
    return {
      eligible:   results.filter(r => r.eligible).map(r => r.candidate),
      ineligible: results.filter(r => !r.eligible).map(r => ({
        connectorId: r.candidate.connectorId,
        reason: r.reason!,
        code:   r.code!,
      })),
    };
  }

  private async check(c: CapabilityCandidate, ctx: NegotiationContext) {
    // Circuit breaker aberto?
    if (await this.circuitBreaker.isOpen(c.connectorId))
      return { eligible: false, candidate: c, reason: "CIRCUIT_OPEN", code: "CB_OPEN" };

    // Health crítico (<50)?
    const health = await this.healthMonitor.get(c.connectorId);
    if (health.healthScore < 50)
      return { eligible: false, candidate: c, reason: "HEALTH_CRITICAL", code: "HEALTH_LOW" };

    // Policy bloqueada?
    const policy = await this.policyEngine.evaluate(c.connectorId, ctx);
    if (!policy.allowed)
      return { eligible: false, candidate: c, reason: "POLICY_BLOCKED", code: policy.code };

    // Versão incompatível?
    if (!this.versionCheck(c, ctx))
      return { eligible: false, candidate: c, reason: "VERSION_INCOMPATIBLE", code: "VER_MISMATCH" };

    // Manutenção?
    if (await this.maintenanceWindow.isActive(c.connectorId))
      return { eligible: false, candidate: c, reason: "MAINTENANCE_WINDOW", code: "IN_MAINTENANCE" };

    return { eligible: true, candidate: c };
  }
}
```

## 1.5 Diagrama de Estados — CapabilityRanking

```
                     ┌─────────────────┐
                     │    IDLE         │
                     └────────┬────────┘
                              │ rank() chamado
                              ▼
                     ┌─────────────────┐
                     │   FILTERING     │ ← EligibilityChecker filtra candidatos
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │    SCORING      │ ← CapabilityScorer.score() paralelo
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │    SORTING      │ ← ordenação + tie-break
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
     │  COMPLETED  │  │  NO_ELIGIBLE │  │  FAILED          │
     │ (≥1 ranked) │  │ (0 elegíveis)│  │ (erro técnico)   │
     └─────────────┘  └──────────────┘  └──────────────────┘
```

## 1.6 Diagrama C4 — Component View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│             Capability Negotiation Engine [Container]                        │
│                                                                              │
│  ┌──────────────────────┐   ┌──────────────────────┐                        │
│  │  CapabilityRanking   │──►│  EligibilityChecker   │                       │
│  │  Service             │   │  (circuit, health,    │                       │
│  │                      │   │   policy, version,    │                       │
│  │  rank()              │   │   maintenance)        │                       │
│  └──────────┬───────────┘   └──────────────────────┘                        │
│             │                                                                 │
│             ▼                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐                        │
│  │  CapabilityScorer    │──►│  ScoreComponents      │                       │
│  │                      │   │  (cost, latency,      │                       │
│  │  score()             │   │   avail, reliability, │                       │
│  │                      │   │   sla, geo, load,     │                       │
│  │                      │   │   preference,         │                       │
│  │                      │   │   learning)           │                       │
│  └──────────┬───────────┘   └──────────────────────┘                        │
│             │                                                                 │
│             ▼                                                                 │
│  ┌──────────────────────┐                                                    │
│  │  RankedCapabilityList│ → CapabilitySelectionService                       │
│  └──────────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
         │ publishes to           │ reads from
         ▼                        ▼
  UniversalEventBus           MCISRuntime · HealthMonitor
                              CircuitBreaker · PolicyEngine
```

---

# REVISÃO 2 — CAPABILITY SELECTION

---

## 2.1 Objetivo e Estratégias de Seleção

O **CapabilitySelection** recebe o `RankedCapabilityList` e aplica a estratégia de seleção adequada ao contexto, produzindo uma `CapabilitySelection` final com o Connector escolhido, fallbacks preparados e justificativa completa.

## 2.2 Selection Strategies

```typescript
// packages/core/negotiation/capability-selection.ts

export enum SelectionStrategy {
  BEST_SCORE      = "BEST_SCORE",         // Padrão: maior score total
  LOWEST_COST     = "LOWEST_COST",        // Menor custo estimado
  LOWEST_LATENCY  = "LOWEST_LATENCY",     // Menor latência p95
  HIGHEST_SLA     = "HIGHEST_SLA",        // Maior SLA declarado
  PREFERRED       = "PREFERRED",          // Preferência explícita do usuário/org
  ROUND_ROBIN     = "ROUND_ROBIN",        // Distribuição entre os top-3
  LEAST_LOADED    = "LEAST_LOADED",       // Menor carga atual
  GEO_PROXIMITY   = "GEO_PROXIMITY",      // Mais próximo geograficamente
  VERSION_LATEST  = "VERSION_LATEST",     // Versão mais recente compatível
  LEARNING_GUIDED = "LEARNING_GUIDED",    // Baseado em histórico pessoal
}

export interface SelectionContext {
  strategy:        SelectionStrategy;
  planId:          string;
  stepId:          string;
  userId:          string;
  orgId:           string;
  userRegion:      string;
  budgetConstraint?: number;
  latencyBudgetMs?: number;
  requiredVersion?: string;
  forceConnectorId?: string;    // override explícito (admin only)
}
```

## 2.3 Interface e Implementação

```typescript
export interface ICapabilitySelection {
  select(
    ranked: RankedCapabilityList,
    ctx:    SelectionContext
  ): Promise<CapabilitySelectionResult>;
}

export interface CapabilitySelectionResult {
  selectionId:    string;
  stepId:         string;
  planId:         string;
  selected:       RankedCapability;
  fallbacks:      FallbackChain;
  strategy:       SelectionStrategy;
  strategyReason: string;
  overridden:     boolean;         // true se forceConnectorId usado
  selectionScore: number;          // score do selecionado
  alternatives:   number;          // quantos outros disponíveis
  selectedAt:     string;
  durationMs:     number;
}

@Injectable()
export class CapabilitySelectionService implements ICapabilitySelection {
  async select(
    ranked: RankedCapabilityList,
    ctx:    SelectionContext
  ): Promise<CapabilitySelectionResult> {
    const t0 = Date.now();

    if (ranked.ranked.length === 0) {
      await this.eventBus.publish("capability.selection_failed", {
        stepId: ctx.stepId, planId: ctx.planId,
        reason: "NO_ELIGIBLE_CAPABILITY",
      });
      throw new CapabilityUnavailableError(ctx.stepId, ranked.ineligible);
    }

    // Override administrativo
    if (ctx.forceConnectorId) {
      const forced = ranked.ranked.find(r => r.connectorId === ctx.forceConnectorId);
      if (!forced) throw new CapabilityNotFoundError(ctx.forceConnectorId);
      return this.buildResult(forced, ranked, ctx, true, t0);
    }

    // Selecionar por estratégia
    const selected = await this.applyStrategy(ranked, ctx);
    return this.buildResult(selected, ranked, ctx, false, t0);
  }

  private async applyStrategy(
    ranked: RankedCapabilityList,
    ctx:    SelectionContext
  ): Promise<RankedCapability> {
    switch (ctx.strategy) {
      case SelectionStrategy.BEST_SCORE:
        return ranked.ranked[0];

      case SelectionStrategy.LOWEST_COST:
        return [...ranked.ranked].sort((a, b) =>
          a.estimatedCostMs - b.estimatedCostMs)[0];

      case SelectionStrategy.LOWEST_LATENCY:
        return [...ranked.ranked].sort((a, b) =>
          a.estimatedLatencyMs - b.estimatedLatencyMs)[0];

      case SelectionStrategy.HIGHEST_SLA:
        return [...ranked.ranked].sort((a, b) =>
          b.sla.uptimePercent - a.sla.uptimePercent)[0];

      case SelectionStrategy.PREFERRED:
        return ranked.ranked.find(r => r.isPreferred) ?? ranked.ranked[0];

      case SelectionStrategy.ROUND_ROBIN: {
        const top3  = ranked.ranked.slice(0, 3);
        const index = await this.roundRobinCounter.next(ctx.stepId);
        return top3[index % top3.length];
      }

      case SelectionStrategy.LEAST_LOADED:
        return [...ranked.ranked].sort((a, b) =>
          b.score.loadScore - a.score.loadScore)[0];

      case SelectionStrategy.GEO_PROXIMITY:
        return [...ranked.ranked].sort((a, b) =>
          b.score.geoScore - a.score.geoScore)[0];

      case SelectionStrategy.VERSION_LATEST:
        return this.selectLatestVersion(ranked.ranked, ctx.requiredVersion);

      case SelectionStrategy.LEARNING_GUIDED:
        return [...ranked.ranked].sort((a, b) =>
          b.score.learningScore - a.score.learningScore)[0];

      default:
        return ranked.ranked[0];
    }
  }

  private selectLatestVersion(
    ranked:          RankedCapability[],
    requiredVersion?: string
  ): RankedCapability {
    const compatible = requiredVersion
      ? ranked.filter(r => this.semver.satisfies(r.version, requiredVersion))
      : ranked;
    if (!compatible.length) throw new VersionIncompatibleError(requiredVersion!);
    return compatible.sort((a, b) =>
      this.semver.compare(b.version, a.version))[0];
  }
}
```

## 2.4 Priority Rules e Tie-Break Rules

```typescript
// Regras de prioridade — aplicadas em ordem
export const SELECTION_PRIORITY_RULES: PriorityRule[] = [
  {
    order: 1,
    name:  "FORCED_OVERRIDE",
    condition: (ctx) => !!ctx.forceConnectorId,
    description: "Override administrativo explícito — máxima prioridade",
  },
  {
    order: 2,
    name:  "BUDGET_CONSTRAINT",
    condition: (ctx, c) => ctx.budgetConstraint != null && c.estimatedCostMs > ctx.budgetConstraint,
    action: "EXCLUDE",
    description: "Excluir candidatos que excedem orçamento",
  },
  {
    order: 3,
    name:  "LATENCY_BUDGET",
    condition: (ctx, c) => ctx.latencyBudgetMs != null && c.estimatedLatencyMs > ctx.latencyBudgetMs,
    action: "EXCLUDE",
    description: "Excluir candidatos fora do orçamento de latência",
  },
  {
    order: 4,
    name:  "USER_PREFERENCE",
    condition: (_, c) => c.isPreferred,
    action: "BOOST",
    boostAmount: 0.15,
    description: "Boost para conector preferido pelo usuário/org",
  },
  {
    order: 5,
    name:  "CERTIFIED_CONNECTOR",
    condition: (_, c) => c.isCertified,
    action: "BOOST",
    boostAmount: 0.05,
    description: "Boost para conectores CERTIFIED pelo MCIS",
  },
];

// Regras de tie-break — aplicadas em sequência quando scores iguais
export const TIE_BREAK_RULES: TieBreakRule[] = [
  { order: 1, field: "latencyScore",    direction: "DESC" },
  { order: 2, field: "availScore",      direction: "DESC" },
  { order: 3, field: "reliabilityScore",direction: "DESC" },
  { order: 4, field: "preferScore",     direction: "DESC" },
  { order: 5, field: "connectorId",     direction: "ASC"  },  // determinismo final
];
```

## 2.5 Multi-Capability Selection

```typescript
// Para steps que requerem múltiplas Capabilities simultâneas
export interface MultiCapabilitySelectionResult {
  multiSelectionId: string;
  selections:       CapabilitySelectionResult[];
  composedPlan:     ComposedCapabilityPlan;
  isParallelizable: boolean;
  estimatedTotalMs: number;
}

@Injectable()
export class MultiCapabilitySelector {
  async selectAll(
    steps: ExecutionStep[],
    ctx:   SelectionContext
  ): Promise<MultiCapabilitySelectionResult> {
    // Detectar dependências entre steps
    const graph  = this.buildDependencyGraph(steps);
    const groups = this.topologicalGroups(graph);   // grupos paralelos

    const selections = await Promise.all(
      steps.map(step => this.selector.select(step.ranking!, { ...ctx, stepId: step.stepId }))
    );

    return {
      multiSelectionId:  generateId("msel"),
      selections,
      composedPlan:      this.composeParallelPlan(groups, selections),
      isParallelizable:  groups.some(g => g.length > 1),
      estimatedTotalMs:  this.estimateTotalDuration(groups, selections),
    };
  }
}
```

## 2.6 Diagrama de Sequência — Selection Flow

```
┌─────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│CapabilityNeg.   │ │CapabilitySelection   │ │ FallbackChain        │
│Engine           │ │Service               │ │ Builder              │
└───────┬─────────┘ └──────────┬───────────┘ └──────────┬───────────┘
        │                      │                         │
        │ select(ranked, ctx)  │                         │
        │─────────────────────►│                         │
        │                      │ forceConnectorId?       │
        │                      │─────────── No ─────────►│
        │                      │                         │
        │                      │ applyStrategy()         │
        │                      │ priorityRules()         │
        │                      │ tieBreak()              │
        │                      │                         │
        │                      │ buildFallbacks(ranked)  │
        │                      │────────────────────────►│
        │                      │    FallbackChain        │
        │                      │◄────────────────────────│
        │                      │                         │
        │                      │ emit(capability.selected│
        │ CapabilitySelection  │                         │
        │◄─────────────────────│                         │
```

---

# REVISÃO 3 — CAPABILITY FALLBACK

---

## 3.1 Objetivo e Níveis de Fallback

O **CapabilityFallback** define a estratégia completa de recuperação quando um Connector falha durante a execução. Ele opera em múltiplos níveis, garantindo disponibilidade máxima.

## 3.2 Fallback Levels

```typescript
// packages/core/negotiation/capability-fallback.ts

export enum FallbackLevel {
  PRIMARY    = "PRIMARY",    // Conector selecionado principal
  SECONDARY  = "SECONDARY",  // Próximo da lista ranqueada (score ≥ 0.80)
  EMERGENCY  = "EMERGENCY",  // Qualquer conector disponível (score ≥ 0.50)
  OFFLINE    = "OFFLINE",    // Modo degradado local sem conector externo
  MANUAL     = "MANUAL",     // Notificação humana para resolução manual
}

export interface FallbackChain {
  chainId:   string;
  stepId:    string;
  levels:    FallbackLevel[];
  connectors: Map<FallbackLevel, FallbackEntry>;
}

export interface FallbackEntry {
  level:         FallbackLevel;
  connectorId:   string | null;   // null para OFFLINE e MANUAL
  score:         number;
  maxRetries:    number;
  retryDelayMs:  number;
  timeoutMs:     number;
  circuitBreakerThreshold: number;
}
```

## 3.3 Fallback Chain Builder

```typescript
@Injectable()
export class FallbackChainBuilder {
  build(ranked: RankedCapabilityList, selected: RankedCapability): FallbackChain {
    const remaining = ranked.ranked.filter(r => r.connectorId !== selected.connectorId);

    const secondary = remaining.filter(r => r.score.total >= 0.80).slice(0, 2);
    const emergency = remaining.filter(r => r.score.total >= 0.50 && r.score.total < 0.80).slice(0, 1);

    const connectors = new Map<FallbackLevel, FallbackEntry>();

    connectors.set(FallbackLevel.PRIMARY, {
      level:                   FallbackLevel.PRIMARY,
      connectorId:             selected.connectorId,
      score:                   selected.score.total,
      maxRetries:              3,
      retryDelayMs:            500,
      timeoutMs:               30_000,
      circuitBreakerThreshold: 5,
    });

    secondary.forEach((c, i) => {
      const level = i === 0 ? FallbackLevel.SECONDARY : FallbackLevel.EMERGENCY;
      connectors.set(level, {
        level,
        connectorId:             c.connectorId,
        score:                   c.score.total,
        maxRetries:              2,
        retryDelayMs:            1_000,
        timeoutMs:               45_000,
        circuitBreakerThreshold: 3,
      });
    });

    if (emergency.length > 0 && !connectors.has(FallbackLevel.EMERGENCY)) {
      connectors.set(FallbackLevel.EMERGENCY, {
        level:                   FallbackLevel.EMERGENCY,
        connectorId:             emergency[0].connectorId,
        score:                   emergency[0].score.total,
        maxRetries:              1,
        retryDelayMs:            2_000,
        timeoutMs:               60_000,
        circuitBreakerThreshold: 2,
      });
    }

    // Offline sempre disponível
    connectors.set(FallbackLevel.OFFLINE, {
      level: FallbackLevel.OFFLINE, connectorId: null,
      score: 0, maxRetries: 0, retryDelayMs: 0, timeoutMs: 0, circuitBreakerThreshold: 0,
    });

    // Manual como último recurso
    connectors.set(FallbackLevel.MANUAL, {
      level: FallbackLevel.MANUAL, connectorId: null,
      score: 0, maxRetries: 0, retryDelayMs: 0, timeoutMs: 0, circuitBreakerThreshold: 0,
    });

    return {
      chainId:    generateId("fbc"),
      stepId:     selected.connectorId,
      levels:     [FallbackLevel.PRIMARY, FallbackLevel.SECONDARY,
                   FallbackLevel.EMERGENCY, FallbackLevel.OFFLINE, FallbackLevel.MANUAL],
      connectors,
    };
  }
}
```

## 3.4 Failover Executor

```typescript
@Injectable()
export class FailoverExecutor {
  async execute(
    step:    ExecutionStep,
    chain:   FallbackChain,
    ctx:     ExecutionContext
  ): Promise<ExecutionStepResult> {

    for (const level of chain.levels) {
      const entry = chain.connectors.get(level)!;

      await this.eventBus.publish("capability.fallback_started", {
        stepId: step.stepId, level, connectorId: entry.connectorId,
      });

      try {
        if (level === FallbackLevel.OFFLINE) {
          return await this.executeOffline(step, ctx);
        }
        if (level === FallbackLevel.MANUAL) {
          return await this.escalateToManual(step, chain, ctx);
        }

        const result = await this.executeWithPolicy(step, entry, ctx);

        await this.eventBus.publish("capability.fallback_completed", {
          stepId: step.stepId, level, connectorId: entry.connectorId,
          success: true,
        });

        return result;

      } catch (err) {
        await this.eventBus.publish("capability.fallback_completed", {
          stepId: step.stepId, level, connectorId: entry.connectorId,
          success: false, error: (err as Error).message,
        });

        // Registrar falha no circuit breaker do conector
        if (entry.connectorId) {
          await this.circuitBreaker.recordFailure(entry.connectorId);
        }

        // Continuar para próximo nível
        continue;
      }
    }

    throw new AllFallbacksExhaustedError(step.stepId);
  }

  private async executeWithPolicy(
    step:  ExecutionStep,
    entry: FallbackEntry,
    ctx:   ExecutionContext
  ): Promise<ExecutionStepResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= entry.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(this.backoff(entry.retryDelayMs, attempt));
      }

      const result = await Promise.race([
        this.connector.execute(entry.connectorId!, step, ctx),
        timeout(entry.timeoutMs),
      ]);

      if (result.success) return result;
      lastError = result.error!;
    }

    throw lastError ?? new UnknownExecutionError();
  }

  private backoff(base: number, attempt: number): number {
    // Exponential backoff com jitter
    return Math.min(base * Math.pow(2, attempt - 1) + Math.random() * 100, 30_000);
  }
}
```

## 3.5 Timeout Policy

```typescript
export interface TimeoutPolicy {
  connectTimeoutMs:    number;  // handshake inicial
  requestTimeoutMs:    number;  // tempo da requisição
  responseTimeoutMs:   number;  // tempo para receber resposta completa
  totalTimeoutMs:      number;  // timeout total do step
  retryTimeoutMs:      number;  // timeout por tentativa de retry
}

export const DEFAULT_TIMEOUT_POLICIES: Record<FallbackLevel, TimeoutPolicy> = {
  PRIMARY:   { connectTimeoutMs: 2_000, requestTimeoutMs: 25_000, responseTimeoutMs: 28_000, totalTimeoutMs: 30_000, retryTimeoutMs: 10_000 },
  SECONDARY: { connectTimeoutMs: 3_000, requestTimeoutMs: 40_000, responseTimeoutMs: 43_000, totalTimeoutMs: 45_000, retryTimeoutMs: 15_000 },
  EMERGENCY: { connectTimeoutMs: 5_000, requestTimeoutMs: 55_000, responseTimeoutMs: 58_000, totalTimeoutMs: 60_000, retryTimeoutMs: 20_000 },
  OFFLINE:   { connectTimeoutMs: 0,     requestTimeoutMs: 5_000,  responseTimeoutMs: 5_000,  totalTimeoutMs: 5_000,  retryTimeoutMs: 0 },
  MANUAL:    { connectTimeoutMs: 0,     requestTimeoutMs: 0,      responseTimeoutMs: 0,       totalTimeoutMs: 0,      retryTimeoutMs: 0 },
};
```

## 3.6 Recovery Workflow

```typescript
@Injectable()
export class CapabilityRecoveryWorkflow {
  async recover(connectorId: string, ctx: RecoveryContext): Promise<RecoveryResult> {
    // 1. Verificar se circuit breaker pode ser resetado
    const circuitState = await this.circuitBreaker.getState(connectorId);

    if (circuitState === "HALF_OPEN") {
      const probeResult = await this.probe(connectorId);
      if (probeResult.success) {
        await this.circuitBreaker.close(connectorId);
        return { status: "RECOVERED", connectorId, method: "CIRCUIT_CLOSED" };
      }
    }

    // 2. Health check ativo
    const health = await this.healthMonitor.forceCheck(connectorId);
    if (health.healthScore >= 80) {
      await this.circuitBreaker.reset(connectorId);
      return { status: "RECOVERED", connectorId, method: "HEALTH_RESTORED" };
    }

    // 3. Aguardar janela de recovery
    const recoveryEta = await this.healthMonitor.estimateRecovery(connectorId);
    return {
      status:      "PENDING",
      connectorId,
      method:      "WAIT_FOR_RECOVERY",
      estimatedRecoveryAt: recoveryEta,
    };
  }
}
```

## 3.7 Diagrama de Fluxo — Fallback

```
               Execution Step Falha
                       │
                       ▼
              ┌─────────────────┐
              │  PRIMARY retry  │ maxRetries=3, backoff
              └────────┬────────┘
                       │ ainda falhando
                       ▼
              ┌─────────────────┐
              │ SECONDARY try   │ maxRetries=2, backoff
              └────────┬────────┘
                       │ ainda falhando
                       ▼
              ┌─────────────────┐
              │ EMERGENCY try   │ maxRetries=1
              └────────┬────────┘
                       │ ainda falhando
                       ▼
              ┌─────────────────┐
              │ OFFLINE mode    │ resultado degradado/cacheado
              └────────┬────────┘
                       │ offline impossível
                       ▼
              ┌─────────────────┐
              │ MANUAL escalate │ notifica humano + pausa goal
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ RecoveryWorkflow│ aguarda resolução
              └─────────────────┘
```

---

# REVISÃO 4 — CAPABILITY METRICS

---

## 4.1 Interfaces de Métricas

```typescript
// packages/core/negotiation/capability-metrics.ts

export interface ICapabilityMetrics {
  // Ranking
  recordRanking(result: RankedCapabilityList): void;

  // Selection
  recordSelection(result: CapabilitySelectionResult): void;
  recordSelectionFailure(stepId: string, reason: string): void;

  // Fallback
  recordFallback(level: FallbackLevel, success: boolean, connectorId: string): void;
  recordAllFallbacksExhausted(stepId: string): void;

  // Connector Performance
  recordConnectorExecution(connectorId: string, result: ConnectorExecutionSample): void;

  // Learning
  updateLearningScore(connectorId: string, userId: string, score: number): void;

  // Snapshots
  getConnectorSnapshot(connectorId: string): ConnectorMetricsSnapshot;
  getPlatformSnapshot(): PlatformMetricsSnapshot;
}

export interface ConnectorExecutionSample {
  connectorId:    string;
  durationMs:     number;
  success:        boolean;
  fallbackLevel:  FallbackLevel;
  stepId:         string;
  errorCode?:     string;
  executedAt:     string;
}

export interface ConnectorMetricsSnapshot {
  connectorId:          string;
  windowHours:          number;       // janela de observação (24h padrão)
  // Latência
  latencyP50Ms:         number;
  latencyP95Ms:         number;
  latencyP99Ms:         number;
  latencyAvgMs:         number;
  // Disponibilidade
  availabilityPercent:  number;       // uptime observado na janela
  uptimeStreak:         number;       // minutos contínuos sem falha
  // Confiabilidade
  successRatePercent:   number;
  failureRatePercent:   number;
  errorBreakdown:       Record<string, number>;   // errorCode → count
  // SLA
  slaBreachCount:       number;       // quantas vezes excedeu SLA declarado
  slaBreachPercent:     number;
  // Fallback
  fallbackInvokedCount: number;       // vezes que foi usado como fallback
  fallbackSuccessRate:  number;       // quando usado como fallback, sucesso?
  // Carga
  avgConcurrentRequests: number;
  peakConcurrentRequests: number;
  // Custo
  avgCostPerCall:       number;       // em créditos
  totalCostWindow:      number;
  // Learning
  learningScore:        number;       // bônus acumulado do Learning Engine
  predictionAccuracy:   number;       // acerto nas predições envolvendo este conector
  // Recovery
  avgRecoveryTimeMs:    number;
  circuitBreakerState:  "CLOSED" | "OPEN" | "HALF_OPEN";
}

export interface PlatformMetricsSnapshot {
  snapshotAt:             string;
  totalNegotiations:      number;
  avgNegotiationTimeMs:   number;
  p95NegotiationTimeMs:   number;
  avgRankingTimeMs:       number;
  selectionAccuracy:      number;     // % vez que o selecionado foi o mais rápido/barato
  fallbackRate:           number;     // % execuções que usaram algum fallback
  fallbackSuccessRate:    number;     // quando fallback acionado, funcionou?
  topConnectors:          string[];   // top 5 por uso
  underperformingConnectors: string[];  // bottom 5 por success rate
}
```

## 4.2 Implementação do Collector

```typescript
@Injectable()
export class CapabilityMetricsCollector implements ICapabilityMetrics {
  constructor(
    private readonly store:   TimeSeriesStore,      // InfluxDB ou Prometheus TSDB
    private readonly cache:   RedisClient,
    private readonly meter:   Meter,
  ) {
    this.setupInstruments();
  }

  private instruments!: ReturnType<typeof this.setupInstruments>;

  private setupInstruments() {
    return {
      rankingDuration:      this.meter.createHistogram("cneg_ranking_duration_ms",       { boundaries: [1,5,10,25,50,100,250] }),
      selectionDuration:    this.meter.createHistogram("cneg_selection_duration_ms",      { boundaries: [1,2,5,10,25,50] }),
      negotiationDuration:  this.meter.createHistogram("cneg_negotiation_duration_ms",    { boundaries: [5,10,25,50,100,250,500] }),
      connectorLatency:     this.meter.createHistogram("connector_execution_duration_ms", { boundaries: [50,100,250,500,1000,2500,5000,10000] }),
      connectorSuccess:     this.meter.createCounter("connector_execution_success_total"),
      connectorFailure:     this.meter.createCounter("connector_execution_failure_total"),
      fallbackInvoked:      this.meter.createCounter("capability_fallback_invoked_total"),
      fallbackSuccess:      this.meter.createCounter("capability_fallback_success_total"),
      slaBreaches:          this.meter.createCounter("connector_sla_breach_total"),
      selectionAccuracy:    this.meter.createObservableGauge("cneg_selection_accuracy"),
      connectorHealthScore: this.meter.createObservableGauge("connector_health_score"),
      learningScore:        this.meter.createObservableGauge("connector_learning_score"),
    };
  }

  recordConnectorExecution(connectorId: string, sample: ConnectorExecutionSample): void {
    const labels = { connector_id: connectorId, fallback_level: sample.fallbackLevel };
    this.instruments.connectorLatency.record(sample.durationMs, labels);
    if (sample.success) {
      this.instruments.connectorSuccess.add(1, labels);
    } else {
      this.instruments.connectorFailure.add(1, { ...labels, error_code: sample.errorCode ?? "UNKNOWN" });
    }
    // Persistir no time-series store para retenção longa
    this.store.write("connector_execution", sample);
  }

  recordFallback(level: FallbackLevel, success: boolean, connectorId: string): void {
    this.instruments.fallbackInvoked.add(1, { level, connector_id: connectorId });
    if (success) this.instruments.fallbackSuccess.add(1, { level, connector_id: connectorId });
  }
}
```

---

# REVISÃO 5 — CAPABILITY POLICIES

---

## 5.1 Policy Hierarchy

```typescript
// packages/core/negotiation/capability-policy.ts

// Hierarquia de precedência (ordem decrescente)
export enum PolicyLevel {
  PLATFORM    = "PLATFORM",    // Política global da plataforma
  ENTERPRISE  = "ENTERPRISE",  // Política da organização
  DEPARTMENT  = "DEPARTMENT",  // Política do departamento
  TEAM        = "TEAM",        // Política do time
  USER        = "USER",        // Preferência do usuário
}
```

## 5.2 Políticas Oficiais

```typescript
export interface CapabilityPolicySet {
  selectionPolicies:   SelectionPolicy[];
  securityPolicies:    SecurityPolicy[];
  compliancePolicies:  CompliancePolicy[];
  costPolicies:        CostPolicy[];
  regionalPolicies:    RegionalPolicy[];
  marketplacePolicies: MarketplacePolicy[];
  enterprisePolicies:  EnterprisePolicy[];
  priorityPolicies:    PriorityPolicy[];
  fallbackPolicies:    FallbackPolicy[];
  learningPolicies:    LearningPolicy[];
  governancePolicies:  GovernancePolicy[];
  versionPolicies:     VersionPolicy[];
  approvalPolicies:    ApprovalPolicy[];
}

// Selection Policies
export interface SelectionPolicy {
  policyId:     string;
  level:        PolicyLevel;
  name:         string;
  allowedConnectors?: string[];       // whitelist
  blockedConnectors?: string[];       // blacklist
  requiredTags?:      string[];       // tags obrigatórias (ex: "SOC2", "ISO27001")
  strategy:           SelectionStrategy;
  overridable:        boolean;        // usuário pode sobrescrever?
}

// Security Policies
export interface SecurityPolicy {
  policyId:           string;
  level:              PolicyLevel;
  requireEncryption:  boolean;
  requireMTLS:        boolean;
  requireCertified:   boolean;       // apenas MCIS_CERTIFIED
  allowedAuthMethods: string[];      // "OAUTH2", "API_KEY", "SAML"
  dataSovereignty:    string[];      // regiões permitidas para dados
  piiHandling:        "ALLOWED" | "MASKED" | "BLOCKED";
}

// Compliance Policies
export interface CompliancePolicy {
  policyId:       string;
  level:          PolicyLevel;
  frameworks:     string[];          // ["LGPD", "GDPR", "SOC2", "PCI_DSS"]
  auditRequired:  boolean;
  retentionDays:  number;
  consentRequired: boolean;
}

// Cost Policies
export interface CostPolicy {
  policyId:           string;
  level:              PolicyLevel;
  maxCostPerCall:     number;        // créditos
  maxCostPerDay:      number;
  maxCostPerMonth:    number;
  approvalThreshold:  number;        // acima disto requer aprovação
  preferLowestCost:   boolean;
}

// Regional Policies
export interface RegionalPolicy {
  policyId:          string;
  level:             PolicyLevel;
  allowedRegions:    string[];       // ["us-east-1", "eu-west-1", "sa-east-1"]
  blockedRegions:    string[];
  preferNearestRegion: boolean;
  dataResidency:     string[];       // dados só podem residir nestas regiões
}

// Marketplace Policies
export interface MarketplacePolicy {
  policyId:             string;
  level:                PolicyLevel;
  allowCommunity:       boolean;     // permitir conectores Community?
  requireVerified:      boolean;     // apenas Verified ou Certified?
  allowBeta:            boolean;
  preferredVendors:     string[];
  blockedVendors:       string[];
  maxMarketplaceCost:   number;
}

// Enterprise Policies
export interface EnterprisePolicy {
  policyId:            string;
  level:               PolicyLevel;
  singleTenantOnly:    boolean;
  onPremAllowed:       boolean;
  cloudAllowed:        boolean;
  hybridAllowed:       boolean;
  approvalHierarchy:   string[];     // roles em ordem de aprovação
}

// Governance Policies
export interface GovernancePolicy {
  policyId:             string;
  level:                PolicyLevel;
  auditAllNegotiations: boolean;
  logSelectionReason:   boolean;
  humanReviewRequired:  boolean;
  reportingFrequency:   "REALTIME" | "DAILY" | "WEEKLY";
}

// Version Policies
export interface VersionPolicy {
  policyId:          string;
  level:             PolicyLevel;
  minVersion:        string;
  maxVersion?:       string;
  allowPreRelease:   boolean;
  allowDeprecated:   boolean;
  pinToVersion?:     string;
  autoUpgrade:       boolean;
}

// Approval Policies
export interface ApprovalPolicy {
  policyId:         string;
  level:            PolicyLevel;
  triggerConditions: ApprovalTrigger[];
  approvers:         string[];       // roles
  expirationHours:   number;
  autoApproveAfter?: number;         // horas — auto-aprovar se sem resposta
}

export interface ApprovalTrigger {
  field:     string;                 // "estimatedCostMs", "connectorId", "region"
  operator:  "GT" | "LT" | "EQ" | "IN" | "NOT_IN";
  value:     unknown;
}
```

## 5.3 Policy Evaluator

```typescript
@Injectable()
export class PolicyEvaluator {
  async evaluate(
    connectorId: string,
    ctx:         NegotiationContext
  ): Promise<PolicyEvaluationResult> {
    // Carregar todas as políticas aplicáveis (da mais alta para mais baixa precedência)
    const policies = await this.policyStore.loadAll(ctx.orgId, ctx.deptId, ctx.userId);

    const violations: PolicyViolation[] = [];
    const applied:    string[]           = [];

    for (const policy of this.sortByPrecedence(policies)) {
      const result = await this.applyPolicy(policy, connectorId, ctx);
      if (!result.allowed) {
        if (policy.level === PolicyLevel.PLATFORM || policy.level === PolicyLevel.ENTERPRISE) {
          violations.push({ policyId: policy.policyId, reason: result.reason! });
        }
        if (!result.overridable) {
          // Hard block — parar imediatamente
          return {
            allowed: false, code: "POLICY_HARD_BLOCK",
            violations, reason: result.reason!, appliedPolicies: applied,
          };
        }
      }
      applied.push(policy.policyId);
    }

    return {
      allowed: violations.length === 0,
      violations,
      appliedPolicies: applied,
    };
  }
}
```

---

# REVISÃO 6 — CAPABILITY CONTRACTS

---

## 6.1 CapabilityRankingContract

```typescript
// packages/shared/contracts/capability-contracts.ts — v1.2

export const CapabilityRankingContractV1 = {
  version:      "1.0.0",
  schemaId:     "capability.ranking.v1",
  input: {
    candidates:  "CapabilityCandidate[]",
    step:        "ExecutionStep",
    ctx:         "NegotiationContext",
  },
  output: "RankedCapabilityList",
  guarantees: [
    "Saída sempre ordenada DESC por score.total",
    "Tie-break determinístico por latencyScore → availScore → connectorId",
    "Candidatos inelegíveis documentados com reason e code",
    "rankingId único por invocação",
    "durationMs sempre preenchido",
    "Imutável após construção",
    "Publicação de capability.rank_started e capability.rank_completed garantida",
  ],
  backwardCompatible: true,
  forwardCompatible:  false,
} as const;

export const CapabilitySelectionContractV1 = {
  version:      "1.0.0",
  schemaId:     "capability.selection.v1",
  input: {
    ranked:   "RankedCapabilityList",
    ctx:      "SelectionContext",
  },
  output: "CapabilitySelectionResult",
  guarantees: [
    "Sempre retorna exatamente 1 Connector selecionado ou lança CapabilityUnavailableError",
    "FallbackChain sempre construída com mínimo OFFLINE + MANUAL",
    "strategyReason sempre preenchida",
    "selectionId único por invocação",
    "Evento capability.selected publicado em caso de sucesso",
    "Evento capability.selection_failed publicado em caso de falha",
  ],
  backwardCompatible: true,
  forwardCompatible:  false,
} as const;

export const CapabilityFallbackContractV1 = {
  version:      "1.0.0",
  schemaId:     "capability.fallback.v1",
  input: {
    step:  "ExecutionStep",
    chain: "FallbackChain",
    ctx:   "ExecutionContext",
  },
  output: "ExecutionStepResult",
  guarantees: [
    "Tenta todos os níveis antes de lançar AllFallbacksExhaustedError",
    "Backoff exponencial com jitter entre retries",
    "Circuit breaker atualizado após cada falha",
    "Eventos capability.fallback_started e capability.fallback_completed publicados por nível",
    "Timeout por nível respeitado com Promise.race",
    "OFFLINE sempre tenta antes de MANUAL",
  ],
  backwardCompatible: true,
  forwardCompatible:  false,
} as const;

export const CapabilityMetricsContractV1 = {
  version:      "1.0.0",
  schemaId:     "capability.metrics.v1",
  guarantees: [
    "Todas as métricas registradas de forma assíncrona (não bloqueia execução)",
    "ConnectorMetricsSnapshot calculado em janela de 24h por padrão",
    "Dados de latência em percentis p50/p95/p99",
    "Time-series com retenção mínima de 90 dias",
    "Métricas idempotentes (registro duplicado = sem efeito)",
  ],
  backwardCompatible: true,
  forwardCompatible:  true,   // campos opcionais permitem extensão
} as const;

export const CapabilityPolicyContractV1 = {
  version:      "1.0.0",
  schemaId:     "capability.policy.v1",
  guarantees: [
    "Políticas avaliadas em ordem de precedência: PLATFORM > ENTERPRISE > DEPARTMENT > TEAM > USER",
    "Violações PLATFORM e ENTERPRISE nunca são ignoradas",
    "PolicyEvaluationResult sempre inclui appliedPolicies para auditoria",
    "Políticas carregadas do store com cache TTL de 5 minutos",
    "Qualquer política com overridable=false é um hard block",
  ],
  backwardCompatible: true,
  forwardCompatible:  false,
} as const;
```

## 6.2 Schema de Validação (Zod)

```typescript
import { z } from "zod";

export const CapabilityScoreSchema = z.object({
  total:            z.number().min(0).max(1),
  costScore:        z.number().min(0).max(1),
  latencyScore:     z.number().min(0).max(1),
  availScore:       z.number().min(0).max(1),
  reliabilityScore: z.number().min(0).max(1),
  slaScore:         z.number().min(0).max(1),
  preferScore:      z.number().min(0).max(1),
  geoScore:         z.number().min(0).max(1),
  loadScore:        z.number().min(0).max(1),
  learningScore:    z.number().min(0).max(1),
});

export const RankedCapabilitySchema = z.object({
  rank:              z.number().int().positive(),
  connectorId:       z.string().min(1),
  connectorName:     z.string().min(1),
  version:           z.string().regex(/^\d+\.\d+\.\d+$/),
  score:             CapabilityScoreSchema,
  isPreferred:       z.boolean(),
  isCertified:       z.boolean(),
  region:            z.string(),
  estimatedCostMs:   z.number().nonnegative(),
  estimatedLatencyMs:z.number().nonnegative(),
  tags:              z.array(z.string()),
});

export const CapabilitySelectionResultSchema = z.object({
  selectionId:    z.string().min(1),
  stepId:         z.string().min(1),
  planId:         z.string().min(1),
  selected:       RankedCapabilitySchema,
  strategy:       z.nativeEnum(SelectionStrategy),
  strategyReason: z.string().min(1),
  overridden:     z.boolean(),
  selectionScore: z.number().min(0).max(1),
  alternatives:   z.number().int().nonnegative(),
  selectedAt:     z.string().datetime(),
  durationMs:     z.number().nonnegative(),
});
```

---

# REVISÃO 7 — EVENTOS OFICIAIS

---

```typescript
// packages/shared/events/capability-events-v1.2.ts

/**
 * capability.rank_started
 * Producer: CapabilityRankingService
 * Consumer:  ObservabilityCollector, AuditLogger
 * Retry:     não (observabilidade apenas)
 * Idempotência: rankingId como chave de deduplicação
 */
export interface CapabilityRankStartedEvent {
  rankingId:      string;
  stepId:         string;
  planId:         string;
  candidateCount: number;
  triggeredAt:    string;
}

/**
 * capability.rank_completed
 * Producer: CapabilityRankingService
 * Consumer:  CapabilitySelectionService, ObservabilityCollector
 * Retry:     não
 * Idempotência: rankingId como chave
 */
export interface CapabilityRankCompletedEvent {
  rankingId:        string;
  stepId:           string;
  planId:           string;
  topConnectorId:   string;
  eligibleCount:    number;
  ineligibleCount:  number;
  durationMs:       number;
  completedAt:      string;
}

/**
 * capability.selected
 * Producer: CapabilitySelectionService
 * Consumer:  ConnectorManager, LearningEngine, ObservabilityCollector
 * Retry:     sim (at-least-once, idempotente por selectionId)
 * Idempotência: selectionId como chave de deduplicação
 */
export interface CapabilitySelectedEvent {
  selectionId:    string;
  planId:         string;
  stepId:         string;
  connectorId:    string;
  strategy:       SelectionStrategy;
  score:          number;
  alternatives:   number;
  selectedAt:     string;
}

/**
 * capability.selection_failed
 * Producer: CapabilitySelectionService
 * Consumer:  GoalEngine (para renegociar ou cancelar), NotificationEngine
 * Retry:     sim (3x com backoff)
 * Idempotência: stepId + planId como chave composta
 */
export interface CapabilitySelectionFailedEvent {
  planId:       string;
  stepId:       string;
  reason:       string;
  ineligible:   IneligibleCapability[];
  failedAt:     string;
}

/**
 * capability.fallback_started
 * Producer: FailoverExecutor
 * Consumer:  ObservabilityCollector, AuditLogger, NotificationEngine (level=MANUAL)
 * Retry:     não
 * Idempotência: stepId + level como chave composta
 */
export interface CapabilityFallbackStartedEvent {
  stepId:      string;
  planId:      string;
  level:       FallbackLevel;
  connectorId: string | null;
  startedAt:   string;
}

/**
 * capability.fallback_completed
 * Producer: FailoverExecutor
 * Consumer:  LearningEngine, CapabilityMetrics, CircuitBreakerManager
 * Retry:     não
 * Idempotência: stepId + level + completedAt
 */
export interface CapabilityFallbackCompletedEvent {
  stepId:      string;
  planId:      string;
  level:       FallbackLevel;
  connectorId: string | null;
  success:     boolean;
  durationMs:  number;
  error?:      string;
  completedAt: string;
}

/**
 * capability.metrics_updated
 * Producer: CapabilityMetricsCollector
 * Consumer:  CapabilityHealthMonitor, CapabilityNegotiationEngine (atualiza cache)
 * Retry:     sim (idempotente — última atualização vence)
 * Idempotência: connectorId + windowEnd como chave
 */
export interface CapabilityMetricsUpdatedEvent {
  connectorId:      string;
  windowHours:      number;
  snapshot:         ConnectorMetricsSnapshot;
  updatedAt:        string;
}

/**
 * capability.policy_applied
 * Producer: PolicyEvaluator
 * Consumer:  AuditLogger, GovernanceEngine
 * Retry:     não
 * Idempotência: policyId + connectorId + appliedAt
 */
export interface CapabilityPolicyAppliedEvent {
  policyId:     string;
  connectorId:  string;
  level:        PolicyLevel;
  result:       "ALLOWED" | "BLOCKED" | "WARNING";
  reason?:      string;
  appliedAt:    string;
}
```

---

# REVISÃO 8 — OBSERVABILIDADE

---

## 8.1 Instrumentação Completa

```typescript
// packages/infra/observability/capability-observability.ts

export function setupCapabilityObservability(meter: Meter) {
  return {
    // ─── RANKING ────────────────────────────────────────────────────────────
    rankingDuration: meter.createHistogram("cneg_ranking_duration_ms", {
      description: "Tempo de execução do CapabilityRanking",
      unit: "ms", boundaries: [1, 5, 10, 25, 50, 100, 250, 500],
    }),
    rankingEligible: meter.createHistogram("cneg_ranking_eligible_count", {
      description: "Número de candidatos elegíveis por ranking",
      boundaries: [0, 1, 2, 3, 5, 10, 20],
    }),
    rankingIneligible: meter.createCounter("cneg_ranking_ineligible_total", {
      description: "Total de candidatos inelegíveis por motivo",
    }),  // Labels: reason

    // ─── NEGOTIATION ────────────────────────────────────────────────────────
    negotiationDuration: meter.createHistogram("cneg_negotiation_duration_ms", {
      description: "Tempo total de negociação por step (ranking + selection)",
      unit: "ms", boundaries: [5, 10, 25, 50, 100, 250, 500, 1000],
    }),

    // ─── SELECTION ──────────────────────────────────────────────────────────
    selectionDuration: meter.createHistogram("cneg_selection_duration_ms", {
      description: "Tempo de CapabilitySelection",
      unit: "ms", boundaries: [1, 2, 5, 10, 25, 50, 100],
    }),
    selectionAccuracy: meter.createObservableGauge("cneg_selection_accuracy", {
      description: "% vezes que o conector selecionado foi o mais eficiente retrospectivamente",
    }),
    selectionFailures: meter.createCounter("cneg_selection_failure_total", {
      description: "Falhas de seleção por reason",
    }),  // Labels: reason

    // ─── FALLBACK ───────────────────────────────────────────────────────────
    fallbackRate: meter.createObservableGauge("cneg_fallback_rate", {
      description: "% execuções que acionaram algum fallback",
    }),
    fallbackByLevel: meter.createCounter("cneg_fallback_invoked_total", {
      description: "Total de fallbacks por nível",
    }),  // Labels: level
    fallbackSuccessRate: meter.createObservableGauge("cneg_fallback_success_rate", {
      description: "% fallbacks bem-sucedidos por nível",
    }),  // Labels: level

    // ─── CONNECTOR PERFORMANCE ──────────────────────────────────────────────
    connectorAvailability: meter.createObservableGauge("connector_availability_percent", {
      description: "Disponibilidade do conector na janela de 24h (0–100)",
    }),  // Labels: connector_id
    connectorHealthScore: meter.createObservableGauge("connector_health_score", {
      description: "Health score composto do conector (0–100)",
    }),  // Labels: connector_id
    connectorReliability: meter.createObservableGauge("connector_reliability_percent", {
      description: "Taxa de sucesso do conector na janela de 24h (0–100)",
    }),  // Labels: connector_id
    connectorCostAvg: meter.createObservableGauge("connector_avg_cost_credits", {
      description: "Custo médio por chamada em créditos",
    }),  // Labels: connector_id
    connectorLatencyP95: meter.createObservableGauge("connector_latency_p95_ms", {
      description: "Latência P95 do conector na janela de 24h",
    }),  // Labels: connector_id

    // ─── LEARNING ───────────────────────────────────────────────────────────
    capabilityLearningScore: meter.createObservableGauge("cneg_capability_learning_score", {
      description: "Score de aprendizado acumulado por conector",
    }),  // Labels: connector_id
    predictionAccuracy: meter.createObservableGauge("cneg_prediction_accuracy", {
      description: "Acurácia das predições de seleção do Learning Engine (0–1)",
    }),
  };
}
```

## 8.2 Dashboards Sugeridos

```
Dashboard 1: CAPABILITY NEGOTIATION OVERVIEW
─────────────────────────────────────────────
Panels:
  [1] Negotiation Throughput (req/min)           → cneg_negotiation_duration_ms.count
  [2] P95 Negotiation Time (ms) — meta: <200ms   → cneg_negotiation_duration_ms{quantile="0.95"}
  [3] Selection Accuracy (%) — meta: >85%        → cneg_selection_accuracy
  [4] Fallback Rate (%) — meta: <5%              → cneg_fallback_rate
  [5] Top 5 Connectors por Uso                   → connector_execution_success_total (top 5)
  [6] Bottom 5 Connectors por Success Rate       → connector_reliability_percent (bottom 5)

Dashboard 2: CONNECTOR HEALTH
─────────────────────────────────────────────
Panels por connector_id:
  [1] Health Score (0–100)     → connector_health_score
  [2] Availability (%)         → connector_availability_percent
  [3] Reliability (%)          → connector_reliability_percent
  [4] P95 Latency (ms)         → connector_latency_p95_ms
  [5] Avg Cost (credits)       → connector_avg_cost_credits
  [6] Circuit Breaker State    → derivado de connector_health_score < 50

Dashboard 3: FALLBACK ANALYSIS
─────────────────────────────────────────────
Panels:
  [1] Fallbacks por Nível (stacked bar)   → cneg_fallback_invoked_total by level
  [2] Fallback Success Rate por Nível     → cneg_fallback_success_rate by level
  [3] Inelegíveis por Motivo (pie)        → cneg_ranking_ineligible_total by reason
  [4] Connectors com Circuit Aberto       → connector_health_score < 50
  [5] Recovery Time Médio                 → derivado do LearningEngine

Dashboard 4: LEARNING & OPTIMIZATION
─────────────────────────────────────────────
Panels:
  [1] Learning Score por Conector          → cneg_capability_learning_score
  [2] Prediction Accuracy (7d rolling)     → cneg_prediction_accuracy
  [3] Selection Accuracy (7d rolling)      → cneg_selection_accuracy
```

## 8.3 Alertas e Thresholds

```yaml
# alerts/capability-negotiation.yaml

alerts:
  - name: NegotiationTimeHigh
    condition: cneg_negotiation_duration_ms{quantile="0.95"} > 500
    severity: WARNING
    message: "P95 negotiation time {{ $value }}ms > 500ms threshold"
    runbook: "docs/runbooks/capability-negotiation-slow.md"

  - name: NegotiationTimeCritical
    condition: cneg_negotiation_duration_ms{quantile="0.95"} > 1000
    severity: CRITICAL
    message: "P95 negotiation time {{ $value }}ms > 1000ms — SLA breach risk"

  - name: FallbackRateHigh
    condition: cneg_fallback_rate > 0.10
    severity: WARNING
    message: "Fallback rate {{ $value | percent }} > 10% — check connector health"

  - name: FallbackRateCritical
    condition: cneg_fallback_rate > 0.25
    severity: CRITICAL
    message: "Fallback rate {{ $value | percent }} > 25% — widespread connector issues"

  - name: ConnectorUnhealthy
    condition: connector_health_score < 50
    for: 2m
    severity: WARNING
    labels: { connector_id: "{{ $labels.connector_id }}" }

  - name: ConnectorDown
    condition: connector_availability_percent < 80
    for: 5m
    severity: CRITICAL
    labels: { connector_id: "{{ $labels.connector_id }}" }

  - name: SelectionAccuracyLow
    condition: cneg_selection_accuracy < 0.70
    for: 30m
    severity: INFO
    message: "Selection accuracy {{ $value | percent }} < 70% — review negotiation weights"

  - name: AllFallbacksExhausted
    condition: increase(cneg_fallback_invoked_total{level="MANUAL"}[5m]) > 0
    severity: CRITICAL
    message: "MANUAL escalation triggered — all automated fallbacks failed"
```

## 8.4 KPIs Oficiais

| KPI | Meta | Crítico |
|---|---|---|
| P95 Negotiation Time | < 200ms | > 500ms |
| Selection Accuracy | > 85% | < 70% |
| Fallback Rate | < 5% | > 25% |
| Connector Availability | > 99% | < 90% |
| Connector Health Score | > 80 | < 50 |
| Fallback Success Rate | > 90% | < 70% |
| Circuit Breaker Open Count | 0 | > 2 |
| Manual Escalation Rate | 0% | > 0.1% |
| Learning Score Growth | > 0 (mensal) | negativo |
| Prediction Accuracy | > 70% | < 50% |

---

# REVISÃO 9 — CHECKLIST OFICIAL DO CAPABILITY NEGOTIATION ENGINE

---

```
CHECKLIST OFICIAL — CAPABILITY NEGOTIATION ENGINE — MDS v1.2
═══════════════════════════════════════════════════════════════════════════════

ARQUITETURA
  [ ] CapabilityNegotiationEngine implementado e coberto por testes
  [ ] CapabilityRankingService implementado com EligibilityChecker
  [ ] CapabilitySelectionService com todas as SelectionStrategies
  [ ] CapabilityFallbackChainBuilder gerando todos os 5 níveis
  [ ] FailoverExecutor com backoff exponencial e jitter
  [ ] CapabilityRecoveryWorkflow implementado
  [ ] MultiCapabilitySelector para steps paralelos

INTERFACES E CONTRATOS
  [ ] CapabilityRankingContractV1 publicado e validado
  [ ] CapabilitySelectionContractV1 publicado e validado
  [ ] CapabilityFallbackContractV1 publicado e validado
  [ ] CapabilityMetricsContractV1 publicado e validado
  [ ] CapabilityPolicyContractV1 publicado e validado
  [ ] Schemas Zod validando todos os objetos de entrada e saída
  [ ] Versionamento semântico em todos os contratos

POLÍTICAS
  [ ] PolicyEvaluator avaliando hierarquia PLATFORM→USER
  [ ] SelectionPolicy com whitelist e blacklist operacionais
  [ ] SecurityPolicy com requisitos de encriptação e auth
  [ ] CompliancePolicy com LGPD, GDPR e frameworks aplicáveis
  [ ] CostPolicy com aprovação automática acima do threshold
  [ ] RegionalPolicy com dataResidency aplicado
  [ ] MarketplacePolicy com allowCommunity configurável
  [ ] VersionPolicy com semver satisfies operacional
  [ ] GovernancePolicy com auditAllNegotiations ativo em produção

EVENTOS
  [ ] capability.rank_started publicado antes do ranking
  [ ] capability.rank_completed publicado após ranking
  [ ] capability.selected publicado após seleção bem-sucedida
  [ ] capability.selection_failed publicado em falha de seleção
  [ ] capability.fallback_started publicado ao iniciar fallback
  [ ] capability.fallback_completed publicado ao concluir fallback
  [ ] capability.metrics_updated publicado após atualização de métricas
  [ ] capability.policy_applied publicado após avaliação de política
  [ ] Idempotência garantida por chave de deduplicação em todos os eventos

MÉTRICAS E OBSERVABILIDADE
  [ ] cneg_ranking_duration_ms instrumentado
  [ ] cneg_negotiation_duration_ms instrumentado
  [ ] cneg_selection_duration_ms instrumentado
  [ ] cneg_selection_accuracy calculado (observável)
  [ ] cneg_fallback_rate calculado (observável)
  [ ] cneg_fallback_invoked_total por nível instrumentado
  [ ] connector_availability_percent por conector instrumentado
  [ ] connector_health_score por conector instrumentado
  [ ] connector_reliability_percent por conector instrumentado
  [ ] cneg_capability_learning_score por conector instrumentado
  [ ] Dashboard "Capability Negotiation Overview" configurado
  [ ] Dashboard "Connector Health" configurado
  [ ] Dashboard "Fallback Analysis" configurado
  [ ] Dashboard "Learning & Optimization" configurado
  [ ] Todos os alertas do arquivo capability-negotiation.yaml ativos

SEGURANÇA
  [ ] forceConnectorId apenas para admins (RBAC verificado)
  [ ] Políticas de segurança avaliadas antes de qualquer seleção
  [ ] dataSovereignty verificado para todos os candidatos
  [ ] Audit log de toda seleção com connectorId, strategy e score
  [ ] Dados de métricas anonimizados para compliance LGPD

ESCALABILIDADE
  [ ] CapabilityRankingService stateless → escala horizontal
  [ ] CapabilitySelectionService stateless → escala horizontal
  [ ] CapabilityHealthMonitor com cache Redis TTL=60s
  [ ] CapabilityHistory com cache Redis TTL=5min
  [ ] PolicyEvaluator com cache TTL=5min por orgId+userId
  [ ] RoundRobinCounter distribuído via Redis INCR atômico

TESTABILIDADE
  [ ] Testes unitários: CapabilityRankingService (>90% cobertura)
  [ ] Testes unitários: CapabilitySelectionService (>90% cobertura)
  [ ] Testes unitários: FailoverExecutor (>90% cobertura)
  [ ] Testes unitários: PolicyEvaluator (>90% cobertura)
  [ ] Testes de integração: Pipeline completo ranking → selection → fallback
  [ ] Testes de contrato: todos os 5 contratos validados
  [ ] Testes de chaos: conector primário falhando → fallback acionado
  [ ] Testes de chaos: 0 candidatos elegíveis → erro correto lançado
  [ ] Testes de performance: P95 < 200ms com 100 candidatos

DOCUMENTAÇÃO
  [ ] MDS v1.1: CapabilityNegotiationEngine (motor principal)
  [ ] MDS v1.2: CapabilityRanking (esta revisão)
  [ ] MDS v1.2: CapabilitySelection (esta revisão)
  [ ] MDS v1.2: CapabilityFallback (esta revisão)
  [ ] MDS v1.2: CapabilityMetrics (esta revisão)
  [ ] MDS v1.2: CapabilityPolicies (esta revisão)
  [ ] MDS v1.2: CapabilityContracts (esta revisão)
  [ ] Runbooks para todos os alertas criados
  [ ] ADR registrado em docs/01-adr/ para cada decisão arquitetural

COMPLIANCE
  [ ] Audit trail de toda seleção com razão documentada
  [ ] Políticas LGPD aplicadas em regional e data residency
  [ ] capability.policy_applied auditável para todos os bloqueios
  [ ] RetentionPolicy de logs: mínimo 90 dias
  [ ] Conformidade com MCF, MCIS e MAS verificada
```

---

# DECLARAÇÃO FINAL — MDS v1.2

---

Esta revisão oficial completa a especificação do **Capability Negotiation Engine**, tornando-o um componente totalmente documentado dentro do Manual Oficial de Engenharia.

Todos os subsistemas — **CapabilityRanking**, **CapabilitySelection**, **CapabilityFallback**, **CapabilityMetrics** e **CapabilityPolicies** — possuem agora:

- Contratos oficiais versionados com garantias explícitas
- Interfaces TypeScript completas com schemas Zod
- Eventos UEB documentados com payload, producer, consumer, retry e idempotência
- Métricas de observabilidade com thresholds, alertas e KPIs
- Dashboards de monitoramento sugeridos
- Checklist oficial de implementação e operação

Nenhum componente existente foi removido ou alterado.

Todos os contratos permanecem **desacoplados, orientados a eventos, compatíveis com MAS, MCF, MCIS, MGIS** e com as revisões anteriores do MDS.

---

**MDS v1.2 — Capability Negotiation Engine — Especificação Completa**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.1 · **Série:** MDS v1.0, v1.1, v1.2