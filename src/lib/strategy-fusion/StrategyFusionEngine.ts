// ─── Strategy Fusion Engine ────────────────────────────────────────────────────
// Foundation v1.0 · Orchestrator — requests strategies, detects conflicts,
// resolves conflicts, synthesises Unified Strategy

import type {
  FusionSession, SpecialistStrategy, UnifiedStrategy,
  UnifiedStrategyStep, DecisionRecord,
} from "./SFETypes";
import { makeSFEId, makeFusionAudit } from "./SFETypes";
import { fusionEventBus }  from "./SFEEvents";
import { buildStrategy }   from "./StrategyBuilder";
import { detectConflicts, resolveConflicts } from "./ConflictEngine";
import { calculateFusionScores } from "./ScoreEngine";
import { routingSessionGet }    from "@/lib/specialist-router/SpecialistRouter";
import { bootstrapSpecialists } from "@/lib/specialist-router/SpecialistCatalog";
import { repoGet as getGoal }   from "@/lib/goal-engine/GoalEngine";
import { createWorkingMemoryEngine } from "@/lib/wme";
import type { IdentityContext } from "@/lib/wme/types";

const { engine: wme } = createWorkingMemoryEngine();
const _sessions = new Map<string, FusionSession>();

bootstrapSpecialists();

// ── Session repo ──────────────────────────────────────────────────────────────

export function fusionSessionGet(id: string): FusionSession | undefined { return _sessions.get(id); }
export function fusionSessionList(): FusionSession[] { return [..._sessions.values()]; }

// ── Unified Strategy builder ──────────────────────────────────────────────────

function synthesiseUnifiedStrategy(
  goalId: string,
  goalTitle: string,
  strategies: SpecialistStrategy[],
  sessionId: string,
): { unified: UnifiedStrategy; decisions: DecisionRecord[] } {
  const decisions: DecisionRecord[] = [];

  // Domain dependency order for sequencing
  const DOMAIN_ORDER: Record<string, number> = {
    juridico: 1, contabil: 2, tributario: 3, anvisa: 3,
    financeiro: 4, comercio_exterior: 4, rh: 4, compliance: 5, geral: 6,
  };

  const sorted = [...strategies].sort((a, b) =>
    (DOMAIN_ORDER[a.domain] ?? 9) - (DOMAIN_ORDER[b.domain] ?? 9)
  );

  // Build sequence — group by order, parallel within same level
  const byOrder = new Map<number, SpecialistStrategy[]>();
  sorted.forEach(s => {
    const ord = DOMAIN_ORDER[s.domain] ?? 9;
    if (!byOrder.has(ord)) byOrder.set(ord, []);
    byOrder.get(ord)!.push(s);
  });

  const steps: UnifiedStrategyStep[] = [];
  let stepOrder = 1;
  const processed: string[] = [];

  for (const [, group] of [...byOrder.entries()].sort(([a], [b]) => a - b)) {
    const isParallel = group.length > 1;
    for (const s of group) {
      const action = s.recommendations.find(r => r.priority === "Critical")?.title
        ?? s.recommendations[0]?.title
        ?? s.objective;
      steps.push({
        order:         stepOrder,
        specialistId:  s.specialistId,
        specialistName: s.specialistName,
        action,
        rationale:     `${s.specialistName}: ${s.justifications[0] ?? s.objective}`,
        dependencies:  s.dependencies.filter(d => processed.includes(d)),
        parallel:      isParallel,
      });

      decisions.push({
        id:                  makeSFEId("dec"),
        description:         `Incluir ${s.specialistName} na estratégia unificada`,
        specialistSuggested: s.specialistId,
        accepted:            true,
        reason:              `Confidence ${(s.confidenceLevel*100).toFixed(0)}% · ${s.recommendations.length} recomendações`,
        alternatives:        [],
        rule:                "AlwaysAccepted",
        timestamp:           Date.now(),
      });

      processed.push(s.specialistId);
    }
    stepOrder++;
  }

  // Collect all unique priorities, risks, deps
  const priorities = sorted.flatMap(s => s.recommendations.filter(r => r.priority === "Critical").map(r => r.title));
  const risks       = [...new Set(sorted.flatMap(s => s.risks))];
  const deps        = [...new Set(sorted.flatMap(s => s.dependencies))];
  const justs       = sorted.map(s => `[${s.specialistName}] ${s.justifications[0]}`);

  const { scores: fusionScores, explanations } = calculateFusionScores(
    strategies,
    [],  // passed empty — final unified has no pending conflicts
    sorted.map(s => s.domain),
  );

  return {
    unified: {
      id:               makeSFEId("us"),
      goalId,
      goalTitle,
      sequence:         steps,
      priorities:       [...new Set(priorities)],
      justifications:   justs,
      risks,
      dependencies:     deps,
      decisions,
      conflictsHandled: 0,
      specialists:      sorted.map(s => s.specialistId),
      scores:           fusionScores,
      createdAt:        Date.now(),
    },
    decisions,
  };
}

// ── Main API ──────────────────────────────────────────────────────────────────

