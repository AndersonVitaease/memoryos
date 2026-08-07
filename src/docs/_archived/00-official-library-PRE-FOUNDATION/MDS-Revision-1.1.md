# MDS v1.1 — Revisão Arquitetural Oficial

**Versão:** 1.1  
**Status:** Revisão Oficial — Adenda ao MDS v1.0  
**Data:** 2026-07-09  
**Tipo:** Enriquecimento Arquitetural (não substitui, não remove conteúdo do MDS v1.0)  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0

---

## Declaração de Revisão

Esta revisão incorpora refinamentos arquiteturais identificados durante a revisão técnica do MDS v1.0.

**Não remove** nenhuma seção existente.  
**Não simplifica** nenhum conteúdo.  
**Não altera** nenhuma decisão de MV, MPS, MAS, MES, MCF, MCIS ou MGIS.  
**Apenas enriquece** o Manual Oficial de Engenharia com três novos motores e as atualizações correspondentes.

### Novos Motores Introduzidos

| Motor | Posição no Pipeline | Responsabilidade |
|---|---|---|
| **Goal Validation Engine** | Goal Engine → Planner | Valida se um Goal pode ser planejado |
| **Capability Negotiation Engine** | Planner → MCIS Runtime | Escolhe a melhor Capability antes da execução |
| **Learning Engine** | Execution Engine → Memory Engine | Transforma execução em aprendizado contínuo |

---

# REVISÃO 4 — CORE DIAGRAM ATUALIZADO

---

## Pipeline Oficial do Core (MDS v1.1)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              PIPELINE OFICIAL DO CORE — MDS v1.1                            │
│              (atualização do diagrama MDS §1.2)                             │
└──────────────────────────────────────────────────────────────────────────────┘

  Usuário
    │  "Quero organizar a empresa"
    ▼
  ┌──────────────────────────────────────┐
  │  Natural Language Understanding      │  → NLUResult
  │  (NLUEngine)                         │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐
  │  Intent Engine                       │  → IntentResult
  │  (classifica, normaliza, entidades)  │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐
  │  Goal Engine (MGIS)                  │  → Goal + GoalPlan
  │  (decompõe, prioriza, resolve)       │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐  ← NOVO (v1.1)
  │  ██ Goal Validation Engine ██        │  → ValidationResult
  │  (valida permissões, policies,       │
  │   compliance, budget, quotas...)     │
  └──────────────────────────────────────┘
    │ ALLOWED              │ DENIED / BLOCKED / PENDING_APPROVAL
    ▼                      ▼
  ┌────────────────┐   ┌────────────────────────────────────────┐
  │  Planner       │   │  ValidationReport → usuário / aprovador│
  │  (ExecutionPlan│   └────────────────────────────────────────┘
  │   sequenciado) │
  └───────┬────────┘
          │
          ▼
  ┌──────────────────────────────────────┐  ← NOVO (v1.1)
  │  ██ Capability Negotiation Engine ██ │  → CapabilitySelection
  │  (seleciona melhor Capability por    │
  │   custo, latência, SLA, histórico)   │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐
  │  MCIS Runtime                        │  → ConnectorAssignment
  │  (resolve Capabilities → Connectors) │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐
  │  Connector Manager                   │  → execução roteada
  │  (autentica, roteia, sandboxeia)     │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐
  │  Execution Engine                    │  → ExecutionResult
  │  (parallel, retry, circuit breaker)  │
  └──────────────────────────────────────┘
    │
    ▼
  ┌──────────────────────────────────────┐  ← NOVO (v1.1)
  │  ██ Learning Engine ██               │  → LearningRecord
  │  (patterns, habits, workflows,       │
  │   predictions, suggestions)          │
  └──────────────────────────────────────┘
    │ feeds
    ├──────────────────────────────────────────┐
    ▼                                          ▼
  ┌────────────────────────┐        ┌──────────────────────────┐
  │  Memory Engine         │        │  Goal Engine / Planner   │
  │  (persiste aprendizado)│        │  (predictions melhores)  │
  └────────────────────────┘        └──────────────────────────┘
    │
    ▼
  Resposta ao Usuário
```

---

# REVISÃO 1 — GOAL VALIDATION ENGINE

---

## 1.1 Definição e Posicionamento

O **Goal Validation Engine** é o guardião entre a intenção estruturada (GoalPlan) e o planejamento de execução (Planner). Ele valida se um Goal está autorizado a prosseguir — verificando todas as dimensões de permissão, compliance, recursos e políticas antes que qualquer planejamento ou execução ocorra.

**Este motor NÃO cria planos. NÃO executa. NÃO escolhe Connectors. Apenas valida.**

## 1.2 Interface Principal

```typescript
// packages/core/validation/goal-validation-engine.ts

@Injectable()
export class GoalValidationEngine {
  constructor(
    private readonly permissionChecker:   PermissionChecker,
    private readonly policyEvaluator:     PolicyEvaluator,
    private readonly complianceChecker:   ComplianceChecker,
    private readonly budgetGuard:         BudgetGuard,
    private readonly quotaGuard:          QuotaGuard,
    private readonly featureFlagGuard:    FeatureFlagGuard,
    private readonly approvalWorkflow:    ApprovalWorkflowEngine,
    private readonly connectorGuard:      ConnectorRestrictionGuard,
    private readonly specialistGuard:     SpecialistRestrictionGuard,
    private readonly timeWindowGuard:     TimeWindowGuard,
    private readonly licenseGuard:        LicenseGuard,
    private readonly securityGuard:       SecurityGuard,
    private readonly eventBus:            UniversalEventBus,
    private readonly metrics:             ValidationMetrics,
  ) {}

  async validate(goal: Goal, ctx: GoalContext): Promise<ValidationResult> {
    const t0 = Date.now();
    const checks = await this.runAllChecks(goal, ctx);
    const result = this.buildResult(goal, checks, ctx);

    // Emitir evento correspondente ao resultado
    await this.emitValidationEvent(result, goal.goalId);

    // Registrar métricas
    this.metrics.record(result.status, Date.now() - t0, goal.ontologyDomain);

    return result;
  }

  private async runAllChecks(goal: Goal, ctx: GoalContext): Promise<ValidationCheck[]> {
    // Executa em paralelo todos os checks independentes
    return Promise.all([
      this.permissionChecker.check(goal, ctx),         // R1: Permissões de usuário/role
      this.policyEvaluator.check(goal, ctx),            // R2: Políticas ativas
      this.complianceChecker.check(goal, ctx),          // R3: LGPD, GDPR, regulatório
      this.budgetGuard.check(goal, ctx),                // R4: Limites financeiros
      this.quotaGuard.check(goal, ctx),                 // R5: Quotas de API e créditos
      this.featureFlagGuard.check(goal, ctx),           // R6: Feature flags
      this.connectorGuard.check(goal, ctx),             // R7: Restrições de Connectors
      this.specialistGuard.check(goal, ctx),            // R8: Restrições de Specialists
      this.timeWindowGuard.check(goal, ctx),            // R9: Janela de tempo
      this.licenseGuard.check(goal, ctx),               // R10: Licenciamento
      this.securityGuard.check(goal, ctx),              // R11: Regras de segurança
      this.checkOrganizationalHierarchy(goal, ctx),    // R12: Hierarquia empresarial
      this.checkDependencies(goal, ctx),                // R13: Pré-condições e deps
      this.checkPlanLimits(goal, ctx),                  // R14: Limites do plano contratado
      this.checkMarketplaceRestrictions(goal, ctx),    // R15: Restrições de Marketplace
    ]);
  }

