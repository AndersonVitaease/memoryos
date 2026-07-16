/**
 * ArchitectureGovernanceEngine.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Central facade that integrates Scanner + Report + Certification + Shield.
 * Consumers only need to import this file.
 *
 * Exports:
 *   runArchitectureGovernance()         — full certification pipeline
 *   runArchitectureGovernanceSuite()    — regression shield suite
 *   assertArchitectureGovernance()      — CI hard gate (throws on failure)
 *   getCachedGovernanceResult()         — dashboard polling (cached)
 *   AGE_RULES                           — rule catalog
 *   AGE_VERSION                         — engine version
 */

export { runArchitectureGovernance, getCachedGovernanceResult } from "./ArchitectureCertification";
export { runArchitectureGovernanceSuite, assertArchitectureGovernance } from "./ArchitectureRegressionShield";
export { runArchitectureScan }      from "./ArchitectureScanner";
export { buildArchitectureReport }  from "./ArchitectureReport";
export { AGE_RULES, getRuleById, getRulesByCategory, getCriticalRules } from "./ArchitectureRules";

export type { CertificationResult }     from "./ArchitectureCertification";
export type { ArchitectureReport, ComponentStatus } from "./ArchitectureReport";
export type { ScanSummary }             from "./ArchitectureScanner";
export type { AGSSuiteResult, AGSCase } from "./ArchitectureRegressionShield";
export type {
  ArchitectureViolation,
  ArchitectureWarning,
  RuleScanResult,
  ViolationSeverity,
} from "./ArchitectureViolation";
export type { ArchitectureRule, RuleCategory } from "./ArchitectureRules";

export const AGE_VERSION = "1.0.0";