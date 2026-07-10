// ─── Planning Intelligence Engine ─────────────────────────────────────────────
// Foundation v1.0 · Multi-plan generation · Scoring · Ranking · Optimization · JourneyBuilder

import type {
  PIESession, PlanCandidate, PlanScores, ScoreExplanation,
  Optimization, OptimizationType, LearningRecord, CandidateVariant,
} from "./PIETypes";
import { makePIEId, makePIEAuditEntry } from "./PIETypes";
import { pieEventBus }                  from "./PIEEvents";
import { repoGet as getGoal }           from "@/lib/goal-engine/GoalEngine";
import {
  createPlan, validateAndApprovePlan, buildJourneyFromPlan, planRepoGet,
} from "@/lib/planner-engine/PlannerEngine";
import { makeAuditEntry }               from "@/lib/planner-engine/PlannerTypes";
import type { ExecutionPlan, PlanStep, PlanRisk } from "@/lib/planner-engine/PlannerTypes";
import { makePlanId, makeStepId, DEFAULT_RETRY } from "@/lib/planner-engine/PlannerTypes";
import { planRepoCreate }               from "@/lib/planner-engine/PlannerEngine";
import type { IdentityContext }         from "@/lib/wme/types";
import { createWorkingMemoryEngine }    from "@/lib/wme";

const { engine: wme } = createWorkingMemoryEngine();

// ── In-memory session store ───────────────────────────────────────────────────

const _sessions = new Map<string, PIESession>();
const _learningLog: LearningRecord[] = [];

// ── Score computation (deterministic) ────────────────────────────────────────

const RISK_WEIGHT: Record<string, number> = { Low: 0, Medium: 25, High: 60, Critical: 100 };
const COST_WEIGHT: Record<string, number> = { Baixo: 100, Médio: 55, Alto: 10 };
const STRAT_COMPLEXITY: Record<string, number> = {
  Automatic: 95, Sequential: 80, Manual: 60, Conditional: 50, Approval: 45, Parallel: 40,
};