  private buildResult(
    goal:   Goal,
    checks: ValidationCheck[],
    ctx:    GoalContext
  ): ValidationResult {
    const hardBlocks  = checks.filter(c => c.severity === "HARD_BLOCK");
    const pendingAppr = checks.filter(c => c.severity === "PENDING_APPROVAL");
    const warnings    = checks.filter(c => c.severity === "WARNING");
    const passed      = checks.filter(c => c.severity === "PASS");

    const score = this.computeScore(checks);

    if (hardBlocks.length > 0) {
      return {
        status:    ValidationStatus.DENIED,
        goalId:    goal.goalId,
        score,
        reasons:   hardBlocks.map(c => c.reason),
        evidence:  hardBlocks.flatMap(c => c.evidence),
        checks,
        recommendations: this.buildRecommendations(hardBlocks),
        approvalWorkflow: null,
        generatedAt: new Date().toISOString(),
      };
    }

    if (pendingAppr.length > 0) {
      return {
        status:    ValidationStatus.PENDING_APPROVAL,
        goalId:    goal.goalId,
        score,
        reasons:   pendingAppr.map(c => c.reason),
        evidence:  pendingAppr.flatMap(c => c.evidence),
        checks,
        recommendations: [],
        approvalWorkflow: this.approvalWorkflow.build(goal, pendingAppr, ctx),
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      status:    ValidationStatus.ALLOWED,
      goalId:    goal.goalId,
      score,
      reasons:   [],
      evidence:  [],
      checks,
      warnings:  warnings.map(w => w.reason),
      recommendations: this.buildRecommendations(warnings),
      approvalWorkflow: null,
      generatedAt: new Date().toISOString(),
    };
  }

  private computeScore(checks: ValidationCheck[]): ValidationScore {
    const total  = checks.length;
    const passed = checks.filter(c => c.severity === "PASS").length;
    return {
      value:       Math.round((passed / total) * 100),
      total,
      passed,
      warnings:    checks.filter(c => c.severity === "WARNING").length,
      failed:      checks.filter(c => ["HARD_BLOCK", "PENDING_APPROVAL"].includes(c.severity)).length,
    };
  }

  private async emitValidationEvent(result: ValidationResult, goalId: string): Promise<void> {
    const eventMap: Record<ValidationStatus, string> = {
      ALLOWED:          "goal.validated",
      DENIED:           "goal.denied",
      PENDING_APPROVAL: "goal.pending_approval",
      BLOCKED:          "goal.validation_failed",
      WARNING:          "goal.validated",
    };
    await this.eventBus.publish(eventMap[result.status], { goalId, result });
  }
}
```

## 1.3 ValidationResult — Contrato Oficial

```typescript
// packages/shared/contracts/validation.ts

export enum ValidationStatus {
  ALLOWED          = "ALLOWED",           // Goal pode prosseguir para Planner
  DENIED           = "DENIED",            // Goal bloqueado — não pode prosseguir
  PENDING_APPROVAL = "PENDING_APPROVAL",  // Aguarda aprovação humana
  BLOCKED          = "BLOCKED",           // Bloqueio técnico (quota, feature flag...)
  WARNING          = "WARNING",           // Pode prosseguir com avisos
}

export interface ValidationResult {
  status:          ValidationStatus;
  goalId:          string;
  score:           ValidationScore;
  reasons:         ValidationReason[];
  evidence:        ValidationEvidence[];
  checks:          ValidationCheck[];
  warnings?:       string[];
  recommendations: ValidationRecommendation[];
  approvalWorkflow: ApprovalWorkflow | null;
  generatedAt:     string;
}

export interface ValidationScore {
  value:    number;    // 0–100
  total:    number;    // total de checks executados
  passed:   number;
  warnings: number;
  failed:   number;
}

export interface ValidationReason {
  code:        string;           // "BUDGET_EXCEEDED", "AGE_RESTRICTION", "APPROVAL_REQUIRED"
  description: string;           // Mensagem legível para o usuário
  checkType:   ValidationCheckType;
  severity:    "HARD_BLOCK" | "PENDING_APPROVAL" | "WARNING";
}

export interface ValidationEvidence {
  field:       string;           // Campo que gerou a evidência
  expected:    unknown;          // Valor esperado
  actual:      unknown;          // Valor encontrado
  source:      string;           // Origem: "policy.budget_limit", "user.age", etc.
}

export interface ValidationRecommendation {
  action:      string;           // Ação recomendada
  description: string;
  priority:    "HIGH" | "MEDIUM" | "LOW";
  derivedGoal?: GoalTemplate;    // Goal derivado sugerido (ex: "Solicitar aprovação")
}

export interface ApprovalWorkflow {
  workflowId:  string;
  goalId:      string;
  steps: ApprovalStep[];
  currentStep: number;
  expiresAt:   string;
  status:      "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
}

export interface ApprovalStep {
  order:         number;
  approverRole:  string;
  approverId?:   string;
  requiredBy:    string;       // Motivo da aprovação
  status:        "PENDING" | "APPROVED" | "REJECTED";
  decidedAt?:    string;
  comment?:      string;
}

export interface ValidationCheck {
  checkType:   ValidationCheckType;
  severity:    "PASS" | "WARNING" | "PENDING_APPROVAL" | "HARD_BLOCK";
  reason:      ValidationReason;
  evidence:    ValidationEvidence[];
  durationMs:  number;
}

export type ValidationCheckType =
  | "PERMISSION"
  | "POLICY"
  | "COMPLIANCE_LGPD"
  | "COMPLIANCE_REGULATORY"
  | "BUDGET"
  | "QUOTA"
  | "RATE_LIMIT"
  | "FEATURE_FLAG"
  | "CONNECTOR_RESTRICTION"
  | "SPECIALIST_RESTRICTION"
  | "MARKETPLACE_RESTRICTION"
  | "TIME_WINDOW"
  | "LICENSE"
  | "ORGANIZATIONAL_HIERARCHY"
  | "DEPENDENCY"
  | "PLAN_LIMIT"
  | "SECURITY"
  | "AGE_RESTRICTION"
  | "GEO_RESTRICTION";
```

## 1.4 Implementação dos 15 Checks Oficiais

```typescript
// R1 — PERMISSION CHECK
@Injectable()
export class PermissionChecker {
  async check(goal: Goal, ctx: GoalContext): Promise<ValidationCheck> {
    const required = this.resolveRequiredPermissions(goal.ontologyDomain);
    const granted  = await this.permissionRepo.getGranted(ctx.userId, ctx.orgId);
    const missing  = required.filter(p => !granted.includes(p));
    if (missing.length > 0) return this.denied("PERMISSION",
      { code: "INSUFFICIENT_PERMISSIONS", description: `Permissões ausentes: ${missing.join(", ")}` },
      [{ field: "permissions", expected: required, actual: granted, source: "rbac" }]
    );
    return this.pass("PERMISSION");
  }
}

// R3 — COMPLIANCE (LGPD)
@Injectable()
export class ComplianceChecker {
  async check(goal: Goal, ctx: GoalContext): Promise<ValidationCheck> {
    if (this.processesPII(goal) && !ctx.userProfile.hasLGPDConsent) {
      return this.denied("COMPLIANCE_LGPD",
        { code: "LGPD_CONSENT_MISSING", description: "Processamento de dados pessoais requer consentimento explícito (LGPD Art. 7)" },
        [{ field: "lgpd_consent", expected: true, actual: false, source: "user.profile" }]
      );
    }
    const ageRestricted = ["ALCOHOL", "GAMBLING", "ADULT_CONTENT"];
    if (ageRestricted.some(d => goal.ontologyDomain.includes(d))) {
      const age = ctx.userProfile.age;
      if (!age || age < 18) return this.denied("COMPLIANCE_REGULATORY",
        { code: "AGE_RESTRICTION", description: "Conteúdo restrito a maiores de 18 anos" },
        [{ field: "age", expected: ">=18", actual: age, source: "user.profile" }]
      );
    }
    return this.pass("COMPLIANCE_LGPD");
  }
}

// R4 — BUDGET GUARD
@Injectable()
export class BudgetGuard {
  async check(goal: Goal, ctx: GoalContext): Promise<ValidationCheck> {
    const estimatedCost = this.estimateGoalCost(goal);
    if (!estimatedCost) return this.pass("BUDGET");
    const budget = ctx.budgetContext;
    if (!budget) return this.pass("BUDGET");

    if (estimatedCost > budget.availableBudget) {
      return this.denied("BUDGET",
        { code: "BUDGET_EXCEEDED", description: `Custo estimado R$${estimatedCost} excede orçamento disponível R$${budget.availableBudget}` },
        [{ field: "estimated_cost", expected: `<= ${budget.availableBudget}`, actual: estimatedCost, source: "budget.context" }]
      );
    }
    if (budget.approvalThreshold && estimatedCost > budget.approvalThreshold) {
      return this.pendingApproval("BUDGET",
        { code: "APPROVAL_REQUIRED", description: `Valor R$${estimatedCost} excede limite de aprovação R$${budget.approvalThreshold}` },
        [{ field: "approval_threshold", expected: `<= ${budget.approvalThreshold}`, actual: estimatedCost, source: "org.policy" }]
      );
    }
    return this.pass("BUDGET");
  }
}

// R5 — QUOTA GUARD
@Injectable()
export class QuotaGuard {
  async check(goal: Goal, ctx: GoalContext): Promise<ValidationCheck> {
    const usage  = await this.quotaService.getCurrentUsage(ctx.userId, ctx.orgId);
    const limits = await this.planService.getLimits(ctx.userProfile.plan);

    if (usage.creditsUsed >= limits.creditsPerMonth) {
      return this.blocked("QUOTA",
        { code: "MONTHLY_CREDITS_EXHAUSTED", description: "Cota mensal de créditos esgotada" },
        [{ field: "credits_used", expected: `< ${limits.creditsPerMonth}`, actual: usage.creditsUsed, source: "billing.quota" }]
      );
    }
    if (usage.requestsPerMinute >= limits.requestsPerMinute) {
      return this.blocked("RATE_LIMIT",
        { code: "RATE_LIMIT_EXCEEDED", description: "Rate limit excedido — aguarde antes de continuar" },
        [{ field: "requests_per_minute", expected: `< ${limits.requestsPerMinute}`, actual: usage.requestsPerMinute, source: "rate_limiter" }]
      );
    }
    return this.pass("QUOTA");
  }
}

// R9 — TIME WINDOW GUARD
@Injectable()
export class TimeWindowGuard {
  async check(goal: Goal, ctx: GoalContext): Promise<ValidationCheck> {
    const now = new Date(ctx.localTime);
    for (const constraint of goal.constraints ?? []) {
      if (constraint.type === "TIME_WINDOW") {
        const { start, end, days } = constraint.value as TimeWindowConstraint;
        const isAllowedDay  = days.includes(now.getDay());
        const isAllowedTime = this.isWithinTimeRange(now, start, end);
        if (!isAllowedDay || !isAllowedTime) {
          return this.blocked("TIME_WINDOW",
            { code: "OUTSIDE_TIME_WINDOW", description: `Operação permitida apenas ${this.describeWindow(start, end, days)}` },
            [{ field: "current_time", expected: `${start}–${end}`, actual: now.toISOString(), source: "time_window.constraint" }]
          );
        }
      }
    }
    return this.pass("TIME_WINDOW");
  }
}
```

## 1.5 Diagrama de Estados do ValidationResult

```
        ┌──────────────────┐
        │   VALIDATING     │ ← Goal entra no engine
        └────────┬─────────┘
                 │ runAllChecks() completo
     ┌───────────┼──────────────────────────┐
     │           │                          │
     ▼           ▼                          ▼
┌─────────┐ ┌──────────────┐        ┌────────────────┐
│ ALLOWED │ │PENDING_APPR. │        │  DENIED /      │
│         │ │              │        │  BLOCKED       │
└────┬────┘ └──────┬───────┘        └───────┬────────┘
     │             │                        │
     │        aprovação                ValidationReport
     │        humana                   enviado ao usuário
     │             │
     │         APPROVED?
     │        ┌────┴─────┐
     │        │          │
     ▼        ▼          ▼
  Planner  ALLOWED    DENIED
```

## 1.6 Exemplo Completo — ValidationResult

```typescript
// Exemplo: Usuário tenta aprovar pagamento de R$120.000
const exampleResult: ValidationResult = {
  status:  ValidationStatus.PENDING_APPROVAL,
  goalId:  "gol-abc123",
  score: { value: 73, total: 15, passed: 11, warnings: 1, failed: 3 },
  reasons: [
    {
      code: "APPROVAL_REQUIRED",
      description: "Pagamento de R$120.000 excede limite de aprovação de R$50.000",
      checkType: "BUDGET",
      severity: "PENDING_APPROVAL",
    },
  ],
  evidence: [
    { field: "estimated_cost", expected: "<= 50000", actual: 120000, source: "org.policy.approval_threshold" },
  ],
  checks: [/* ... 15 checks detalhados ... */],
  warnings: ["Conector BlingConnector com latência elevada nos últimos 5 min"],
  recommendations: [
    {
      action: "Solicitar aprovação do CFO",
      description: "Enviar pedido de aprovação automático via e-mail",
      priority: "HIGH",
      derivedGoal: { templateId: "REQUEST_CFO_APPROVAL", domain: "ENTERPRISE.APPROVAL" },
    },
  ],
  approvalWorkflow: {
    workflowId:  "apw-xyz789",
    goalId:      "gol-abc123",
    currentStep: 1,
    expiresAt:   "2026-07-10T18:00:00Z",
    status:      "PENDING",
    steps: [
      { order: 1, approverRole: "CFO", requiredBy: "Budget limit exceeded", status: "PENDING" },
    ],
  },
  generatedAt: "2026-07-09T10:34:22Z",
};
```

---

# REVISÃO 2 — CAPABILITY NEGOTIATION ENGINE

---

## 2.1 Definição e Posicionamento

O **Capability Negotiation Engine** é posicionado entre o Planner e o MCIS Runtime. Ele recebe um ExecutionPlan com Capabilities abstratas e seleciona, para cada step, o melhor Connector e a melhor versão de Capability disponível — considerando custo, latência, SLA, preferências, histórico e load balance.

## 2.2 Interface Principal

```typescript
// packages/core/negotiation/capability-negotiation-engine.ts

@Injectable()
export class CapabilityNegotiationEngine {
  constructor(
    private readonly mcis:       MCISRuntime,
    private readonly health:     CapabilityHealthMonitor,
    private readonly history:    CapabilityHistory,
    private readonly preference: CapabilityPreferenceService,
    private readonly policy:     CapabilityPolicy,
    private readonly metrics:    CapabilityMetrics,
    private readonly eventBus:   UniversalEventBus,
  ) {}

