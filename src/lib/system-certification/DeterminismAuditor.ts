/**
 * DeterminismAuditor.ts — Sprint EF-55
 *
 * TEST 10: Determinism — same input → same (or justified) output.
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
  return Object.freeze({ id: makeSCId("ar"), auditor: "DeterminismAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Determinism: ${passed}/${checks.length} passed` });
}

export class DeterminismAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    try {
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const { SelfOptimizationEngine }   = await import("@/lib/self-optimization/SelfOptimizationEngine");
      const { MetaCognitiveEngine }      = await import("@/lib/meta-cognition/MetaCognitiveEngine");

      // Run EF-52 twice with same input
      const input = { goal: "determinism_test", intent: "validate", capabilities: ["repository.read"], strategy: "direct_connector" };
      const r1 = KnowledgeReasoningEngine.reason(input);
      const r2 = KnowledgeReasoningEngine.reason(input);

      checks.push(chk("EF-52 Same Goal → Same Retrieved Count",
        "Same goal should retrieve the same number of rules.",
        r1.metrics.knowledgeRetrieved === r2.metrics.knowledgeRetrieved,
        [`run1=${r1.metrics.knowledgeRetrieved}`, `run2=${r2.metrics.knowledgeRetrieved}`],
        r1.metrics.knowledgeRetrieved !== r2.metrics.knowledgeRetrieved ? ["Non-deterministic rule retrieval"] : []));

      checks.push(chk("EF-52 Same Goal → Same Inference Depth",
        "Same goal should produce same inference depth.",
        r1.inferenceChain.depth === r2.inferenceChain.depth,
        [`run1_depth=${r1.inferenceChain.depth}`, `run2_depth=${r2.inferenceChain.depth}`],
        r1.inferenceChain.depth !== r2.inferenceChain.depth ? ["Non-deterministic inference depth"] : []));

      checks.push(chk("EF-52 Same Goal → Same Decision Conclusion",
        "Same goal should produce same conclusion.",
        r1.decision.conclusion === r2.decision.conclusion,
        [`run1=${r1.decision.conclusion.slice(0, 60)}`, `run2=${r2.decision.conclusion.slice(0, 60)}`],
        r1.decision.conclusion !== r2.decision.conclusion ? ["Non-deterministic conclusion"] : []));

      // EF-53 with same snapshot → same recommendation count
      const snap = SelfOptimizationEngine.buildSnapshot([]);
      const o1 = SelfOptimizationEngine.analyze(snap);
      const o2 = SelfOptimizationEngine.analyze(snap);
      checks.push(chk("EF-53 Same Snapshot → Same Recommendation Count",
        "Same snapshot should produce same number of recommendations.",
        o1.recommendations.length === o2.recommendations.length,
        [`run1=${o1.recommendations.length}`, `run2=${o2.recommendations.length}`],
        o1.recommendations.length !== o2.recommendations.length ? ["Non-deterministic recommendation count"] : []));

      // EF-54 same input → same bias count
      const mcInput = { goal: "determinism_test", strategy: "direct_connector", capabilities: ["repository.read"], connectors: ["github"], knowledgeRules: 3, inferenceDepth: 3, inferenceConf: 0.70, decisionConf: 0.72, decisionAuth: 0.70, optimizationRecs: 2, success: true, durationMs: 400, conflictCount: 0, confidence: 0.80, authority: 0.75 };
      const mc1 = MetaCognitiveEngine.analyze(mcInput);
      const mc2 = MetaCognitiveEngine.analyze(mcInput);
      checks.push(chk("EF-54 Same Input → Same Bias Count",
        "Same thought snapshot should detect same number of biases.",
        mc1.biases.length === mc2.biases.length,
        [`run1=${mc1.biases.length}`, `run2=${mc2.biases.length}`],
        mc1.biases.length !== mc2.biases.length ? ["Non-deterministic bias detection"] : []));

    } catch (e: unknown) {
      checks.push(chk("Determinism Audit — Runtime Error", "All determinism checks.", false, [], [`${e instanceof Error ? e.message : String(e)}`]));
    }

    return buildResult(checks, t0);
  }
}