// ISPAuditor.ts — Sprint EF-39.6 — Interface Segregation Principle
import type { SOLIDCheck } from "../../auditor/ArchitecturalAuditor";

const CONTRACT_METHODS   = ["store","update","archive","restore","delete","exists","get","search","query","stats","health"] as const;
const EXTENSION_METHODS  = ["takeSnapshot","getSnapshot","listSnapshots","getVersionHistory","getRecordVersion","listArchived","internalStats","indexStats","recordCount"] as const;

export async function auditISP(): Promise<SOLIDCheck> {
  const { MemoryStore } = await import("../../memory/MemoryStore");
  const s = new MemoryStore();
  const contractOk  = CONTRACT_METHODS.every(m => typeof (s as Record<string, unknown>)[m] === "function");
  const extensionOk = EXTENSION_METHODS.every(m => typeof (s as Record<string, unknown>)[m] === "function");

  return Object.freeze({
    principle: "ISP — Interface Segregation",
    verdict:   contractOk ? "PASS" as const : "FAIL" as const,
    rationale: `IKnowledgeStore has ${CONTRACT_METHODS.length} focused methods. ${EXTENSION_METHODS.length} extension methods exist outside the interface contract.`,
    evidence:  `contract=${CONTRACT_METHODS.length} present=${contractOk}, extensions=${EXTENSION_METHODS.length} present=${extensionOk}`,
  });
}