  async negotiate(plan: ExecutionPlan, ctx: NegotiationContext): Promise<NegotiatedPlan> {
    const assignments: CapabilityAssignment[] = [];

    for (const step of plan.steps) {
      const candidates = await this.mcis.findCandidates(step.requiredCapability, ctx);
      const scored     = await this.scoreAll(candidates, step, ctx);
      const ranked     = this.rank(scored);
      const selected   = this.selectBest(ranked, step);
      const fallbacks  = this.buildFallbackChain(ranked, selected);

      assignments.push({
        stepId:       step.stepId,
        selected,
        fallbacks,
        negotiatedAt: new Date().toISOString(),
        score:        selected.score,
      });

      await this.eventBus.publish("capability.negotiated", {
        stepId:      step.stepId,
        connectorId: selected.connectorId,
        score:       selected.score,
      });
    }

    await this.eventBus.publish("capability.selected", {
      planId:      plan.planId,
      assignments: assignments.map(a => ({ stepId: a.stepId, connectorId: a.selected.connectorId })),
    });

    return { ...plan, assignments };
  }

  private async scoreAll(
    candidates: CapabilityCandidate[],
    step:       ExecutionStep,
    ctx:        NegotiationContext
  ): Promise<ScoredCapability[]> {
    return Promise.all(candidates.map(async c => ({
      ...c,
      score: await this.computeScore(c, step, ctx),
    })));
  }

