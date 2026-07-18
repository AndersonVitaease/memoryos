/**
 * CertificationRuntime — EF-40.3
 * Orchestrates phase execution. No React. No state.
 * Each phase runner returns a PhaseResult.
 */

import { STATUS } from "./CertificationConstants.js";

export async function runPhaseTests(addTrail) {
  addTrail({ event: "TESTS start", ts: Date.now(), elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runMemoryStoreTests } = await import("@/lib/knowledge-store/memory/MemoryStoreTests");
    const r  = await runMemoryStoreTests();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "TESTS end", ts: Date.now(), elapsed: ms, status: r.certified ? "PASS" : "FAIL", detail: `${r.passed}/${r.total} passed` });
    return { status: r.certified ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.certified ? null : `${r.failed} test(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "TESTS error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

export async function runPhaseArchitecture(addTrail) {
  addTrail({ event: "ARCHITECTURE start", ts: Date.now(), elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runFullAudit } = await import("@/lib/knowledge-store/auditor/ArchitecturalAuditor");
    const r  = await runFullAudit();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "ARCHITECTURE end", ts: Date.now(), elapsed: ms, status: r.allPassed ? "PASS" : "FAIL", detail: `integrity:${r.integrity.passed}/${r.integrity.passed+r.integrity.failed}` });
    return { status: r.allPassed ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.allPassed ? null : "One or more architectural checks failed", durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "ARCHITECTURE error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

export async function runPhaseStructural(addTrail) {
  addTrail({ event: "STRUCTURAL start", ts: Date.now(), elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runStructuralAudit } = await import("@/lib/knowledge-store/auditor/SourceAuditStructural");
    const r  = await runStructuralAudit();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "STRUCTURAL end", ts: Date.now(), elapsed: ms, status: r.ok ? "PASS" : "FAIL", detail: `${r.passed}/${r.passed+r.failed}` });
    return { status: r.ok ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.ok ? null : `${r.failed} check(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "STRUCTURAL error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

export function runPhaseSource(addTrail) {
  addTrail({ event: "SOURCE", ts: Date.now(), elapsed: 0, status: "NOT_EXECUTED", detail: "Vite ?raw collision — documented limitation" });
  return { status: STATUS.NOT_EXECUTED, data: null, reason: "Static top-level ?raw imports collide with ArchitecturalAuditor normal chunks. ES module link error — uncatchable. Runs correctly at /ef393-certification.", durationMs: 0 };
}

export function runPhaseAST(addTrail) {
  addTrail({ event: "AST", ts: Date.now(), elapsed: 0, status: "NOT_EXECUTED", detail: "Same root cause as SOURCE" });
  return { status: STATUS.NOT_EXECUTED, data: null, reason: "Same root cause as SOURCE AUDIT. Runs correctly at /ef393-certification.", durationMs: 0 };
}

/** Derive SOLID, IMMUTABILITY, PERFORMANCE phases from arch result */
export function deriveArchSubPhases(archPhase) {
  const archData = archPhase.data;
  if (!archData) {
    const fail = (reason) => ({ status: STATUS.FAIL, data: null, reason, durationMs: 0 });
    return {
      solidPhase:       fail("ArchitecturalAuditor failed"),
      immutabilityPhase:fail("ArchitecturalAuditor failed"),
      perfPhase:        fail("ArchitecturalAuditor failed"),
    };
  }
  return {
    solidPhase: {
      status: archData.solid.ok ? STATUS.PASS : STATUS.FAIL,
      data: archData.solid, reason: null,
      durationMs: Math.round(archData.solid.durationMs),
    },
    immutabilityPhase: {
      status: archData.immutability.ok ? STATUS.PASS : STATUS.FAIL,
      data: archData.immutability, reason: null,
      durationMs: Math.round(archData.immutability.durationMs),
    },
    perfPhase: {
      status: archData.performance.benchmarks.length === 8 ? STATUS.PASS : STATUS.FAIL,
      data: archData.performance, reason: null,
      durationMs: Math.round(archData.performance.durationMs),
    },
  };
}

/** Reset singletons before a run */
export async function resetSingletons(addTrail, wallStart) {
  try {
    addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: 0, status: "running" });
    const { KnowledgeStoreMetrics }  = await import("@/lib/knowledge-store/KnowledgeStoreMetrics");
    KnowledgeStoreMetrics.reset();
    const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
    KnowledgeStoreEventBus.clear();
    addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: Math.round(performance.now() - wallStart), status: "PASS", detail: "KnowledgeStoreMetrics + KnowledgeStoreEventBus cleared" });
    return true;
  } catch (e) {
    addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: 0, status: "FAIL", detail: e?.message });
    return false;
  }
}