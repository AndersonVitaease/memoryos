/**
 * SCTypes.ts — Sprint EF-55 · System Certification Engine Types
 *
 * Tipos canônicos para toda a infraestrutura de certificação.
 * Somente observa — NUNCA modifica nenhum componente existente.
 */

let _seq = 0;
export function makeSCId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Audit Result ──────────────────────────────────────────────────────────────

export type AuditStatus = "pass" | "fail" | "warn" | "skip";

export interface AuditCheck {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: AuditStatus;
  readonly score: number;          // 0–100
  readonly durationMs: number;
  readonly evidence: readonly string[];
  readonly issues: readonly string[];
}

export interface AuditResult {
  readonly id: string;
  readonly auditor: string;
  readonly runAt: number;
  readonly durationMs: number;
  readonly checks: readonly AuditCheck[];
  readonly score: number;          // 0–100 weighted
  readonly passed: number;
  readonly failed: number;
  readonly warned: number;
  readonly status: AuditStatus;
  readonly summary: string;
}

// ── Certification Metrics ─────────────────────────────────────────────────────

export interface CertificationMetrics {
  readonly architectureScore: number;
  readonly pipelineHealth: number;
  readonly contractHealth: number;
  readonly performanceScore: number;
  readonly dependencyScore: number;
  readonly explainabilityScore: number;
  readonly observabilityScore: number;
  readonly isolationScore: number;
  readonly regressionScore: number;
  readonly stressScore: number;
  // NC-05 remediation: added deterministicScore (correct spelling); deterministmScore kept for backward compatibility
  readonly deterministmScore: number;
  readonly deterministicScore: number;
  readonly overallCertificationScore: number;
  readonly certified: boolean;
}

// ── Pipeline Trace ────────────────────────────────────────────────────────────

export interface PipelineTraceStep {
  readonly stage: string;
  readonly id: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly status: AuditStatus;
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly metrics: Readonly<Record<string, number>>;
  readonly trace: readonly string[];
}

export interface PipelineTrace {
  readonly id: string;
  readonly goal: string;
  readonly runAt: number;
  readonly totalDurationMs: number;
  readonly steps: readonly PipelineTraceStep[];
  readonly allIdsTraceable: boolean;
  readonly status: AuditStatus;
}

// ── History Entry ─────────────────────────────────────────────────────────────

export interface CertificationHistoryEntry {
  readonly id: string;
  readonly runAt: number;
  readonly overallScore: number;
  readonly certified: boolean;
  readonly reportId: string;
  readonly auditorResults: Readonly<Record<string, number>>;  // auditor → score
}

// ── Certification Report ──────────────────────────────────────────────────────

export interface CertificationReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly auditResults: readonly AuditResult[];
  readonly pipelineTrace: PipelineTrace;
  readonly metrics: CertificationMetrics;
  readonly summary: string;
  readonly certified: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}