  private async computeScore(
    cap:  CapabilityCandidate,
    step: ExecutionStep,
    ctx:  NegotiationContext
  ): Promise<CapabilityScore> {
    const [health, history, preference, policy] = await Promise.all([
      this.health.get(cap.connectorId),
      this.history.getStats(cap.connectorId, ctx.userId),
      this.preference.getScore(cap.connectorId, ctx),
      this.policy.evaluate(cap.connectorId, ctx),
    ]);

    // Algoritmo de scoring multi-critério (pesos configuráveis)
    const weights = ctx.weights ?? DEFAULT_NEGOTIATION_WEIGHTS;

    return {
      total:         this.weighted(health, history, preference, policy, weights),
      costScore:     this.normalizeCost(cap.estimatedCostMs),
      latencyScore:  this.normalizeLatency(health.p95LatencyMs),
      availScore:    health.uptimePercent / 100,
      reliabilityScore: 1 - (history.errorRatePercent / 100),
      slaScore:      this.normalizeSLA(cap.sla),
      preferScore:   preference.score,
      geoScore:      this.geoProximityScore(cap.region, ctx.userRegion),
      loadScore:     1 - (health.currentLoad / health.maxCapacity),
      learningScore: history.learningBonus,     // bonus do Learning Engine
    };
  }

  private buildFallbackChain(
    ranked:   ScoredCapability[],
    selected: ScoredCapability
  ): ScoredCapability[] {
    return ranked
      .filter(c => c.connectorId !== selected.connectorId)
      .filter(c => c.score.availScore > 0.8)     // só alternativas saudáveis
      .slice(0, 3);                                // máximo 3 fallbacks
  }
}
```

## 2.3 CapabilityScore — Contrato Oficial

```typescript
export interface CapabilityScore {
  total:           number;    // 0.0–1.0 (score final ponderado)
  costScore:       number;    // menor custo = maior score
  latencyScore:    number;    // menor latência = maior score
  availScore:      number;    // uptime histórico
  reliabilityScore: number;   // 1 - error_rate
  slaScore:        number;    // SLA declarado pelo vendor
  preferScore:     number;    // preferência do usuário/org
  geoScore:        number;    // proximidade de região
  loadScore:       number;    // capacidade disponível atual
  learningScore:   number;    // bônus de aprendizado histórico
}

export const DEFAULT_NEGOTIATION_WEIGHTS: NegotiationWeights = {
  cost:         0.20,
  latency:      0.20,
  availability: 0.20,
  reliability:  0.15,
  sla:          0.10,
  preference:   0.10,
  geo:          0.03,
  load:         0.02,
};
```

## 2.4 CapabilityHealth Monitor

```typescript
@Injectable()
export class CapabilityHealthMonitor {
  private readonly healthCache = new Map<string, CapabilityHealth>();

  async get(connectorId: string): Promise<CapabilityHealth> {
    const cached = this.healthCache.get(connectorId);
    if (cached && this.isFresh(cached)) return cached;

    const health = await this.computeHealth(connectorId);
    this.healthCache.set(connectorId, health);
    return health;
  }

  private async computeHealth(connectorId: string): Promise<CapabilityHealth> {
    const metrics = await this.metricsService.getLast24h(connectorId);
    return {
      connectorId,
      status:           this.deriveStatus(metrics),
      healthScore:      this.computeHealthScore(metrics),
      p50LatencyMs:     metrics.p50,
      p95LatencyMs:     metrics.p95,
      p99LatencyMs:     metrics.p99,
      uptimePercent:    metrics.uptime,
      errorRatePercent: metrics.errorRate,
      currentLoad:      metrics.currentConnections,
      maxCapacity:      metrics.maxConnections,
      circuitState:     await this.circuitBreaker.getState(connectorId),
      lastCheckedAt:    new Date().toISOString(),
    };
  }

  private deriveStatus(m: ConnectorMetrics): "HEALTHY" | "DEGRADED" | "UNHEALTHY" {
    if (m.errorRate > 10 || m.uptime < 90) return "UNHEALTHY";
    if (m.errorRate > 2  || m.p95 > 3000)  return "DEGRADED";
    return "HEALTHY";
  }
}
```

## 2.5 CapabilityHistory — Aprendizado Acumulado

```typescript
@Injectable()
export class CapabilityHistory {
  async getStats(connectorId: string, userId: string): Promise<CapabilityHistoryStats> {
    const [personal, global] = await Promise.all([
      this.store.getPersonalStats(connectorId, userId),
      this.store.getGlobalStats(connectorId),
    ]);

    return {
      connectorId,
      userId,
      // Sucesso pessoal pesa mais (2x) que global
      successRate:      (personal.successRate * 2 + global.successRate) / 3,
      avgLatencyMs:     (personal.avgLatencyMs * 2 + global.avgLatencyMs) / 3,
      errorRatePercent: (personal.errorRatePercent + global.errorRatePercent) / 2,
      totalCalls:       personal.totalCalls,
      lastUsedAt:       personal.lastUsedAt,
      // Bônus do Learning Engine: connector frequentemente escolhido pelo usuário
      learningBonus:    this.computeLearningBonus(personal),
    };
  }

