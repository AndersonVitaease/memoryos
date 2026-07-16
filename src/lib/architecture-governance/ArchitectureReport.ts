/**
 * ArchitectureReport.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Builds a structured report from a scan summary.
 * The report is the artifact consumed by the dashboard and CI gate.
 */

import type { ScanSummary } from "./ArchitectureScanner";
import type { ArchitectureViolation, ArchitectureWarning, RuleScanResult } from "./ArchitectureViolation";

// ── Report structure ──────────────────────────────────────────────────────────

export interface ComponentStatus {
  name:       string;
  official:   boolean;
  singleton?: boolean;
  evidence:   string;
}

export interface ArchitectureReport {
  /** 0–100 governance score */
  score:            number;
  /** True only when score === 100 and zero CRITICAL violations */
  certified:        boolean;
  violations:       ArchitectureViolation[];
  warnings:         ArchitectureWarning[];
  ruleResults:      RuleScanResult[];
  components:       ComponentStatus[];
  totalRules:       number;
  passedRules:      number;
  failedRules:      number;
  totalDurationMs:  number;
  generatedAt:      string;
  verdict:          string;
}

// ── Component map — rules that certify each component ────────────────────────

const COMPONENT_RULE_MAP: Array<{ name: string; ruleIds: string[]; singletonRule?: string }> = [
  { name: "Official Bootstrap",   ruleIds: ["AGE-001"], },
  { name: "Official Registry",    ruleIds: ["AGE-002"], },
  { name: "Official IConnector",  ruleIds: ["AGE-003", "AGE-010"], },
  { name: "Official Router",      ruleIds: ["AGE-004"], },
  { name: "Official Executor",    ruleIds: ["AGE-005"], },
  { name: "Official Runtime",     ruleIds: ["AGE-006"], singletonRule: "AGE-006" },
  { name: "Official Pipeline",    ruleIds: ["AGE-007", "AGE-008", "AGE-009"], },
];

// ── Score algorithm ───────────────────────────────────────────────────────────
// 100 points base. Each CRITICAL violation = -20, HIGH = -10, MEDIUM = -5, LOW = -2.
// Score floored at 0.

function computeScore(violations: ArchitectureViolation[]): number {
  const deduction = violations.reduce((acc, v) => {
    switch (v.severity) {
      case "CRITICAL": return acc + 20;
      case "HIGH":     return acc + 10;
      case "MEDIUM":   return acc + 5;
      case "LOW":      return acc + 2;
      default:         return acc;
    }
  }, 0);
  return Math.max(0, 100 - deduction);
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildArchitectureReport(scan: ScanSummary): ArchitectureReport {
  const score     = computeScore(scan.violations);
  const certified = score === 100 && scan.violations.filter(v => v.severity === "CRITICAL").length === 0;

  // Build component statuses
  const components: ComponentStatus[] = COMPONENT_RULE_MAP.map(({ name, ruleIds, singletonRule }) => {
    const relatedResults = scan.results.filter(r => ruleIds.includes(r.ruleId));
    const official       = relatedResults.every(r => r.passed);
    const singleton      = singletonRule
      ? scan.results.find(r => r.ruleId === singletonRule)?.passed
      : undefined;
    const evidence       = relatedResults.map(r => r.evidence).join(" | ") || "No scan data";
    return { name, official, singleton, evidence };
  });

  const verdict = certified
    ? `ARCHITECTURE CERTIFIED — Score: ${score}/100 — Zero violations — ${scan.totalRules}/${scan.totalRules} rules passed`
    : `ARCHITECTURE NOT CERTIFIED — Score: ${score}/100 — ${scan.violations.length} violation(s) — ${scan.failed} rule(s) failed`;

  return {
    score,
    certified,
    violations:      scan.violations,
    warnings:        scan.warnings,
    ruleResults:     scan.results,
    components,
    totalRules:      scan.totalRules,
    passedRules:     scan.passed,
    failedRules:     scan.failed,
    totalDurationMs: scan.totalMs,
    generatedAt:     new Date().toISOString(),
    verdict,
  };
}