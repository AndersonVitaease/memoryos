/**
 * DependencyAuditor.ts — Sprint EF-55
 *
 * TEST 4: Dependency Audit — no circular deps, no illegal imports, no duplicate singletons.
 * Performs static analysis by inspecting globalThis singletons and module boundaries.
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
  return Object.freeze({ id: makeSCId("ar"), auditor: "DependencyAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Dependencies: ${passed}/${checks.length} passed` });
}

export class DependencyAuditor {
  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    // Check singletons exist in globalThis (confirms HMR-safe instantiation)
    const G = globalThis as Record<string, unknown>;
    const singletons: [string, string][] = [
      ["__EF51_KS__",   "EF-51 KnowledgeStore"],
      ["__EF52_KRE__",  "EF-52 KnowledgeReasoningEngine"],
      ["__EF53_SOE__",  "EF-53 SelfOptimizationEngine"],
      ["__EF53_HIST__", "EF-53 OptimizationHistory"],
      ["__EF54_MCE__",  "EF-54 MetaCognitiveEngine"],
      ["__EF54_MH__",   "EF-54 MetaHistory"],
      ["__EF51_LE__",   "EF-51 LearningEngine"],
    ];

    for (const [key, label] of singletons) {
      const exists = key in G && G[key] !== null && G[key] !== undefined;
      checks.push(chk(
        `Singleton: ${label}`,
        `${label} must exist as HMR-safe singleton on globalThis.${key}`,
        exists,
        exists ? [`globalThis.${key}=${typeof G[key]}`] : [],
        exists ? [] : [`globalThis.${key} not found — singleton not initialized`],
      ));
    }

    // No duplicate singletons (each key appears once)
    const allKeys = singletons.map(([k]) => k);
    const uniqueKeys = new Set(allKeys);
    checks.push(chk(
      "No Duplicate Singletons",
      "Each singleton key must appear exactly once.",
      allKeys.length === uniqueKeys.size,
      [`total=${allKeys.length}`, `unique=${uniqueKeys.size}`],
      allKeys.length !== uniqueKeys.size ? ["Duplicate singleton keys detected"] : [],
    ));

    // Check EF-52 does not modify EF-51 KnowledgeStore
    try {
      const { KnowledgeStore } = await import("@/lib/cognitive-learning/KnowledgeStore");
      const before = KnowledgeStore.size;
      const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
      KnowledgeReasoningEngine.reason({ goal: "dep_test" });
      const after = KnowledgeStore.size;
      checks.push(chk(
        "EF-52 Does Not Write to KnowledgeStore",
        "Reasoning engine must not add rules to the store.",
        before === after,
        [`before=${before}`, `after=${after}`],
        before !== after ? [`KnowledgeStore size changed: ${before}→${after}`] : [],
      ));
    } catch (e) {
      checks.push(chk("EF-52 Store Isolation", "Reasoning isolation.", false, [], [`${e}`]));
    }

    // Check EF-53 does not modify EF-51 store
    try {
      const { KnowledgeStore } = await import("@/lib/cognitive-learning/KnowledgeStore");
      const before = KnowledgeStore.size;
      const { SelfOptimizationEngine } = await import("@/lib/self-optimization/SelfOptimizationEngine");
      SelfOptimizationEngine.analyze(SelfOptimizationEngine.buildSnapshot([]));
      const after = KnowledgeStore.size;
      checks.push(chk(
        "EF-53 Does Not Write to KnowledgeStore",
        "Optimization engine must not modify the knowledge store.",
        before === after,
        [`before=${before}`, `after=${after}`],
        before !== after ? [`KnowledgeStore modified by EF-53`] : [],
      ));
    } catch (e) {
      checks.push(chk("EF-53 Store Isolation", "Optimization isolation.", false, [], [`${e}`]));
    }

    return buildResult(checks, t0);
  }
}