  private computeLearningBonus(stats: PersonalStats): number {
    if (!stats.totalCalls) return 0;
    const recencyBonus   = this.recencyScore(stats.lastUsedAt) * 0.5;
    const frequencyBonus = Math.min(stats.totalCalls / 100, 1.0) * 0.3;
    const successBonus   = stats.successRate * 0.2;
    return recencyBonus + frequencyBonus + successBonus;
  }
}
```

## 2.6 CapabilityPreference e CapabilityPolicy

```typescript
@Injectable()
export class CapabilityPreferenceService {
  async getScore(connectorId: string, ctx: NegotiationContext): Promise<CapabilityPreference> {
    let score = 0.5;  // base neutra

    // Preferência explícita do usuário
    if (ctx.userPreferences?.preferredConnectors?.includes(connectorId)) score += 0.3;

    // Preferência da organização
    if (ctx.orgPreferences?.preferredConnectors?.includes(connectorId)) score += 0.2;

    // Já autenticado nesta sessão (conveniência)
    if (ctx.activeConnectors?.includes(connectorId)) score += 0.15;

    // Conector atualmente conectado (sem re-autenticação necessária)
    if (ctx.connectedConnectors?.includes(connectorId)) score += 0.1;

    return { connectorId, score: Math.min(score, 1.0) };
  }
}

@Injectable()
export class CapabilityPolicy {
  async evaluate(connectorId: string, ctx: NegotiationContext): Promise<CapabilityPolicyResult> {
    const restrictions = await this.policyStore.getConnectorRestrictions(ctx.orgId, ctx.deptId);

    if (restrictions.blockedConnectors?.includes(connectorId)) {
      return { allowed: false, reason: "Connector bloqueado pela política da organização" };
    }
    if (restrictions.allowedConnectors?.length > 0 &&
        !restrictions.allowedConnectors.includes(connectorId)) {
      return { allowed: false, reason: "Connector não está na lista aprovada da organização" };
    }
    if (restrictions.certificationRequired && !ctx.certifiedConnectors?.includes(connectorId)) {
      return { allowed: false, reason: "Apenas Connectors CERTIFIED permitidos nesta organização" };
    }
    return { allowed: true };
  }
}
```

## 2.7 Diagrama de Sequência — Capability Negotiation

```
┌──────────┐  ┌────────────────────────┐  ┌──────────────┐  ┌─────────────┐
│ Planner  │  │CapabilityNegotiationEng│  │ MCIS Runtime │  │Connector Mgr│
└────┬─────┘  └───────────┬────────────┘  └──────┬───────┘  └──────┬──────┘
     │                    │                       │                  │
     │ negotiate(plan, ctx│                       │                  │
     │───────────────────►│                       │                  │
     │                    │ findCandidates()       │                  │
     │                    │──────────────────────►│                  │
     │                    │   [Gmail, Outlook, ...]│                  │
     │                    │◄──────────────────────│                  │
     │                    │                       │                  │
     │                    │ scoreAll() [PARALLEL]  │                  │
     │                    │ ├── health.get()       │                  │
     │                    │ ├── history.getStats() │                  │
     │                    │ ├── preference.get()   │                  │
     │                    │ └── policy.evaluate()  │                  │
     │                    │                       │                  │
     │                    │ rank() → selectBest()  │                  │
     │                    │ buildFallbackChain()   │                  │
     │                    │                       │                  │
     │                    │ emit(capability.negotiated)               │
     │                    │ emit(capability.selected)                 │
     │                    │                       │                  │
     │ NegotiatedPlan     │                       │                  │
     │◄───────────────────│                       │                  │
     │                    │                       │                  │
     │ (ExecutionEngine usa NegotiatedPlan.assignments)               │
     │──────────────────────────────────────────────────────────────►│
```

---

# REVISÃO 3 — LEARNING ENGINE

---

## 3.1 Definição e Posicionamento

O **Learning Engine** é acionado após cada execução bem-sucedida ou falha. Ele processa o resultado, detecta padrões, atualiza a memória, gera predições e alimenta continuamente todos os outros motores com inteligência acumulada.

## 3.2 Interface Principal

```typescript
// packages/core/learning/learning-engine.ts

@Injectable()
export class LearningEngine {
  constructor(
    private readonly pipeline:     LearningPipeline,
    private readonly patternDet:   PatternDetector,
    private readonly habitDet:     HabitDetector,
    private readonly workflowGen:  WorkflowGenerator,
    private readonly prediction:   GoalPredictionEngine,
    private readonly recommend:    RecommendationEngine,
    private readonly autoSuggest:  AutomationSuggestionEngine,
    private readonly ctxEvolution: ContextEvolutionEngine,
    private readonly memory:       MemoryEngine,
    private readonly goalEngine:   GoalEngine,
    private readonly negotiation:  CapabilityNegotiationEngine,
    private readonly marketplace:  MarketplaceRuntime,
    private readonly specialists:  SpecialistBus,
    private readonly eventBus:     UniversalEventBus,
    private readonly metrics:      LearningMetrics,
  ) {}

  async learn(executionResult: ExecutionResult, ctx: LearningContext): Promise<LearningRecord> {
    const t0 = Date.now();

    // 1. Executar pipeline de aprendizado
    const record = await this.pipeline.process(executionResult, ctx);

    // 2. Detectar padrões e hábitos (paralelo)
    const [patterns, habits] = await Promise.all([
      this.patternDet.detect(record),
      this.habitDet.detect(record, ctx.userId),
    ]);

    // 3. Gerar workflows automáticos se padrão recorrente detectado
    let generatedWorkflows: GeneratedWorkflow[] = [];
    if (patterns.some(p => p.isRecurrent && p.occurrences >= 3)) {
      generatedWorkflows = await this.workflowGen.generate(patterns.filter(p => p.isRecurrent));
      await this.eventBus.publish("learning.workflow_created",
        { workflows: generatedWorkflows.map(w => w.workflowId), userId: ctx.userId }
      );
    }

    // 4. Predizer próximos goals
    const predictions = await this.prediction.predict(ctx.userId, record, ctx);
    if (predictions.length > 0) {
      await this.eventBus.publish("learning.goal_predicted",
        { predictions: predictions.map(p => ({ goalDomain: p.domain, probability: p.probability })) }
      );
    }

    // 5. Gerar recomendações
    const recommendations = await this.recommend.generate(record, patterns, habits, ctx);
    const automationSugg  = await this.autoSuggest.generate(patterns, ctx);

    // 6. Persistir aprendizado na memória
    await this.persistLearning(record, patterns, habits, generatedWorkflows, predictions);

    // 7. Alimentar os outros motores
    await this.feedOtherEngines(record, patterns, habits, predictions, ctx);

    // 8. Emitir evento final
    await this.eventBus.publish("learning.completed", {
      userId:     ctx.userId,
      goalId:     executionResult.goalId,
      patterns:   patterns.length,
      habits:     habits.length,
      workflows:  generatedWorkflows.length,
      predictions: predictions.length,
    });

    this.metrics.record(record, Date.now() - t0);
    return record;
  }

  private async feedOtherEngines(
    record:      LearningRecord,
    patterns:    DetectedPattern[],
    habits:      DetectedHabit[],
    predictions: GoalPrediction[],
    ctx:         LearningContext
  ): Promise<void> {
    await Promise.all([
      // Memory Engine: persistir fatos aprendidos
      ...record.memoryProposals.map(p => this.memory.store(p)),

      // Goal Engine: atualizar GoalTemplates com novos padrões
      this.goalEngine.updateTemplates(patterns),

      // Capability Negotiation: atualizar bônus de histórico
      this.negotiation.updateLearningBonus(record.connectorUsage),

      // Marketplace: registrar métricas de uso para ranqueamento
      this.marketplace.recordUsage(record.connectorUsage),

      // Specialists: atualizar contexto de conhecimento
      this.specialists.updateContext(record.specialistInsights),
    ]);
  }
}
```

## 3.3 LearningPipeline

```typescript
@Injectable()
export class LearningPipeline {
  async process(result: ExecutionResult, ctx: LearningContext): Promise<LearningRecord> {
    return {
      recordId:        generateId("lrn"),
      userId:          ctx.userId,
      goalId:          result.goalId,
      executionId:     result.planId,
      success:         result.status === "COMPLETED",
      durationMs:      result.durationMs,
      connectorUsage:  this.extractConnectorUsage(result),
      specialistInsights: ctx.specialistInsights ?? [],
      memoryProposals: this.extractMemoryProposals(result, ctx),
      contextSignals: {
        dayOfWeek:    new Date(ctx.executedAt).getDay(),
        hourOfDay:    new Date(ctx.executedAt).getHours(),
        projectId:    ctx.projectId,
        deviceType:   ctx.deviceType,
        voiceMode:    ctx.voiceMode,
      },
      feedbackScore:   null,  // preenchido depois se usuário avaliar
      createdAt:       new Date().toISOString(),
    };
  }
}
```

## 3.4 PatternDetector

```typescript
@Injectable()
export class PatternDetector {
  async detect(record: LearningRecord): Promise<DetectedPattern[]> {
    const history = await this.store.getRecent(record.userId, 90); // 90 dias
    const patterns: DetectedPattern[] = [];

    // Padrão 1: Sequência de goals recorrente
    const sequences = this.detectSequences(history, record);
    patterns.push(...sequences);

    // Padrão 2: Combinação de Connectors recorrente
    const connectorCombos = this.detectConnectorCombinations(history);
    patterns.push(...connectorCombos);

    // Padrão 3: Horário recorrente
    const temporal = this.detectTemporalPatterns(history);
    patterns.push(...temporal);

    // Padrão 4: Repetição contextual (ex: toda segunda-feira)
    const contextual = this.detectContextualPatterns(history);
    patterns.push(...contextual);

    if (patterns.length > 0) {
      await this.eventBus.publish("learning.pattern_detected", {
        userId:    record.userId,
        patterns:  patterns.map(p => ({ type: p.type, occurrences: p.occurrences })),
      });
    }

    return patterns;
  }
}
```

## 3.5 HabitDetector

```typescript
@Injectable()
export class HabitDetector {
  async detect(record: LearningRecord, userId: string): Promise<DetectedHabit[]> {
    const history = await this.store.getRecent(userId, 30);
    return [
      ...this.detectTimeHabits(history),       // "sempre às 9h na segunda"
      ...this.detectConnectorHabits(history),   // "sempre usa Gmail antes de Calendar"
      ...this.detectWorkflowHabits(history),    // "sempre faz X após Y"
      ...this.detectErrorPatterns(history),     // "sempre falha quando Z"
      ...this.detectApprovalPatterns(history),  // "sempre aprovado pelo mesmo manager"
    ];
  }
}
```

## 3.6 WorkflowGenerator

```typescript
@Injectable()
export class WorkflowGenerator {
  async generate(patterns: DetectedPattern[]): Promise<GeneratedWorkflow[]> {
    return Promise.all(patterns
      .filter(p => p.isRecurrent && p.confidence > 0.80)
      .map(async p => {
        const workflow = this.buildWorkflowFromPattern(p);
        await this.workflowRegistry.register(workflow);
        return workflow;
      })
    );
  }

  private buildWorkflowFromPattern(pattern: DetectedPattern): GeneratedWorkflow {
    return {
      workflowId:    generateId("wfl"),
      name:          `Auto: ${pattern.description}`,
      description:   `Workflow gerado automaticamente baseado em ${pattern.occurrences} ocorrências`,
      confidence:    pattern.confidence,
      origin:        "LEARNING_ENGINE",
      steps:         pattern.steps.map(this.buildStep),
      trigger:       pattern.trigger,
      suggestToUser: true,         // aguarda confirmação do usuário antes de ativar
      createdAt:     new Date().toISOString(),
    };
  }
}
```

## 3.7 GoalPredictionEngine

```typescript
@Injectable()
export class GoalPredictionEngine {
  async predict(userId: string, record: LearningRecord, ctx: LearningContext): Promise<GoalPrediction[]> {
    const [temporal, sequential, behavioral] = await Promise.all([
      this.predictTemporal(userId, ctx),     // "sexta-feira às 17h → relatório financeiro"
      this.predictSequential(userId, record), // "após emitir NF-e → enviar por email"
      this.predictBehavioral(userId, ctx),    // "quando no smartphone → preferência por voz"
    ]);

    return [...temporal, ...sequential, ...behavioral]
      .filter(p => p.probability >= 0.65)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);  // top 5 predições
  }
}
```

## 3.8 AutomationSuggestionEngine

```typescript
@Injectable()
export class AutomationSuggestionEngine {
  async generate(patterns: DetectedPattern[], ctx: LearningContext): Promise<AutomationSuggestion[]> {
    return patterns
      .filter(p => p.occurrences >= 3 && p.confidence > 0.75)
      .map(p => ({
        suggestionId:  generateId("sug"),
        title:         `Automatizar: ${p.description}`,
        description:   `Detectei que você executa este processo ${p.occurrences} vezes. Posso automatizá-lo.`,
        pattern:       p,
        estimatedTimeSavedMinutes: p.avgDurationMin * p.occurrences,
        activationOptions: [
          { label: "Automatizar agora",      action: "AUTO_ACTIVATE" },
          { label: "Pedir confirmação antes", action: "CONFIRM_BEFORE" },
          { label: "Ignorar",                action: "DISMISS" },
        ],
        confidence: p.confidence,
        priority:   p.occurrences > 10 ? "HIGH" : "MEDIUM",
      }));
  }
}
```

---

# REVISÃO 5 — TABELA DE RESPONSABILIDADE DOS MOTORES

---

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           TABELA OFICIAL DE RESPONSABILIDADE DOS MOTORES — MDS v1.1                         │
├──────────────────────────┬────────────────────────────────────────────────────────────────────────────────────┤
│ Motor                    │ Responsabilidade · Entradas · Saídas · Deps · Eventos                            │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ NLUEngine                │ R: Compreender linguagem natural                                                   │
│                          │ E: raw string, RequestContext                                                      │
│                          │ S: NLUResult (domain, entities, confidence)                                        │
│                          │ D: LLMProvider, MemoryEngine                                                       │
│                          │ P: intent.nlu_processed                                                            │
│                          │ C: —                                                                               │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ IntentEngine             │ R: Classificar, normalizar, detectar entidades                                     │
│                          │ E: NLUResult, RequestContext                                                        │
│                          │ S: IntentResult                                                                     │
│                          │ D: NLUEngine, ContextEngine, MemoryEngine                                          │
│                          │ P: intent.processed                                                                 │
│                          │ C: —                                                                                │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ GoalEngine (MGIS)        │ R: Decompor, priorizar, resolver conflitos de Goals                               │
│                          │ E: IntentResult, GoalContext                                                        │
│                          │ S: GoalPlan                                                                         │
│                          │ D: GoalDecomposer, GoalPrioritizer, SpecialistBus, GoalMemory                      │
│                          │ P: goal.created                                                                     │
│                          │ C: learning.goal_predicted                                                          │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ GoalValidationEngine     │ R: Validar se Goal pode prosseguir (permissões, compliance, budget...)            │
│ (NOVO v1.1)              │ E: GoalPlan, GoalContext                                                           │
│                          │ S: ValidationResult                                                                 │
│                          │ D: PolicyEngine, PermissionEngine, BudgetGuard, QuotaGuard                         │
│                          │ P: goal.validated, goal.denied, goal.pending_approval, goal.validation_failed      │
│                          │ C: —                                                                                │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ Planner                  │ R: Converter GoalPlan em ExecutionPlan sequenciado                                 │
│                          │ E: GoalPlan (validado)                                                              │
│                          │ S: ExecutionPlan                                                                    │
│                          │ D: MCISRuntime, GoalEngine                                                          │
│                          │ P: plan.created                                                                     │
│                          │ C: goal.validated                                                                   │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ CapabilityNegotiation    │ R: Selecionar melhor Connector por score multi-critério                           │
│ Engine (NOVO v1.1)       │ E: ExecutionPlan, NegotiationContext                                               │
│                          │ S: NegotiatedPlan (com assignments e fallbacks)                                     │
│                          │ D: MCISRuntime, CapabilityHealth, CapabilityHistory, CapabilityPreference          │
│                          │ P: capability.negotiated, capability.selected, capability.failed                    │
│                          │ C: learning.completed                                                               │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ MCISRuntime              │ R: Resolver Capabilities → Connectors disponíveis                                  │
│                          │ E: ExecutionStep.requiredCapability                                                  │
│                          │ S: CapabilityCandidate[]                                                            │
│                          │ D: CapabilityRegistry, CapabilityGraph                                              │
│                          │ P: connector.hot_plugged, connector.hot_removed                                     │
│                          │ C: —                                                                                │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ ConnectorManager         │ R: Autenticar, rotear, sandboxear Connectors                                       │
│                          │ E: ConnectorAssignment (do NegotiatedPlan)                                          │
│                          │ S: ConnectorInstance pronto para execução                                           │
│                          │ D: CredentialStore, ConnectorSandbox, CircuitBreaker                                │
│                          │ P: connector.authenticated, connector.sandbox_created                               │
│                          │ C: capability.selected                                                              │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ ExecutionEngine          │ R: Executar steps (sequencial, paralelo, retry, fallback)                         │
│                          │ E: NegotiatedPlan, ExecutionContext                                                  │
│                          │ S: ExecutionResult                                                                   │
│                          │ D: ConnectorManager, CircuitBreaker, MetricsCollector                               │
│                          │ P: execution.step.completed, execution.completed, execution.failed                  │
│                          │ C: capability.selected                                                              │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ LearningEngine           │ R: Transformar resultado de execução em aprendizado                                │
│ (NOVO v1.1)              │ E: ExecutionResult, LearningContext                                                  │
│                          │ S: LearningRecord                                                                    │
│                          │ D: PatternDetector, HabitDetector, WorkflowGenerator, GoalPrediction               │
│                          │ P: learning.completed, learning.pattern_detected,                                   │
│                          │    learning.workflow_created, learning.goal_predicted                               │
│                          │ C: execution.completed, execution.failed                                            │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ MemoryEngine             │ R: Persistir e recuperar memória semântica do usuário                              │
│                          │ E: MemoryUpdateProposal, MemoryQuery                                                │
│                          │ S: MemoryRecord, MemorySearchResult[]                                               │
│                          │ D: MemoryStore (PostgreSQL), VectorIndex (pgvector), EmbeddingProvider             │
│                          │ P: memory.fact.stored, memory.updated                                               │
│                          │ C: learning.completed                                                               │
├──────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ PolicyEngine             │ R: Avaliar políticas ativas antes de validação                                     │
│                          │ E: Goal, GoalContext                                                                 │
│                          │ S: PolicyResult                                                                      │
│                          │ D: PolicyStore, OrgSettings                                                          │
│                          │ P: policy.evaluated, policy.violated                                                 │
│                          │ C: —                                                                                │
└──────────────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

**Escalabilidade por Motor:**

| Motor | Estratégia |
|---|---|
| NLU / Intent | Stateless → escala horizontal ilimitada |
| GoalEngine | Stateless + cache de GoalTemplates → escala horizontal |
| GoalValidationEngine | Stateless → escala horizontal |
| Planner | Stateless → escala horizontal |
| CapabilityNegotiation | Cache de health/history → escala horizontal com Redis |
| MCISRuntime | Registry em Redis (shared) → escala horizontal |
| ExecutionEngine | Worker pools → escala horizontal por workload |
| LearningEngine | Queue-based (Kafka) → escala horizontal async |
| MemoryEngine | Sharding por user_id + read replicas → escala vertical + horizontal |

---

# REVISÃO 6 — EVENTOS OFICIAIS ADICIONADOS

---

```typescript
// packages/shared/events/core-events.ts — adicionados no v1.1

// ─── GOAL VALIDATION ────────────────────────────────────────────────────────

/** Goal passou em todas as validações e pode prosseguir para o Planner */
export const GOAL_VALIDATED = "goal.validated";
// payload: { goalId, score: ValidationScore, warnings: string[], userId }

/** Goal foi negado por alguma validação (HARD_BLOCK) */
export const GOAL_DENIED = "goal.denied";
// payload: { goalId, reasons: ValidationReason[], evidence: ValidationEvidence[], userId }

/** Goal aguarda aprovação humana antes de prosseguir */
export const GOAL_PENDING_APPROVAL = "goal.pending_approval";
// payload: { goalId, approvalWorkflow: ApprovalWorkflow, userId }

/** Falha técnica no processo de validação (não bloqueio de negócio) */
export const GOAL_VALIDATION_FAILED = "goal.validation_failed";
// payload: { goalId, error: string, userId }

// ─── CAPABILITY NEGOTIATION ─────────────────────────────────────────────────

/** Capability negociada para um step específico do plano */
export const CAPABILITY_NEGOTIATED = "capability.negotiated";
// payload: { planId, stepId, connectorId, score: CapabilityScore }

/** Seleção final de todos os Connectors para um ExecutionPlan completo */
export const CAPABILITY_SELECTED = "capability.selected";
// payload: { planId, assignments: Array<{ stepId, connectorId, fallbacks }> }

/** Nenhuma Capability disponível e saudável encontrada para um step */
export const CAPABILITY_FAILED = "capability.failed";
// payload: { planId, stepId, requiredCapability, reason }

// ─── LEARNING ENGINE ─────────────────────────────────────────────────────────

/** Ciclo de aprendizado concluído após uma execução */
export const LEARNING_COMPLETED = "learning.completed";
// payload: { userId, goalId, patterns, habits, workflows, predictions }

/** Novo padrão comportamental detectado */
export const LEARNING_PATTERN_DETECTED = "learning.pattern_detected";
// payload: { userId, patterns: Array<{ type, occurrences, confidence }> }

/** Workflow automático gerado a partir de padrão recorrente */
export const LEARNING_WORKFLOW_CREATED = "learning.workflow_created";
// payload: { userId, workflows: string[], suggestToUser: boolean }

/** Predição de próximo goal gerada */
export const LEARNING_GOAL_PREDICTED = "learning.goal_predicted";
// payload: { userId, predictions: Array<{ goalDomain, probability, expectedAt }> }
```

---

# REVISÃO 7 — OBSERVABILIDADE — NOVAS MÉTRICAS

---

```typescript
// packages/infra/observability/metrics-v1.1.ts

export function setupV1_1Metrics(meter: Meter) {

  // ─── GOAL VALIDATION ──────────────────────────────────────────────────────

  const goalValidationDuration = meter.createHistogram(
    "goal_validation_duration_ms",
    { description: "Duration of goal validation", unit: "ms",
      boundaries: [5, 10, 25, 50, 100, 250, 500] }
  );

  const goalValidationResult = meter.createCounter(
    "goal_validation_result_total",
    { description: "Goal validation results by status" }
  );
  // Labels: status (ALLOWED|DENIED|PENDING_APPROVAL|BLOCKED), domain

  const goalValidationScore = meter.createHistogram(
    "goal_validation_score",
    { description: "Validation score (0–100)", boundaries: [10,20,30,40,50,60,70,80,90,100] }
  );

  // ─── CAPABILITY NEGOTIATION ───────────────────────────────────────────────

  const capNegotiationDuration = meter.createHistogram(
    "capability_negotiation_duration_ms",
    { description: "Duration of capability negotiation per step", unit: "ms",
      boundaries: [1, 5, 10, 25, 50, 100, 250] }
  );

  const capabilityScore = meter.createHistogram(
    "capability_score",
    { description: "Final capability score (0.0–1.0)",
      boundaries: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] }
  );
  // Labels: connector_id