function parseDurationDays(d: string): number {
  if (!d || d === "Imediato") return 0.1;
  const nums = d.match(/\d+/g);
  if (!nums) return 5;
  const vals = nums.map(Number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function totalDurationDays(steps: PlanStep[]): number {
  return steps.reduce((sum, s) => sum + parseDurationDays(s.estimatedDuration), 0);
}

function scorePlan(plan: ExecutionPlan): { scores: PlanScores; explanations: ScoreExplanation[] } {
  const expl: ScoreExplanation[] = [];

  // Confidence (direct from plan, scaled 0–100)
  const confidenceScore = Math.round(plan.confidenceScore * 100);
  expl.push({ dimension: "confidenceScore", value: confidenceScore, rationale: `Confidence herdada do Goal: ${(plan.confidenceScore * 100).toFixed(0)}%` });

  // Risk (penalise by severity distribution)
  const riskPenalty = plan.risks.reduce((sum, r) => sum + RISK_WEIGHT[r.level], 0);
  const riskScore   = Math.max(0, Math.round(100 - riskPenalty / Math.max(plan.risks.length, 1)));
  expl.push({ dimension: "riskScore", value: riskScore, rationale: `${plan.risks.length} riscos. Penalidade média: ${(riskPenalty / Math.max(plan.risks.length, 1)).toFixed(0)}pts` });

  // Cost (qualitative mapping)
  const costScore = COST_WEIGHT[plan.estimatedCost] ?? 55;
  expl.push({ dimension: "costScore", value: costScore, rationale: `Custo estimado: ${plan.estimatedCost}` });

  // Time (inversely proportional to total estimated days, capped at 90 days)
  const days      = totalDurationDays(plan.steps);
  const timeScore = Math.round(Math.max(0, 100 - (days / 90) * 100));
  expl.push({ dimension: "timeScore", value: timeScore, rationale: `Duração total estimada: ~${days.toFixed(1)} dias` });

  // Complexity (based on strategy + step count)
  const stratBase    = STRAT_COMPLEXITY[plan.executionStrategy] ?? 60;
  const stepPenalty  = Math.min(plan.steps.length * 3, 40);
  const complexityScore = Math.max(0, stratBase - stepPenalty);
  expl.push({ dimension: "complexityScore", value: complexityScore, rationale: `Estratégia ${plan.executionStrategy} (${plan.steps.length} steps)` });

  // Dependency (penalise external connectors)
  const extDeps    = plan.steps.reduce((sum, s) => sum + s.requiredConnectors.length, 0);
  const dependencyScore = Math.max(0, 100 - extDeps * 15);
  expl.push({ dimension: "dependencyScore", value: dependencyScore, rationale: `${extDeps} dependências externas identificadas` });

  // Capability availability (approvals add friction)
  const approvalSteps = plan.steps.filter(s => s.approvalRequired).length;
  const capabilityAvailability = Math.max(0, 100 - approvalSteps * 10);
  expl.push({ dimension: "capabilityAvailability", value: capabilityAvailability, rationale: `${approvalSteps} steps requerem aprovação humana` });

  // Overall (weighted)
  const overallScore = Math.round(
    confidenceScore      * 0.20 +
    riskScore            * 0.25 +
    costScore            * 0.15 +
    timeScore            * 0.15 +
    complexityScore      * 0.10 +
    dependencyScore      * 0.10 +
    capabilityAvailability * 0.05
  );
  expl.push({ dimension: "overallScore", value: overallScore, rationale: "Score composto ponderado" });

  return {
    scores: { confidenceScore, riskScore, costScore, timeScore, complexityScore, dependencyScore, capabilityAvailability, overallScore },
    explanations: expl,
  };
}

// ── Variant generation (derives alternatives from a base plan) ─────────────────

function buildVariant(base: ExecutionPlan, variant: CandidateVariant): ExecutionPlan {
  const copy = JSON.parse(JSON.stringify(base)) as ExecutionPlan;
  copy.id = makePlanId(`plan_${variant.toLowerCase()}`);
  copy.status = "Draft";
  copy.metadata = { ...copy.metadata, variant };

  if (variant === "Fast") {
    // Remove optional approval gates to reduce cycle time
    copy.steps = copy.steps
      .filter(s => !s.approvalRequired || copy.steps.indexOf(s) === 0)
      .map(s => ({ ...s, id: makeStepId(), approvalRequired: false }));
    copy.executionStrategy = "Automatic";
    copy.estimatedDuration = "Reduzida (Fast)";
    copy.confidenceScore   = Math.max(0, base.confidenceScore - 0.1);
    copy.description += " [Variante: Fast — aprovações removidas para reduzir tempo]";
    // Re-wire sequential deps
    for (let i = 1; i < copy.steps.length; i++) copy.steps[i].dependencies = [copy.steps[i - 1].id];
  }

  if (variant === "Conservative") {
    // Add an extra review step at the end
    const reviewStep: PlanStep = {
      id: makeStepId(), title: "Revisão Final e Aprovação",
      description: "Revisar todos os resultados antes de concluir",
      objective: "Conformidade garantida", requiredCapabilities: ["mri"],
      requiredKnowledge: [], requiredConnectors: [], inputs: {}, outputs: {},
      dependencies: copy.steps.length > 0 ? [copy.steps[copy.steps.length - 1].id] : [],
      estimatedDuration: "1-2 dias", retryPolicy: DEFAULT_RETRY,
      timeout: 0, approvalRequired: true, executionStrategy: "Approval",
      status: "Pending", metadata: {},
    };
    copy.steps.push(reviewStep);
    const extraRisk: PlanRisk = { id: makePlanId("risk"), description: "Atraso por revisão adicional", level: "Low", mitigation: "Agendar revisão com antecedência" };
    copy.risks.push(extraRisk);
    copy.executionStrategy = "Approval";
    copy.estimatedDuration = "Estendida (Conservative)";
    copy.confidenceScore   = Math.min(1, base.confidenceScore + 0.05);
    copy.description += " [Variante: Conservative — revisão adicional incluída]";
  }

  if (variant === "Minimal") {
    // Keep only non-optional steps (first, last, and approval-required ones)
    const important = copy.steps.filter((s, i) => i === 0 || i === copy.steps.length - 1 || s.approvalRequired);
    copy.steps = important.map(s => ({ ...s, id: makeStepId() }));
    for (let i = 1; i < copy.steps.length; i++) copy.steps[i].dependencies = [copy.steps[i - 1].id];
    copy.risks = copy.risks.filter(r => r.level === "Critical" || r.level === "High");
    copy.executionStrategy = "Manual";
    copy.estimatedDuration = "Mínima (Minimal)";
    copy.confidenceScore   = Math.max(0, base.confidenceScore - 0.15);
    copy.description += " [Variante: Minimal — apenas etapas essenciais]";
  }

  copy.auditLog = [makeAuditEntry("created", { detail: `PIE variant: ${variant}` })];
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  return copy;
}

// ── Plan Optimizer ─────────────────────────────────────────────────────────────

function optimizePlan(plan: ExecutionPlan): { optimizedPlan: ExecutionPlan; optimizations: Optimization[] } {
  const opts: Optimization[] = [];
  const p = JSON.parse(JSON.stringify(plan)) as ExecutionPlan;

  // 1. Remove steps that are exact duplicates by title
  const seen = new Set<string>();
  const deduped = p.steps.filter(s => {
    if (seen.has(s.title)) {
      opts.push({ id: makePIEId("opt"), type: "RemoveRedundantStep", description: `Etapa duplicada removida: "${s.title}"`, impact: "Medium", applied: true });
      return false;
    }
    seen.add(s.title);
    return true;
  });
  if (deduped.length !== p.steps.length) p.steps = deduped;

  // 2. Re-wire broken sequential deps after dedup
  for (let i = 1; i < p.steps.length; i++) {
    const deps = p.steps[i].dependencies.filter(d => p.steps.some(s => s.id === d));
    if (deps.length === 0 && p.executionStrategy === "Sequential") {
      p.steps[i].dependencies = [p.steps[i - 1].id];
      opts.push({ id: makePIEId("opt"), type: "ReduceDependency", description: `Dependência sequencial restaurada para: "${p.steps[i].title}"`, impact: "Low", applied: true });
    } else {
      p.steps[i].dependencies = deps;
    }
  }

  // 3. Flag high-risk items that lack mitigation steps
  for (const risk of p.risks) {
    if ((risk.level === "Critical" || risk.level === "High") && !p.steps.some(s => s.description.toLowerCase().includes(risk.mitigation.split(" ")[0].toLowerCase()))) {
      opts.push({ id: makePIEId("opt"), type: "ReduceRisk", description: `Risco de nível ${risk.level} sem etapa de mitigação explícita: "${risk.description}"`, impact: "High", applied: false });
    }
  }

  // 4. Suggest simplifying flows with >10 steps
  if (p.steps.length > 10) {
    opts.push({ id: makePIEId("opt"), type: "SimplifyFlow", description: `Plano possui ${p.steps.length} etapas. Considerar consolidação de etapas similares.`, impact: "Medium", applied: false });
  }

  p.updatedAt = Date.now();
  p.auditLog.push(makeAuditEntry("optimized", { detail: `${opts.length} otimizações identificadas` }));
  return { optimizedPlan: p, optimizations: opts };
}

// ── Decision engine ────────────────────────────────────────────────────────────

function buildRationale(ranked: PlanCandidate[]): string {
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const parts: string[] = [];

  parts.push(`O ${winner.variant} foi selecionado com score ${winner.scores.overallScore}/100.`);

  if (winner.scores.riskScore > 70) parts.push("Apresenta perfil de risco controlado.");
  if (winner.scores.timeScore > 70)  parts.push("Possui estimativa de tempo reduzida.");
  if (winner.scores.costScore > 70)  parts.push("Representa o menor custo entre os candidatos.");

  if (runnerUp) {
    const diff = winner.scores.overallScore - runnerUp.scores.overallScore;
    parts.push(`Supera o ${runnerUp.variant} em ${diff} pontos.`);
    if (winner.scores.riskScore > runnerUp.scores.riskScore)       parts.push("Reduz riscos em relação à alternativa.");
    if (winner.scores.dependencyScore > runnerUp.scores.dependencyScore) parts.push("Possui menor dependência externa.");
    if (winner.scores.timeScore > runnerUp.scores.timeScore)        parts.push("Apresenta menor tempo estimado de execução.");
  }

  return parts.join(" ");
}

// ── PIE Session Repository ─────────────────────────────────────────────────────

export function pieSessionGet(id: string): PIESession | undefined { return _sessions.get(id); }
export function pieSessionList(): PIESession[] { return [..._sessions.values()]; }
export function getLearningLog(): LearningRecord[] { return [..._learningLog]; }

// ── PlanningIntelligenceEngine — Main API ──────────────────────────────────────

export interface PIERunInput {
  goalId:          string;
  identityContext: IdentityContext;
  variants?:       CandidateVariant[]; // defaults to Standard + Fast + Conservative
}

export async function runPIE(input: PIERunInput): Promise<PIESession> {
  const goal = getGoal(input.goalId);
  if (!goal)                     throw new Error(`Goal '${input.goalId}' not found`);
  if (goal.status !== "Validated") throw new Error(`Goal must be Validated. Current: ${goal.status}`);

  const sessionId = makePIEId("pie_sess");
  const now       = Date.now();

  const session: PIESession = {
    id: sessionId, goalId: goal.id, candidates: [],
    selectedPlanId: null, decisionRationale: "",
    optimizations: [], auditLog: [], status: "Running",
    createdAt: now, updatedAt: now, metadata: { goalTitle: goal.title },
  };
  _sessions.set(sessionId, session);

  session.auditLog.push(makePIEAuditEntry("planning_started", { detail: `Goal: ${goal.title}` }));
  pieEventBus.publish("PlanningStarted", sessionId, { goalId: goal.id });

  // ── 1. Generate candidates ─────────────────────────────────────────────────
  const requestedVariants: CandidateVariant[] = input.variants ?? ["Standard", "Fast", "Conservative"];

  const basePlan = await createPlan(goal.id, input.identityContext);
  planRepoCreate(basePlan); // already done inside createPlan, idempotent via Map.set

  const candidatePlans: Array<{ plan: ExecutionPlan; variant: CandidateVariant }> = [];

  for (const variant of requestedVariants) {
    let plan: ExecutionPlan;
    if (variant === "Standard") {
      plan = basePlan;
    } else {
      plan = buildVariant(basePlan, variant);
      planRepoCreate(plan); // register in plan repo for downstream use
    }
    candidatePlans.push({ plan, variant });

    session.auditLog.push(makePIEAuditEntry("candidate_generated", { detail: `Variant: ${variant}, plan: ${plan.id}` }));
    pieEventBus.publish("AlternativePlanGenerated", sessionId, { goalId: goal.id, planId: plan.id, meta: { variant } });
  }

  // ── 2. Optimize each candidate ─────────────────────────────────────────────
  const optimizedCandidates: Array<{ plan: ExecutionPlan; variant: CandidateVariant }> = [];

  for (const { plan, variant } of candidatePlans) {
    const { optimizedPlan, optimizations } = optimizePlan(plan);
    optimizedCandidates.push({ plan: optimizedPlan, variant });
    session.optimizations.push(...optimizations);

    if (optimizations.length > 0) {
      session.auditLog.push(makePIEAuditEntry("plan_optimized", { detail: `Variant ${variant}: ${optimizations.length} opts` }));
      pieEventBus.publish("PlanOptimized", sessionId, { goalId: goal.id, planId: plan.id, meta: { count: optimizations.length } });
    }
  }

  // ── 3. Score + rank ────────────────────────────────────────────────────────
  const scored = optimizedCandidates.map(({ plan, variant }) => {
    const { scores, explanations } = scorePlan(plan);
    return { plan, variant, scores, explanations };
  });

  scored.sort((a, b) => b.scores.overallScore - a.scores.overallScore);
  session.auditLog.push(makePIEAuditEntry("plans_compared", { detail: `${scored.length} plans ranked` }));
  pieEventBus.publish("PlanCompared", sessionId, { goalId: goal.id, meta: { count: scored.length } });

  // Build PlanCandidate objects
  session.candidates = scored.map(({ plan, variant, scores, explanations }, idx) => ({
    id:           makePIEId("cand"),
    planId:       plan.id,
    variant,
    plan,
    scores,
    explanations,
    benefits:     deriveBenefits(scores),
    limitations:  deriveLimitations(scores, variant),
    rankPosition: idx + 1,
    selected:     false,
  }));

  // ── 4. Select winner ───────────────────────────────────────────────────────
  const winner = session.candidates[0];
  winner.selected = true;
  session.selectedPlanId   = winner.planId;
  session.decisionRationale = buildRationale(session.candidates);

  session.auditLog.push(makePIEAuditEntry("plan_selected", { detail: `Winner: ${winner.variant} (${winner.scores.overallScore}/100) — ${session.decisionRationale}` }));
  pieEventBus.publish("PlanSelected", sessionId, { goalId: goal.id, planId: winner.planId, meta: { score: winner.scores.overallScore } });

  // ── 5. Register learning record (ready for future ML) ─────────────────────
  _learningLog.push({
    sessionId,
    goalId:          goal.id,
    selectedPlanId:  winner.planId,
    discardedPlanIds: session.candidates.filter(c => !c.selected).map(c => c.planId),
    selectionReason: session.decisionRationale,
    expectedOutcome: winner.plan.expectedOutcome,
    recordedAt:      Date.now(),
  });

  // ── 6. Validate + store selected plan ─────────────────────────────────────
  // Ensure selected plan is in repo with correct structure then validate
  const planInRepo = planRepoGet(winner.planId);
  if (planInRepo) {
    Object.assign(planInRepo, winner.plan, { id: winner.planId, status: "Draft" });
    validateAndApprovePlan(winner.planId);
  }

  // ── 7. Complete session ────────────────────────────────────────────────────
  session.status    = "Completed";
  session.updatedAt = Date.now();
  session.auditLog.push(makePIEAuditEntry("planning_completed", { detail: `Session ${sessionId}` }));
  pieEventBus.publish("PlanningCompleted", sessionId, { goalId: goal.id, planId: winner.planId });

  // Store session in Working Memory
  await wme.store(input.identityContext, `pie_session:${sessionId}`, { session }, { priority: "high" });

  return session;
}

/** Build Journey from PIE's selected plan */
export async function buildJourneyFromPIE(sessionId: string, identityContext: IdentityContext): Promise<string> {
  const session = _sessions.get(sessionId);
  if (!session)               throw new Error(`PIE session '${sessionId}' not found`);
  if (!session.selectedPlanId) throw new Error(`No plan selected in session '${sessionId}'`);

  const journeyId = await buildJourneyFromPlan(session.selectedPlanId, identityContext);
  session.metadata = { ...session.metadata, journeyId };
  session.auditLog.push(makePIEAuditEntry("journey_created", { detail: `Journey: ${journeyId}` }));
  return journeyId;
}

// ── Deriving human-readable benefits/limitations ──────────────────────────────

function deriveBenefits(s: PlanScores): string[] {
  const b: string[] = [];
  if (s.riskScore >= 75)            b.push("Perfil de risco controlado");
  if (s.timeScore >= 75)            b.push("Execução rápida");
  if (s.costScore >= 75)            b.push("Custo reduzido");
  if (s.complexityScore >= 75)      b.push("Baixa complexidade operacional");
  if (s.dependencyScore >= 75)      b.push("Baixa dependência externa");
  if (s.capabilityAvailability >= 75) b.push("Mínima necessidade de aprovações");
  if (b.length === 0)                b.push("Plano balanceado entre riscos e benefícios");
  return b;
}

function deriveLimitations(s: PlanScores, variant: CandidateVariant): string[] {
  const l: string[] = [];
  if (s.riskScore < 50)            l.push("Riscos significativos identificados");
  if (s.timeScore < 50)            l.push("Duração estimada elevada");
  if (s.costScore < 50)            l.push("Custo mais elevado");
  if (s.complexityScore < 50)      l.push("Fluxo de execução complexo");
  if (s.dependencyScore < 50)      l.push("Múltiplas dependências externas");
  if (s.capabilityAvailability < 50) l.push("Vários pontos de aprovação humana");
  if (variant === "Minimal")        l.push("Cobertura reduzida — apenas etapas essenciais");
  if (variant === "Fast")           l.push("Aprovações removidas — menor conformidade");
  if (variant === "Conservative")   l.push("Processo mais lento por revisão adicional");
  if (l.length === 0)               l.push("Nenhuma limitação significativa identificada");
  return l;
}