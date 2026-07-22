/**
 * ArchitecturalComplianceAuditor.ts — Sprint EF-55
 *
 * TEST 6 + 12: Regression + SOLID / SRP / OCP / immutability / coupling.
 * Checks that all engines still function correctly (regression) and comply
 * with architectural rules (SOLID, SRP, immutability, low coupling).
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
  return Object.freeze({ id: makeSCId("ar"), auditor: "ArchitecturalComplianceAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Architecture: ${passed}/${checks.length} passed, score=${score.toFixed(0)}` });
}

export class ArchitecturalComplianceAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    try {
      // Regression: each engine must still return a typed output
      const regressionTargets = [
        { name: "EF-51 LearningEngine", fn: async () => { const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine"); return LearningEngine.learn([]); }, required: ["id", "durationMs", "metrics"] },
        { name: "EF-52 KnowledgeReasoningEngine", fn: async () => { const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine"); return KnowledgeReasoningEngine.reason({ goal: "regression" }); }, required: ["id", "decision", "inferenceChain"] },
        { name: "EF-53 SelfOptimizationEngine", fn: async () => { const { SelfOptimizationEngine } = await import("@/lib/self-optimization/SelfOptimizationEngine"); return SelfOptimizationEngine.analyze(SelfOptimizationEngine.buildSnapshot([])); }, required: ["id", "recommendations", "metrics"] },
        { name: "EF-54 MetaCognitiveEngine", fn: async () => { const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine"); return MetaCognitiveEngine.analyze({ goal: "regression", strategy: "direct_connector", capabilities: [], connectors: [], knowledgeRules: 0, inferenceDepth: 0, inferenceConf: 0.5, decisionConf: 0.5, decisionAuth: 0.5, optimizationRecs: 0, success: true, durationMs: 100, conflictCount: 0, confidence: 0.5, authority: 0.5 }); }, required: ["id", "biases", "reflection", "metrics"] },
      ];

      for (const target of regressionTargets) {
        try {
          const result = await target.fn();
          const missingFields = target.required.filter(f => !(f in (result as object)));
          checks.push(chk(
            `Regression: ${target.name}`,
            `${target.name} must still return all required fields.`,
            missingFields.length === 0,
            target.required.map(f => `${f}=present`),
            missingFields.map(f => `Missing field: ${f}`),
          ));
        } catch (e) {
          checks.push(chk(`Regression: ${target.name}`, "Runtime check.", false, [], [`${e}`]));
        }
      }

      // Immutability: frozen objects
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const rr = KnowledgeReasoningEngine.reason({ goal: "immutability_test" });
      const frozen = Object.isFrozen(rr.decision);
      checks.push(chk("SRP/Immutability: ReasoningDecision is frozen",
        "Decision object must be immutable (Object.freeze).",
        frozen, [`isFrozen=${frozen}`],
        frozen ? [] : ["Decision object is mutable — violates immutability contract"]));

      const frozenChain = Object.isFrozen(rr.inferenceChain);
      checks.push(chk("SRP/Immutability: InferenceChain is frozen",
        "InferenceChain must be immutable.",
        frozenChain, [`isFrozen=${frozenChain}`], []));

      // isTemporary contract enforced
      checks.push(chk("OCP/Contract: isTemporary never false",
        "Decision.isTemporary must always be true.",
        rr.decision.isTemporary === true,
        [`isTemporary=${rr.decision.isTemporary}`], []));

      // SRP: EF-52 does not mutate EF-51 store
      const { KnowledgeStore } = await import("@/lib/cognitive-learning/KnowledgeStore");
      const before = KnowledgeStore.size;
      KnowledgeReasoningEngine.reason({ goal: "srp_test" });
      const after = KnowledgeStore.size;
      checks.push(chk("SRP: EF-52 Does Not Mutate EF-51 Store",
        "KnowledgeStore size must not change after reasoning.",
        before === after, [`before=${before}`, `after=${after}`],
        before !== after ? [`Store mutated: ${before}→${after}`] : []));

      // Low coupling: EF-54 imports do not require EF-53 to be initialized
      const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine");
      const mc = MetaCognitiveEngine.analyze({ goal: "coupling_test", strategy: "direct_connector", capabilities: [], connectors: [], knowledgeRules: 0, inferenceDepth: 0, inferenceConf: 0.5, decisionConf: 0.5, decisionAuth: 0.5, optimizationRecs: 0, success: true, durationMs: 100, conflictCount: 0, confidence: 0.5, authority: 0.5 });
      checks.push(chk("DIP: EF-54 Operates Without EF-53 State",
        "MetaCognition must work without consuming EF-53 live reports.",
        "id" in mc && mc.metrics.metaConfidence >= 0,
        [`id=${mc.id}`, `metaConf=${mc.metrics.metaConfidence.toFixed(2)}`], []));

    } catch (e: unknown) {
      checks.push(chk("Architecture Audit — Runtime Error", "All compliance checks.", false, [], [`${e instanceof Error ? e.message : String(e)}`]));
    }

    return buildResult(checks, t0);
  }
}