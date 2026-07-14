/**
 * CompatibilityEngine.ts — Sprint 6.2.3
 * Validates backward compatibility across all contract domains.
 */

import type { CompatibilityStatus, BreakingChange } from "./AATypes";

const CONTRACT_DOMAINS = [
  "Public APIs",
  "Connector Contracts",
  "Pipeline Contracts",
  "Singleton Contracts",
  "Workflow Contracts",
  "KnowledgeGraph Contracts",
  "Architecture Contracts",
];

export interface CompatibilityReport {
  overall:   CompatibilityStatus;
  domains:   Record<string, CompatibilityStatus>;
  issues:    string[];
  backwardCompatible: boolean;
}

export class CompatibilityEngine {
  validate(
    affectedComponents: string[],
    breakingChanges: BreakingChange[],
  ): CompatibilityReport {
    const issues: string[] = [];
    const domains: Record<string, CompatibilityStatus> = {};

    const blockedChanges = breakingChanges.filter(c => c.autoBlocked);
    const highChanges    = breakingChanges.filter(c => c.level === "HIGH" || c.level === "CRITICAL");

    // Domain-by-domain check
    for (const domain of CONTRACT_DOMAINS) {
      const domainLower = domain.toLowerCase();
      const relevant = breakingChanges.filter(c =>
        c.component.toLowerCase().includes(domainLower.split(" ")[0]) ||
        affectedComponents.some(a => a.toLowerCase().includes(domainLower.split(" ")[0]))
      );

      if (relevant.some(r => r.autoBlocked)) {
        domains[domain] = "INCOMPATIBLE";
        issues.push(`${domain}: breaking change detected — ${relevant.filter(r => r.autoBlocked).map(r => r.component).join(", ")}`);
      } else if (relevant.some(r => r.level !== "SAFE")) {
        domains[domain] = "DEGRADED";
        issues.push(`${domain}: non-breaking change detected`);
      } else {
        domains[domain] = "COMPATIBLE";
      }
    }

    const allCompatible = Object.values(domains).every(s => s === "COMPATIBLE");
    const anyIncompatible = Object.values(domains).some(s => s === "INCOMPATIBLE");
    const overall: CompatibilityStatus = anyIncompatible ? "INCOMPATIBLE"
      : allCompatible ? "COMPATIBLE" : "DEGRADED";

    return {
      overall,
      domains,
      issues,
      backwardCompatible: overall !== "INCOMPATIBLE",
    };
  }
}