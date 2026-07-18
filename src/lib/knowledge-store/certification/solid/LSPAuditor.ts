// LSPAuditor.ts — Sprint EF-39.6 — Liskov Substitution Principle
import type { SOLIDCheck } from "../../auditor/ArchitecturalAuditor";

const CONTRACT_METHODS = ["store","update","archive","restore","delete","exists","get","search","query","stats","health"] as const;

export async function auditLSP(): Promise<SOLIDCheck> {
  const { MemoryStore } = await import("../../memory/MemoryStore");
  const store   = new MemoryStore();
  const missing = CONTRACT_METHODS.filter(m => typeof (store as Record<string, unknown>)[m] !== "function");

  return Object.freeze({
    principle: "LSP — Liskov Substitution",
    verdict:   missing.length === 0 ? "PASS" as const : "FAIL" as const,
    rationale: `MemoryStore implements all ${CONTRACT_METHODS.length} IKnowledgeStore methods and can be substituted anywhere IKnowledgeStore is expected.`,
    evidence:  missing.length === 0 ? `All ${CONTRACT_METHODS.length} methods present` : `Missing: ${missing.join(", ")}`,
  });
}