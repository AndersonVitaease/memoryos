/**
 * CompatibilityMatrix.ts — P9 Capability Registry
 * Matriz de compatibilidade entre todas as capabilities registradas.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

import type { CompatibilityEntry, CompatibilityLevel, CompatibilityMatrix } from "./CapabilityRegistryTypes";

const GLOBAL_KEY = "__MEMORY_OS_COMPAT_MATRIX__";

// Regras de conflito explícitas (same-kind same-domain = partial, cross-domain = full)
const CONFLICT_RULES: readonly { a: string; b: string; level: CompatibilityLevel; reason: string }[] = Object.freeze([
  // Financial specialist e financial package: full (complementares)
  { a: "com.memoryos.financial-specialist", b: "com.memoryos.financial",            level: "full",    reason: "Specialist e Knowledge Package do mesmo dominio sao complementares" },
  { a: "com.memoryos.legal-specialist",     b: "com.memoryos.legal",               level: "full",    reason: "Specialist e Knowledge Package do mesmo dominio sao complementares" },
  { a: "com.memoryos.medical-specialist",   b: "com.memoryos.financial-specialist", level: "full",    reason: "Specialists de dominios distintos sao independentes" },
  { a: "com.memoryos.tech-specialist",      b: "com.memoryos.financial-specialist", level: "full",    reason: "Specialists de dominios distintos sao independentes" },
  { a: "com.memoryos.financial-specialist", b: "com.memoryos.email-connector",      level: "full",    reason: "Specialist + Connector de infraestrutura: sem conflito" },
  { a: "com.memoryos.financial",            b: "com.memoryos.legal",                level: "partial", reason: "Knowledge Packages distintos: coexistem mas sem integracao nativa" },
]);

class CompatibilityMatrixImpl {
  private readonly custom = new Map<string, CompatibilityEntry>();
  private checkCount = 0;

  private key(a: string, b: string): string {
    return [a, b].sort().join("||");
  }

  private inferLevel(idA: string, idB: string): { level: CompatibilityLevel; reason: string } {
    // Check explicit rules
    for (const rule of CONFLICT_RULES) {
      if (
        (rule.a === idA && rule.b === idB) ||
        (rule.a === idB && rule.b === idA)
      ) {
        return { level: rule.level, reason: rule.reason };
      }
    }
    // Default: same prefix = full, different prefix = full (no known conflict)
    return { level: "full", reason: "Nenhuma regra de conflito conhecida — compativel por padrao" };
  }

  check(idA: string, idB: string): CompatibilityEntry {
    this.checkCount++;
    const k = this.key(idA, idB);

    if (this.custom.has(k)) return this.custom.get(k)!;

    const { level, reason } = this.inferLevel(idA, idB);
    const entry: CompatibilityEntry = Object.freeze({
      idA,
      idB,
      level,
      reason,
      testedAt: new Date().toISOString(),
    });
    this.custom.set(k, entry);
    return entry;
  }

  generate(ids: readonly string[]): CompatibilityMatrix {
    const entries: CompatibilityEntry[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        entries.push(this.check(ids[i], ids[j]));
      }
    }
    const full    = entries.filter((e) => e.level === "full").length;
    const partial = entries.filter((e) => e.level === "partial").length;
    const none    = entries.filter((e) => e.level === "none").length;

    return Object.freeze({
      entries: Object.freeze(entries),
      generatedAt: new Date().toISOString(),
      totalPairs: entries.length,
      fullCompatible: full,
      partialCompatible: partial,
      incompatible: none,
    });
  }

  getCheckCount(): number { return this.checkCount; }
}

function getMatrix(): CompatibilityMatrixImpl {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new CompatibilityMatrixImpl();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const CompatibilityMatrixEngine = getMatrix();