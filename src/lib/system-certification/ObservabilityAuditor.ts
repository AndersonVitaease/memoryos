/**
 * ObservabilityAuditor.ts — Sprint EF-55
 *
 * TEST 8: Observability — all engines must emit start, finish, duration, metrics, health.
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
  return Object.freeze({ id: makeSCId("ar"), auditor: "ObservabilityAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Observability: ${passed}/${checks.length} passed` });
}

export class ObservabilityAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    try {
      // EF-51 — report has generatedAt + durationMs + metrics
      const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
      const lr = LearningEngine.learn([]);
      checks.push(chk("EF-51 Report: generatedAt + durationMs",
        "LearningReport must have generatedAt and durationMs.",
        "generatedAt" in lr && "durationMs" in lr && lr.durationMs >= 0,
        [`generatedAt=${lr.generatedAt}`, `durationMs=${lr.durationMs}`], []));
      checks.push(chk("EF-51 Report: metrics object",
        "LearningReport must have metrics with episodesProcessed etc.",
        "metrics" in lr && typeof lr.metrics === "object",
        [`metrics.episodesProcessed=${lr.metrics.episodesProcessed}`], []));

      // EF-52 — report has id + durationMs + metrics
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const rr = KnowledgeReasoningEngine.reason({ goal: "obs_test" });
      checks.push(chk("EF-52 Report: id + durationMs + metrics",
        "ReasoningReport must have id, durationMs, metrics.",
        "id" in rr && "durationMs" in rr && "metrics" in rr,
        [`id=${rr.id}`, `durationMs=${rr.durationMs}`], []));
      checks.push(chk("EF-52 Report: summary string",
        "ReasoningReport must have non-empty summary.",
        typeof rr.summary === "string" && rr.summary.length > 0,
        [`summary_length=${rr.summary.length}`], []));

      // EF-53 — report has id + durationMs + metrics + summary
      const { SelfOptimizationEngine } = await import("@/lib/self-optimization/SelfOptimizationEngine");
      const opt = SelfOptimizationEngine.analyze(SelfOptimizationEngine.buildSnapshot([]));
      checks.push(chk("EF-53 Report: id + durationMs + summary",
        "OptimizationReport must have id, durationMs, summary.",
        "id" in opt && "durationMs" in opt && typeof opt.summary === "string",
        [`id=${opt.id}`, `summary_length=${opt.summary.length}`], []));

      // EF-54 — report has id + durationMs + metrics + summary
      const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine");
      const mc = MetaCognitiveEngine.analyze({ goal: "obs_test", strategy: "direct_connector", capabilities: [], connectors: [], knowledgeRules: 0, inferenceDepth: 0, inferenceConf: 0.5, decisionConf: 0.5, decisionAuth: 0.5, optimizationRecs: 0, success: true, durationMs: 100, conflictCount: 0, confidence: 0.5, authority: 0.5 });
      checks.push(chk("EF-54 Report: id + durationMs + summary",
        "MetaReport must have id, durationMs, summary.",
        "id" in mc && "durationMs" in mc && typeof mc.summary === "string",
        [`id=${mc.id}`, `summary_length=${mc.summary.length}`], []));

      // History singletons record entries
      const { OptimizationHistory } = await import("@/lib/self-optimization/OptimizationHistory");
      const { MetaHistory }          = await import("@/lib/meta-cognition/MetaHistory");
      checks.push(chk("EF-53 OptimizationHistory records entries",
        "OptimizationHistory must grow after analysis.",
        OptimizationHistory.getAll().length > 0,
        [`entries=${OptimizationHistory.getAll().length}`], []));
      checks.push(chk("EF-54 MetaHistory records entries",
        "MetaHistory must grow after analysis.",
        MetaHistory.getAll().length > 0,
        [`entries=${MetaHistory.getAll().length}`], []));

    } catch (e: unknown) {
      checks.push(chk("Observability Audit — Runtime Error", "All observability checks.", false, [], [`${e instanceof Error ? e.message : String(e)}`]));
    }

    return buildResult(checks, t0);
  }
}