export interface FuseInput {
  goalId:           string;
  routingSessionId: string;
  identityContext:  IdentityContext;
}

export async function fuseStrategies(input: FuseInput): Promise<FusionSession> {
  const goal = getGoal(input.goalId);
  if (!goal) throw new Error(`Goal '${input.goalId}' not found`);

  const routing = routingSessionGet(input.routingSessionId);
  if (!routing) throw new Error(`RoutingSession '${input.routingSessionId}' not found`);
  if (routing.status !== "Completed") throw new Error("RoutingSession must be Completed");

  const sessionId = makeSFEId("sfe_sess");
  const now       = Date.now();

  const session: FusionSession = {
    id: sessionId, goalId: goal.id, goalTitle: goal.title,
    routingSessionId: input.routingSessionId,
    strategies: [], conflicts: [], unifiedStrategy: null,
    scores: null, scoreExplanations: [],
    auditLog: [makeFusionAudit("fusion_started", { detail: `Goal: ${goal.title} · ${routing.selected.length} specialists` })],
    status: "Running", createdAt: now, updatedAt: now,
  };
  _sessions.set(sessionId, session);

  // ── 1. Request strategies from each selected specialist
  for (const match of routing.selected) {
    fusionEventBus.publish("StrategyRequested", sessionId, { goalId: goal.id, specialistId: match.specialist.id });
  }

  // ── 2. Build strategies deterministically
  const strategies: SpecialistStrategy[] = [];
  for (const match of routing.selected) {
    const strat = buildStrategy(match.specialist, goal.id, goal.title);
    strategies.push(strat);
    session.auditLog.push(makeFusionAudit("strategy_received", { detail: `${match.specialist.name}: ${strat.recommendations.length} recomendações` }));
    fusionEventBus.publish("StrategyReceived", sessionId, { goalId: goal.id, specialistId: match.specialist.id, meta: { recCount: strat.recommendations.length } });
  }
  session.strategies = strategies;

  // ── 3. Detect conflicts
  const rawConflicts = detectConflicts(strategies);
  for (const c of rawConflicts) {
    session.auditLog.push(makeFusionAudit("conflict_detected", { detail: `[${c.type}] ${c.description}` }));
    fusionEventBus.publish("ConflictDetected", sessionId, { goalId: goal.id, meta: { type: c.type } });
  }

  // ── 4. Resolve conflicts
  const resolvedConflicts = resolveConflicts(rawConflicts, strategies);
  for (const c of resolvedConflicts) {
    if (c.status === "Resolved") {
      session.auditLog.push(makeFusionAudit("conflict_resolved", { detail: `${c.resolution?.justification}` }));
      fusionEventBus.publish("ConflictResolved", sessionId, { goalId: goal.id, meta: { rule: c.resolution?.rule } });
    } else {
      session.auditLog.push(makeFusionAudit("conflict_pending_human", { detail: `Requires human approval: ${c.description}` }));
    }
  }
  session.conflicts = resolvedConflicts;

  // ── 5. Merge — apply conflict resolutions to strategy recommendations
  const dominantDomains = new Set(resolvedConflicts.filter(c => c.status === "Resolved").map(c => c.resolution!.winner));
  for (const strategy of strategies) {
    for (const conflict of resolvedConflicts.filter(c => c.status === "Resolved" && c.resolution?.loser === strategy.specialistId)) {
      const losingRec = strategy.recommendations.find(r =>
        conflict.recommendationA.includes(r.title) || conflict.recommendationB.includes(r.title)
      );
      if (losingRec) {
        losingRec.status = "Rejected";
        losingRec.rejectionReason = conflict.resolution!.justification;
      }
    }
    fusionEventBus.publish("StrategyMerged", sessionId, { goalId: goal.id, specialistId: strategy.specialistId });
  }

  // ── 6. Calculate fusion scores
  const { scores, explanations } = calculateFusionScores(strategies, resolvedConflicts, strategies.map(s => s.domain));
  session.scores = scores;
  session.scoreExplanations = explanations;

  // ── 7. Synthesise Unified Strategy
  const { unified, decisions } = synthesiseUnifiedStrategy(goal.id, goal.title, strategies, sessionId);
  unified.conflictsHandled = resolvedConflicts.filter(c => c.status === "Resolved").length;
  unified.scores = scores;
  session.unifiedStrategy = unified;

  session.auditLog.push(makeFusionAudit("unified_strategy_created", { detail: `${unified.sequence.length} steps · ${unified.conflictsHandled} conflicts resolved` }));
  fusionEventBus.publish("UnifiedStrategyCreated", sessionId, { goalId: goal.id, meta: { steps: unified.sequence.length } });

  // ── 8. Complete
  session.status    = "Completed";
  session.updatedAt = Date.now();
  session.auditLog.push(makeFusionAudit("fusion_completed", { detail: `Score: ${scores.overallScore}` }));
  fusionEventBus.publish("FusionCompleted", sessionId, { goalId: goal.id, meta: { overallScore: scores.overallScore } });

  await wme.store(input.identityContext, `fusion_session:${sessionId}`, { session }, { priority: "normal" });

  return session;
}