  const capabilityFallbackTotal = meter.createCounter(
    "capability_fallback_total",
    { description: "Number of times a fallback connector was used" }
  );
  // Labels: primary_connector_id, fallback_connector_id, reason

  const connectorSuccessRate = meter.createObservableGauge(
    "connector_success_rate",
    { description: "Rolling 24h success rate per connector (0.0–1.0)" }
  );

  // ─── LEARNING ENGINE ──────────────────────────────────────────────────────

  const learningDuration = meter.createHistogram(
    "learning_engine_duration_ms",
    { description: "Duration of learning pipeline processing", unit: "ms",
      boundaries: [10, 50, 100, 250, 500, 1000, 2500] }
  );

  const patternsDetected = meter.createCounter(
    "learning_patterns_detected_total",
    { description: "Total patterns detected by LearningEngine" }
  );
  // Labels: pattern_type (TEMPORAL|SEQUENTIAL|CONNECTOR_COMBO|CONTEXTUAL)

  const workflowsGenerated = meter.createCounter(
    "learning_workflows_generated_total",
    { description: "Total workflows auto-generated by LearningEngine" }
  );

  const predictionAccuracy = meter.createObservableGauge(
    "learning_prediction_accuracy",
    { description: "Goal prediction accuracy (rolling 7 days, 0.0–1.0)" }
  );

