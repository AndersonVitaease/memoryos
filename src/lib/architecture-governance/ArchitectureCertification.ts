/**
 * ArchitectureCertification.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Public entry point. Runs the full AGE pipeline:
 *   Scanner → Report → Certification result
 *
 * Usage:
 *   const result = await runArchitectureGovernance();
 *   if (!result.certified) throw new Error(result.report.verdict);
 */

import { runArchitectureScan }    from "./ArchitectureScanner";
import { buildArchitectureReport, type ArchitectureReport } from "./ArchitectureReport";
import type { ArchitectureViolation, ArchitectureWarning }  from "./ArchitectureViolation";

// ── Certification result ──────────────────────────────────────────────────────

export interface CertificationResult {
  certified:  boolean;
  score:      number;
  violations: ArchitectureViolation[];
  warnings:   ArchitectureWarning[];
  report:     ArchitectureReport;
}

// ── Main public function ──────────────────────────────────────────────────────

/**
 * Runs the complete Architecture Governance pipeline.
 *
 * Returns a CertificationResult. `certified` is true only when:
 *   - score === 100
 *   - zero CRITICAL violations
 *   - all rules pass
 */
export async function runArchitectureGovernance(): Promise<CertificationResult> {
  const scan   = await runArchitectureScan();
  const report = buildArchitectureReport(scan);

  return {
    certified:  report.certified,
    score:      report.score,
    violations: report.violations,
    warnings:   report.warnings,
    report,
  };
}

// ── Singleton cache (optional — for dashboard polling without re-scanning) ────

const _CACHE_KEY = "__AGE_LAST_RESULT__";
const _g = globalThis as unknown as Record<string, unknown>;

export async function getCachedGovernanceResult(forceRefresh = false): Promise<CertificationResult> {
  if (!forceRefresh && _g[_CACHE_KEY]) {
    return _g[_CACHE_KEY] as CertificationResult;
  }
  const result = await runArchitectureGovernance();
  _g[_CACHE_KEY] = result;
  return result;
}