/**
 * ArchitectureViolation.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Defines the canonical violation and warning data structures used across
 * the entire AGE subsystem. No logic lives here — pure types.
 */

// ── Severity ──────────────────────────────────────────────────────────────────

export type ViolationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ── Violation ─────────────────────────────────────────────────────────────────

export interface ArchitectureViolation {
  /** Rule identifier, e.g. AGE-001 */
  ruleId:         string;
  /** Human-readable rule name */
  ruleName:       string;
  /** Full description of what was found */
  description:    string;
  /** Severity level */
  severity:       ViolationSeverity;
  /** Path to the file where the violation was found */
  file:           string;
  /** Approximate line number (1-based); 0 = unknown */
  line:           number;
  /** Verbatim evidence string (e.g., matching code snippet) */
  evidence:       string;
  /** Actionable recommendation for the engineer */
  recommendation: string;
}

// ── Warning ───────────────────────────────────────────────────────────────────

export interface ArchitectureWarning {
  ruleId:         string;
  ruleName:       string;
  description:    string;
  file:           string;
  evidence:       string;
  recommendation: string;
}

// ── Scan result for a single rule ─────────────────────────────────────────────

export interface RuleScanResult {
  ruleId:     string;
  ruleName:   string;
  passed:     boolean;
  violations: ArchitectureViolation[];
  warnings:   ArchitectureWarning[];
  durationMs: number;
  evidence:   string;
}