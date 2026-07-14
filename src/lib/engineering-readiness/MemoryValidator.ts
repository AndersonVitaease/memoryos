/**
 * MemoryValidator.ts — Sprint 6.3.5
 * Validates Engineering Memory layer completeness.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { EngineeringMemory } from "../engineering-memory/EngineeringMemory";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class MemoryValidator {
  validate(): ValidatorResult {
    const t0 = Date.now();
    const checks: CheckResult[] = [];
    const em = new EngineeringMemory();

    // API surface
    checks.push(check("recordImplementation callable", typeof em.recordImplementation === "function", "API OK", true));
    checks.push(check("searchBeforeImplementing callable", typeof em.searchBeforeImplementing === "function", "API OK", true));
    checks.push(check("runLearningLoop callable", typeof em.runLearningLoop === "function", "API OK", true));
    checks.push(check("experienceSnapshot callable", typeof em.experienceSnapshot === "function", "API OK", false));
    checks.push(check("allEntries callable", typeof em.allEntries === "function", "API OK", false));

    // Record and retrieve
    em.recordImplementation({
      objective: "memory validator probe",
      planId: "mv_p1",
      components: ["MVComp"],
      strategy: "CREATE",
      filesChanged: [],
      durationMs: 50,
      regressionsPassed: true,
      approved: true,
      rollbackExecuted: false,
      outcome: "PASS",
    });
    const hasImpl = em.implementations.all().length > 0;
    checks.push(check("Implementation recorded and retrieved", hasImpl, hasImpl ? `${em.implementations.all().length} impl(s)` : "Empty"));

    // Search
    const results = em.searchBeforeImplementing("memory validator probe");
    checks.push(check("Search returns results", results.length > 0, results.length > 0 ? `${results.length} result(s)` : "Search returned nothing", false));

    // Learning loop
    const loop = em.runLearningLoop("PASS", ["MVComp"]);
    checks.push(check("Learning loop executes", loop.durationMs >= 0, `lessons=${loop.lessonsExtracted.length}`, false));

    // Snapshot
    const snap = em.experienceSnapshot();
    checks.push(check("Experience snapshot valid", snap.totalImplementations > 0, `total=${snap.totalImplementations} success=${snap.successRate}%`, false));

    // Audit append-only
    const before = em.audit.all().length;
    em.recordBug({ description: "mv probe bug", rootCause: "test", module: "MVMod", impact: "LOW", fix: "ok", relatedRegression: "", confidence: 0.9, version: "6.3.5" });
    const after = em.audit.all().length;
    checks.push(check("Audit is append-only", after > before, `before=${before} after=${after}`, false));

    // Ranking
    const all = em.allEntries();
    const rankOk = all.every(e => typeof e.rank === "number" && e.rank >= 0 && e.rank <= 100);
    checks.push(check("All entries have valid rank", rankOk, rankOk ? `${all.length} entries ranked` : "Invalid rank found", false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "mem_validator",
      name: "Memory Validator",
      domain: "EngineeringMemory",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} memory checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[MEM] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Restore EngineeringMemory API — MEM is critical for learning loop."] : [],
    };
  }
}