  const learningScore = meter.createHistogram(
    "learning_score",
    { description: "Learning quality score per record (0.0–1.0)",
      boundaries: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] }
  );

  const recommendationAccuracy = meter.createObservableGauge(
    "learning_recommendation_accuracy",
    { description: "Recommendation accuracy — % accepted by users (0.0–1.0)" }
  );

  const workflowSuccessRate = meter.createObservableGauge(
    "generated_workflow_success_rate",
    { description: "Success rate of auto-generated workflows (0.0–1.0)" }
  );

  const automationSuccessRate = meter.createObservableGauge(
    "automation_success_rate",
    { description: "Success rate of auto-activated automations (0.0–1.0)" }
  );

  // ─── ALERTAS V1.1 (Grafana) ───────────────────────────────────────────────
  // goal_validation_duration_ms{p95} > 200ms         → WARNING
  // goal_validation_result_total{status="DENIED"} rate spike → WARNING
  // capability_negotiation_duration_ms{p99} > 500ms  → WARNING
  // capability_fallback_total rate > 10% of total    → WARNING
  // connector_success_rate < 0.90                    → WARNING  (< 0.80 → CRITICAL)
  // learning_prediction_accuracy < 0.50              → INFO
  // recommendation_accuracy < 0.30                   → INFO
  // generated_workflow_success_rate < 0.70           → WARNING

  return {
    goalValidationDuration, goalValidationResult, goalValidationScore,
    capNegotiationDuration, capabilityScore, capabilityFallbackTotal, connectorSuccessRate,
    learningDuration, patternsDetected, workflowsGenerated, predictionAccuracy,
    learningScore, recommendationAccuracy, workflowSuccessRate, automationSuccessRate,
  };
}
```

---

# REVISÃO 8 — DIAGRAMAS UML ATUALIZADOS

---

## 8.1 Diagrama de Classes — Novos Motores

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  GoalValidationEngine                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ + validate(goal, ctx): ValidationResult                                      │
│ - runAllChecks(goal, ctx): ValidationCheck[]                                 │
│ - buildResult(goal, checks, ctx): ValidationResult                           │
│ - computeScore(checks): ValidationScore                                      │
│ - emitValidationEvent(result, goalId): void                                  │
└──────────────────────────────────────────────────────────────────────────────┘
         │ uses (15 checkers in parallel)
    ┌────┴──────────────────────────────────────────────────────┐
    │                                                           │
┌───▼──────────────────┐                       ┌───────────────▼───────────────┐
│  PermissionChecker   │                       │  BudgetGuard                  │
│  PolicyEvaluator     │                       │  QuotaGuard                   │
│  ComplianceChecker   │                       │  TimeWindowGuard              │
│  LicenseGuard        │                       │  FeatureFlagGuard             │
│  SecurityGuard       │   ...15 checkers...   │  ConnectorRestrictionGuard    │
│                      │                       │  OrganizationalHierarchyCheck │
└──────────────────────┘                       └───────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                  CapabilityNegotiationEngine                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ + negotiate(plan, ctx): NegotiatedPlan                                       │
│ - scoreAll(candidates, step, ctx): ScoredCapability[]                        │
│ - computeScore(cap, step, ctx): CapabilityScore                              │
│ - rank(scored): ScoredCapability[]                                           │
│ - selectBest(ranked, step): ScoredCapability                                 │
│ - buildFallbackChain(ranked, selected): ScoredCapability[]                   │
└──────────────────────────────────────────────────────────────────────────────┘
         │ uses
    ┌────┴──────────────────────────────────┐
    │                                       │
┌───▼────────────────────┐     ┌────────────▼─────────────────┐
│  CapabilityHealthMonitor│     │  CapabilityHistory           │
│  CapabilityPreference   │     │  CapabilityPolicy            │
│  CapabilityMetrics      │     │  MCISRuntime                 │
└─────────────────────────┘     └──────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                       LearningEngine                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ + learn(executionResult, ctx): LearningRecord                                │
│ - persistLearning(record, patterns, habits, workflows, predictions): void    │
│ - feedOtherEngines(record, patterns, habits, predictions, ctx): void         │
└──────────────────────────────────────────────────────────────────────────────┘
         │ uses
    ┌────┴──────────────────────────────────────────────┐
    │                                                   │
┌───▼────────────────────┐     ┌────────────────────────▼──────────────────┐
│  LearningPipeline      │     │  PatternDetector · HabitDetector          │
│  WorkflowGenerator     │     │  RecommendationEngine                     │
│  GoalPredictionEngine  │     │  AutomationSuggestionEngine               │
│  ContextEvolutionEngine│     │  LearningMetrics                          │
└────────────────────────┘     └───────────────────────────────────────────┘
```

