// ══════════════════════════════════════════════════════════════════════════════
// Architecture Validation Program — Shared Types
// ══════════════════════════════════════════════════════════════════════════════

export type AVPStatus = "PASS" | "FAIL" | "WARN" | "PENDING";

export interface AVPFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  message: string;
  detail?: string;
}

export interface AVPAuditResult {
  id: string;
  name: string;
  status: AVPStatus;
  durationMs: number;
  score: number;          // 0–100
  findings: AVPFinding[];
  metrics: Record<string, number | string | boolean>;
  error?: string;
}

export interface AVPReport {
  // Per-audit results
  avp01: AVPAuditResult;
  avp02: AVPAuditResult;
  avp03: AVPAuditResult;
  avp04: AVPAuditResult;
  avp05: AVPAuditResult;
  avp06: AVPAuditResult;
  avp07: AVPAuditResult;
  avp08: AVPAuditResult;
  avp09: AVPAuditResult;
  avp10: AVPAuditResult;

  // Aggregate
  certified: boolean;
  overallScore: number;
  architectureScore: number;
  engineeringScore: number;
  reliabilityScore: number;
  maintainabilityScore: number;
  scalabilityScore: number;
  criticalFindings: AVPFinding[];
  remainingRisks: string[];
  totalDurationMs: number;
}