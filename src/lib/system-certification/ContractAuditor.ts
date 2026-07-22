/**
 * ContractAuditor.ts — Sprint EF-55
 *
 * TEST 3: Contract Validation — validate all engine interfaces.
 * Each engine must validate: input types, output types, required fields.
 */

import type { AuditResult, AuditCheck, AuditStatus } from "./SCTypes";
import { makeSCId } from "./SCTypes";

function buildResult(checks: AuditCheck[], t0: number, auditor: string): AuditResult {
  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warned = checks.filter(c => c.status === "warn").length;
  const score  = checks.length > 0 ? checks.reduce((s, c) => s + c.score, 0) / checks.length : 0;
  const status: AuditStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";
  return Object.freeze({ id: makeSCId("ar"), auditor, runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `${auditor}: ${passed}/${checks.length} passed, score=${score.toFixed(0)}` });
}

function chk(name: string, desc: string, ok: boolean, evidence: string[], issues: string[]): AuditCheck {
  return Object.freeze({ id: makeSCId("chk"), name, description: desc, status: ok ? "pass" : "fail" as AuditStatus, score: ok ? 100 : 0, durationMs: 1, evidence: Object.freeze(evidence), issues: Object.freeze(issues) });
}

export class ContractAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    try {
      // EF-51 LearningEngine contract
      const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
      const lr = LearningEngine.learn([]);
      checks.push(chk("EF-51 LearningEngine Output Contract",
        "Output must have: id, episodesAnalyzed, knowledgeCreated, metrics, knowledgeGraph.",
        "id" in lr && "episodesAnalyzed" in lr && "knowledgeCreated" in lr && "metrics" in lr && "knowledgeGraph" in lr,
        [`id=${lr.id}`, `episodesAnalyzed=${lr.episodesAnalyzed}`], []));

      // EF-51 KnowledgeStore contract
      const { KnowledgeStore } = await import("@/lib/cognitive-learning/KnowledgeStore");
      const rules = KnowledgeStore.getAll();
      checks.push(chk("EF-51 KnowledgeStore Output Contract",
        "getAll() must return readonly array of KnowledgeRule.",
        Array.isArray(rules),
        [`ruleCount=${rules.length}`], []));

      // EF-52 KnowledgeReasoningEngine contract
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      const rr = KnowledgeReasoningEngine.reason({ goal: "contract_test" });
      checks.push(chk("EF-52 KnowledgeReasoningEngine Output Contract",
        "Output must have: id, goal, decision, inferenceChain, metrics, reasoningGraph.",
        "id" in rr && "goal" in rr && "decision" in rr && "inferenceChain" in rr && "metrics" in rr && "reasoningGraph" in rr,
        [`id=${rr.id}`, `goal=${rr.goal}`, `chain_depth=${rr.inferenceChain.depth}`], []));

      checks.push(chk("EF-52 Decision isTemporary Contract",
        "decision.isTemporary must always be true.",
        rr.decision.isTemporary === true,
        [`isTemporary=${rr.decision.isTemporary}`], []));

      checks.push(chk("EF-52 InferenceChain isTemporary Contract",
        "inferenceChain.isTemporary must always be true.",
        rr.inferenceChain.isTemporary === true,
        [`isTemporary=${rr.inferenceChain.isTemporary}`], []));

      // EF-53 SelfOptimizationEngine contract
      const { SelfOptimizationEngine } = await import("@/lib/self-optimization/SelfOptimizationEngine");
      const snap = SelfOptimizationEngine.buildSnapshot([]);
      const opt  = SelfOptimizationEngine.analyze(snap);
      checks.push(chk("EF-53 SelfOptimizationEngine Output Contract",
        "Output must have: id, findings, recommendations, metrics.",
        "id" in opt && "findings" in opt && "recommendations" in opt && "metrics" in opt,
        [`id=${opt.id}`, `recs=${opt.recommendations.length}`], []));

      checks.push(chk("EF-53 Recommendations isAutomatic=false Contract",
        "Every recommendation must have isAutomatic=false.",
        opt.recommendations.every(r => r.isAutomatic === false),
        [`count=${opt.recommendations.length}`], []));

      // EF-54 MetaCognitiveEngine contract
      const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine");
      const mc = MetaCognitiveEngine.analyze({ goal: "contract_test", strategy: "direct_connector", capabilities: [], connectors: [], knowledgeRules: 0, inferenceDepth: 0, inferenceConf: 0.5, decisionConf: 0.5, decisionAuth: 0.5, optimizationRecs: 0, success: true, durationMs: 100, conflictCount: 0, confidence: 0.5, authority: 0.5 });
      checks.push(chk("EF-54 MetaCognitiveEngine Output Contract",
        "Output must have: id, cognitiveFlow, biases, alternatives, reflection, metrics.",
        "id" in mc && "cognitiveFlow" in mc && "biases" in mc && "alternatives" in mc && "reflection" in mc && "metrics" in mc,
        [`id=${mc.id}`, `biases=${mc.biases.length}`], []));

    } catch (e: unknown) {
      checks.push(chk("Contract Audit — Runtime Error", "All contracts.", false, [], [`${e instanceof Error ? e.message : String(e)}`]));
    }

    return buildResult(checks, t0, "ContractAuditor");
  }
}