## 8.2 Diagrama de Sequência — Fluxo Completo v1.1

```
┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐ ┌─────────┐ ┌───────────┐ ┌──────┐ ┌──────────┐
│ User │ │Intent│ │ Goal │ │Validation │ │ Planner │ │Negotiation│ │Exec. │ │ Learning │
│      │ │Engine│ │Engine│ │  Engine   │ │         │ │  Engine   │ │Engine│ │  Engine  │
└──┬───┘ └──┬───┘ └──┬───┘ └─────┬─────┘ └────┬────┘ └─────┬─────┘ └──┬───┘ └────┬─────┘
   │        │        │           │             │             │           │           │
   │ input  │        │           │             │             │           │           │
   │───────►│        │           │             │             │           │           │
   │        │intent  │           │             │             │           │           │
   │        │───────►│           │             │             │           │           │
   │        │        │ GoalPlan  │             │             │           │           │
   │        │        │──────────►│             │             │           │           │
   │        │        │           │ validate()  │             │           │           │
   │        │        │           │ (15 checks) │             │           │           │
   │        │        │ ALLOWED   │             │             │           │           │
   │        │        │◄──────────│             │             │           │           │
   │        │        │           │ plan        │             │           │           │
   │        │        │           │────────────►│             │           │           │
   │        │        │           │             │ negotiate() │           │           │
   │        │        │           │             │────────────►│           │           │
   │        │        │           │             │ NegotiatedPlan          │           │
   │        │        │           │             │◄────────────│           │           │
   │        │        │           │             │             │  execute  │           │
   │        │        │           │             │             │──────────►│           │
   │        │        │           │             │             │           │ result    │
   │        │        │           │             │             │           │──────────►│
   │        │        │           │             │             │           │           │ learn()
   │        │        │           │             │             │           │           │ feeds:
   │        │        │◄──────────────────────────────────────────────────────────── │memory
   │        │        │◄──────────────────────────────────────────────────────────── │goals
   │        │        │           │             │◄────────────────────────────────── │negotiation
   │ resp.  │        │           │             │             │           │           │
   │◄───────│        │           │             │             │           │           │
```

---

# REVISÃO 9 — DECLARAÇÃO FINAL DO MDS v1.1

---

## Composição Oficial do Core — MDS v1.1

O Core do MemoryOS é composto pelos seguintes motores oficiais:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                COMPOSIÇÃO OFICIAL DO CORE — MDS v1.1                        │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Motor                        │ Status                                      │
├──────────────────────────────┼─────────────────────────────────────────────┤
│ Natural Language Understanding│ MDS v1.0                                   │
│ Intent Engine                │ MDS v1.0                                    │
│ Goal Engine                  │ MDS v1.0 (MGIS)                            │
│ Goal Validation Engine       │ ★ NOVO — MDS v1.1                          │
│ Planner                      │ MDS v1.0                                    │
│ Capability Negotiation Engine│ ★ NOVO — MDS v1.1                          │
│ MCIS Runtime                 │ MDS v1.0 (MCIS)                            │
│ Connector Manager            │ MDS v1.0 (MCF)                             │
│ Execution Engine             │ MDS v1.0                                    │
│ Learning Engine              │ ★ NOVO — MDS v1.1                          │
│ Memory Engine                │ MDS v1.0                                    │
│ Policy Engine                │ MDS v1.0                                    │
│ Permission Engine            │ MDS v1.0                                    │
│ Knowledge Engine             │ MDS v1.0                                    │
│ Context Engine               │ MDS v1.0                                    │
│ Workflow Engine              │ MDS v1.0                                    │
│ Scheduler                    │ MDS v1.0                                    │
│ Notification Engine          │ MDS v1.0                                    │
│ Voice Engine                 │ MDS v1.0                                    │
│ Authentication Engine        │ MDS v1.0                                    │
│ Authorization Engine         │ MDS v1.0                                    │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Todos os componentes permanecem **desacoplados, orientados a eventos, altamente escaláveis e preparados para evolução contínua**, preservando integralmente a arquitetura definida pelo MAS, MCF, MCIS e MGIS.

Esta revisão consolida a **arquitetura definitiva do Manual Oficial de Engenharia do MemoryOS**.

---

**MDS v1.1 — Revisão Arquitetural Oficial**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.0  
**Novos Motores:** GoalValidationEngine · CapabilityNegotiationEngine · LearningEngine