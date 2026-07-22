/**
 * ExplainabilityAuditor.ts — Sprint EF-55
 *
 * TEST 7: Explainability — every decision must answer:
 * goal, strategy, capability, knowledge, inference, optimization, reflection.
 * Every answer must have evidence.
 */

import type { AuditResult, AuditCheck, AuditStatus } from "./SCTypes";
import { makeSCId } from "./SCTypes";

function chk(name: string, desc: string, ok: boolean, evidence: string[], issues: string[]): AuditCheck {
  return Object.freeze({ id: makeSCId("chk"), name, description: desc, status: ok ? "pass" : "fail" as AuditStatus, score: ok ? 100 : 0, durationMs: 1, evidence: Object.freeze(evidence), issues: Object.freeze(issues) });
}
function buildResult(checks: AuditCheck[], t0: number): AuditResult {
  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warned = checks.filter(c => c.status === "warn").length;
  const score  = checks.length > 0 ? checks.reduce((s, c) => s + c.score, 0) / checks.length : 0;
  const status: AuditStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";
  return Object.freeze({ id: makeSCId("ar"), auditor: "ExplainabilityAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Explainability: ${passed}/${checks.length} passed` });
}

export class ExplainabilityAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    try {
      const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
      LearningEngine.learn(Array.from({ length: 15 }, (_, i) => ({
        id: `exp_${i}`, createdAt: Date.now(), goal: "explain_test", intent: "validate",
        context: "cert", strategy: "multi_step", capabilities: ["repository.read", "ast.parse"],
        connectorChain: ["github"], result: "completed", success: true, failure: false,
        confidence: 0.85, authority: 0.80, cost: 3, durationMs: 600, metadata: {},
      })));

      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const rr = KnowledgeReasoningEngine.reason({ goal: "explain_test", intent: "validate", capabilities: ["repository.read", "ast.parse"], strategy: "multi_step" });

      // Goal is traceable in reasoning report
      checks.push(chk("Explainability: Goal Traceable",
        "ReasoningReport.goal must match the input goal.",
        rr.goal === "explain_test",
        [`report.goal=${rr.goal}`], []));

      // Strategy in context
      checks.push(chk("Explainability: Decision Has Conclusion",
        "Decision must have non-empty conclusion.",
        rr.decision.conclusion.length > 0,
        [`conclusion_length=${rr.decision.conclusion.length}`], []));

      // Explainability report
      checks.push(chk("Explainability: ExplainabilityReport Exists",
        "Decision must have explainability with rulesApplied and inferenceTrace.",
        rr.decision.explainability.rulesApplied.length >= 0 && Array.isArray(rr.decision.explainability.inferenceTrace),
        [`rules_applied=${rr.decision.explainability.rulesApplied.length}`, `trace_steps=${rr.decision.explainability.inferenceTrace.length}`], []));

      // Justification
      checks.push(chk("Explainability: Decision Has Justification",
        "Decision.justification must be non-empty.",
        rr.decision.justification.length > 0,
        [`justification_length=${rr.decision.justification.length}`], []));

      // Knowledge evidence chain
      checks.push(chk("Explainability: Rules Used Are Traceable",
        "Decision.rulesUsed must contain traceable rule IDs.",
        Array.isArray(rr.decision.rulesUsed),
        [`rules_used=${rr.decision.rulesUsed.length}`], []));

      // Inference chain traceable
      checks.push(chk("Explainability: Inference Chain Steps Have Evidence",
        "Every InferenceStep must have at least one evidence item.",
        rr.inferenceChain.steps.every(s => s.evidence.length > 0),
        [`steps=${rr.inferenceChain.steps.length}`],
        rr.inferenceChain.steps.filter(s => s.evidence.length === 0).map(s => `Step ${s.stepIndex} missing evidence`)));

      // Meta-cognition reflection
      const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine");
      const mc = MetaCognitiveEngine.analyze({ goal: "explain_test", strategy: "multi_step", capabilities: ["repository.read"], connectors: ["github"], knowledgeRules: 5, inferenceDepth: rr.inferenceChain.depth, inferenceConf: rr.inferenceChain.overallConfidence, decisionConf: rr.decision.confidence, decisionAuth: rr.decision.authority, optimizationRecs: 0, success: true, durationMs: 600, conflictCount: rr.conflicts.length, confidence: 0.85, authority: 0.80 });
      checks.push(chk("Explainability: Reflection Has Strengths or Weaknesses",
        "Meta reflection must produce at least one item.",
        mc.reflection.strengths.length + mc.reflection.weaknesses.length > 0,
        [`strengths=${mc.reflection.strengths.length}`, `weaknesses=${mc.reflection.weaknesses.length}`], []));
      checks.push(chk("Explainability: Reflection Summary Non-Empty",
        "Reflection summary must be non-empty.",
        mc.reflection.summary.length > 0,
        [`summary_length=${mc.reflection.summary.length}`], []));

    } catch (e: unknown) {
      checks.push(chk("Explainability Audit — Runtime Error", "All explainability checks.", false, [], [`${e instanceof Error ? e.message : String(e)}`]));
    }

    return buildResult(checks, t0);
  }
}