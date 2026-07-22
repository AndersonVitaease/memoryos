/**
 * ScenarioValidator.ts — Sprint EF-55.1
 *
 * Valida um GoldenScenario contra a ExecutionEvidence real.
 * Calcula Certification Confidence: structural, behavior, evidence, runtime, overall.
 */

import type { GoldenScenario, ScenarioResult } from "./GoldenScenario";
import type { ExecutionEvidence }              from "../runtime/ExecutionEvidence";
import { ScenarioEvidence }                    from "./ScenarioEvidence";

const evidenceValidator = new ScenarioEvidence();

export class ScenarioValidator {
  validate(scenario: GoldenScenario, ev: ExecutionEvidence): ScenarioResult {
    const t0 = Date.now();
    const issues: string[] = [];
    const evidence: string[] = [];

    // ── Structural checks ─────────────────────────────────────────────────────

    const hasLearning    = ev.learningId !== "missing";
    const hasReasoning   = ev.reasoningId !== "missing";
    const hasOptimization= ev.optimizationId !== "missing";
    const hasMeta        = ev.metaId !== "missing";

    if (!hasLearning)     issues.push("EF-51 LearningEngine artifact missing");
    if (!hasReasoning)    issues.push("EF-52 ReasoningEngine artifact missing");
    if (!hasOptimization) issues.push("EF-53 OptimizationEngine artifact missing");
    if (!hasMeta)         issues.push("EF-54 MetaCognitiveEngine artifact missing");

    const structuralConf = ([hasLearning, hasReasoning, hasOptimization, hasMeta].filter(Boolean).length / 4);

    // ── Behavior checks ───────────────────────────────────────────────────────

    const successMatch    = ev.success === scenario.expectedSuccess;
    const strategyMatch   = ev.strategy === scenario.expectedStrategy || scenario.expectedStrategy === "any";
    const capMatch        = scenario.expectedCapabilities.length === 0 ||
                            scenario.expectedCapabilities.every(c => ev.capabilities.includes(c));
    const connMatch       = scenario.expectedConnectors.length === 0 ||
                            scenario.expectedConnectors.every(c => ev.connectors.includes(c));

    if (!successMatch)  issues.push(`Expected success=${scenario.expectedSuccess}, got=${ev.success}`);
    if (!strategyMatch) issues.push(`Expected strategy=${scenario.expectedStrategy}, got=${ev.strategy}`);
    if (!capMatch)      issues.push(`Missing expected capabilities: ${scenario.expectedCapabilities.filter(c => !ev.capabilities.includes(c)).join(", ")}`);
    if (!connMatch)     issues.push(`Missing expected connectors: ${scenario.expectedConnectors.filter(c => !ev.connectors.includes(c)).join(", ")}`);

    const behaviorConf = ([successMatch, strategyMatch, capMatch, connMatch].filter(Boolean).length / 4);

    // ── Evidence checks ───────────────────────────────────────────────────────

    const evCheck = evidenceValidator.validate(scenario, ev);
    evCheck.missing.forEach(f => issues.push(`Required evidence missing: ${f}`));
    evCheck.present.forEach(f => evidence.push(f));

    const evidenceConf = evCheck.coverageScore;

    // ── Runtime checks ────────────────────────────────────────────────────────

    const hasExecutionId  = ev.executionId.length > 5;
    const hasGoalId       = ev.goalId.length > 5;
    const hasReflectionId = ev.reflectionId !== "missing";
    const latencyOk       = ev.durationMs < 30000;

    if (!hasExecutionId)  issues.push("executionId missing from runtime");
    if (!hasGoalId)       issues.push("goalId missing from runtime");
    if (!hasReflectionId) issues.push("reflectionId missing — meta-cognition may not have run");
    if (!latencyOk)       issues.push(`Execution too slow: ${ev.durationMs}ms`);

    const runtimeConf = ([hasExecutionId, hasGoalId, hasReflectionId, latencyOk].filter(Boolean).length / 4);

    // ── Overall confidence ────────────────────────────────────────────────────

    const overall = (structuralConf * 0.30 + behaviorConf * 0.30 + evidenceConf * 0.25 + runtimeConf * 0.15);
    const score   = Math.round(overall * 100);
    // NC-06 remediation: removed inert filter '!i.includes("warning")' — no issue ever contained that string.
    // Status now correctly reflects issues.length directly.
    const status  = issues.length === 0 ? "pass" : score >= 70 ? "warn" : "fail";

    evidence.push(`executionId=${ev.executionId.slice(-12)}`);
    evidence.push(`learningId=${ev.learningId.slice(-12)}`);
    evidence.push(`reasoningId=${ev.reasoningId.slice(-12)}`);
    evidence.push(`metaConf=${(ev.metaConf * 100).toFixed(0)}%`);

    return Object.freeze({
      scenarioId:   scenario.id,
      scenarioName: scenario.name,
      status,
      score,
      evidence:     Object.freeze(evidence),
      issues:       Object.freeze(issues),
      confidence:   Object.freeze({ structural: structuralConf, behavior: behaviorConf, evidence: evidenceConf, runtime: runtimeConf, overall }),
      durationMs:   Date.now() - t0,
    });
  }
}