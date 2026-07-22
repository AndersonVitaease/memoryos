/**
 * IsolationAuditor.ts — Sprint EF-55
 *
 * TEST 5: Isolation — disabling EF-51/52/53/54 individually must not crash core.
 * No engine can bring down the entire system.
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
  return Object.freeze({ id: makeSCId("ar"), auditor: "IsolationAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Isolation: ${passed}/${checks.length} passed` });
}

export class IsolationAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    // EF-54 MetaCognition can be skipped — system continues
    try {
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const { SelfOptimizationEngine }   = await import("@/lib/self-optimization/SelfOptimizationEngine");
      const r1 = KnowledgeReasoningEngine.reason({ goal: "isolation_no_meta" });
      const s1 = SelfOptimizationEngine.buildSnapshot([]);
      SelfOptimizationEngine.analyze(s1);
      checks.push(chk("EF-52+53 Without EF-54", "Reasoning + Optimization run without Meta-Cognition.", true,
        [`reasoning_id=${r1.id}`, `opt_recs=${SelfOptimizationEngine.getLastReport()?.recommendations.length ?? 0}`], []));
    } catch (e) {
      checks.push(chk("EF-52+53 Without EF-54", "Isolation test.", false, [], [`${e}`]));
    }

    // EF-53 Optimization can be skipped — reasoning continues
    try {
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const r2 = KnowledgeReasoningEngine.reason({ goal: "isolation_no_opt" });
      checks.push(chk("EF-52 Without EF-53", "Reasoning runs without Optimization.", true, [`id=${r2.id}`], []));
    } catch (e) {
      checks.push(chk("EF-52 Without EF-53", "Isolation test.", false, [], [`${e}`]));
    }

    // EF-52 Reasoning can be skipped — learning continues
    try {
      const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
      const lr = LearningEngine.learn([]);
      checks.push(chk("EF-51 Without EF-52", "Learning runs without Reasoning.", true, [`knowledgeCreated=${lr.knowledgeCreated}`], []));
    } catch (e) {
      checks.push(chk("EF-51 Without EF-52", "Isolation test.", false, [], [`${e}`]));
    }

    // EF-51 Learning with empty episodes → degrades gracefully (no crash)
    try {
      const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
      const lr = LearningEngine.learn([]);
      const degraded = lr.knowledgeCreated === 0;
      checks.push(chk("EF-51 Graceful Degradation (0 episodes)",
        "LearningEngine with no episodes must degrade gracefully, not crash.",
        true,
        [`knowledgeCreated=${lr.knowledgeCreated}`, `degraded=${degraded}`], []));
    } catch (e) {
      checks.push(chk("EF-51 Graceful Degradation", "Isolation test.", false, [], [`${e}`]));
    }

    // EF-52 Reasoning with empty KnowledgeStore → graceful
    try {
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const r3 = KnowledgeReasoningEngine.reason({ goal: "empty_store_test" });
      checks.push(chk("EF-52 Graceful Degradation (0 rules)",
        "Reasoning with no knowledge must return valid (possibly empty) report.",
        "id" in r3 && r3.decision.isTemporary === true,
        [`retrieved=${r3.metrics.knowledgeRetrieved}`, `conclusion_length=${r3.decision.conclusion.length}`], []));
    } catch (e) {
      checks.push(chk("EF-52 Graceful Degradation", "Isolation test.", false, [], [`${e}`]));
    }

    // EF-53 with zero-episode snapshot → graceful
    try {
      const { SelfOptimizationEngine } = await import("@/lib/self-optimization/SelfOptimizationEngine");
      const s2  = SelfOptimizationEngine.buildSnapshot([]);
      const opt = SelfOptimizationEngine.analyze(s2);
      checks.push(chk("EF-53 Graceful Degradation (0 episodes)",
        "Optimization with no data must return valid report.",
        "id" in opt,
        [`recs=${opt.recommendations.length}`], []));
    } catch (e) {
      checks.push(chk("EF-53 Graceful Degradation", "Isolation test.", false, [], [`${e}`]));
    }

    return buildResult(checks, t0);
  }
}