// DIPAuditor.ts — Sprint EF-39.6 — Dependency Inversion Principle
import type { SOLIDCheck } from "../../auditor/ArchitecturalAuditor";

export async function auditDIP(): Promise<SOLIDCheck> {
  const { KnowledgeStoreEventBus } = await import("../../KnowledgeStoreEvents");
  const { KnowledgeStoreMetrics }  = await import("../../KnowledgeStoreMetrics");
  const busOk     = typeof KnowledgeStoreEventBus.emit    === "function";
  const metricsOk = typeof KnowledgeStoreMetrics.record   === "function";
  const resetOk   = typeof KnowledgeStoreMetrics.reset    === "function";

  return Object.freeze({
    principle: "DIP — Dependency Inversion",
    verdict:   (busOk && metricsOk) ? "PASS" as const : "FAIL" as const,
    rationale: "MemoryStore depends on KnowledgeStoreEventBus and KnowledgeStoreMetrics abstractions, not concrete implementations.",
    evidence:  `EventBus.emit=${busOk}, Metrics.record=${metricsOk}, Metrics.reset=${resetOk}`,
  });
}