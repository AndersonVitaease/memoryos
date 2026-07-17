// ══════════════════════════════════════════════════════════════════════════════
// Architecture Certification Layer — Shared Types
// Sprint P-01.1
// ══════════════════════════════════════════════════════════════════════════════

export type ACLStatus = "PASS" | "FAIL" | "WARN" | "PENDING";

export interface ACLFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  message: string;
  detail?: string;
}

export interface ACLAuditResult {
  id: string;
  name: string;
  status: ACLStatus;
  durationMs: number;
  score: number;          // 0–100
  findings: ACLFinding[];
  metrics: Record<string, number | string | boolean>;
  error?: string;
}

export interface ACLReport {
  acl01: ACLAuditResult;
  acl02: ACLAuditResult;
  acl03: ACLAuditResult;
  acl04: ACLAuditResult;
  acl05: ACLAuditResult;
  acl06: ACLAuditResult;
  acl07: ACLAuditResult;
  acl08: ACLAuditResult;
  acl09: ACLAuditResult;
  acl10: ACLAuditResult;

  certified: boolean;
  overallScore: number;
  dependencyCycles: number;
  layerBypasses: number;
  pipelineBypasses: number;
  deadCodeCount: number;
  driftComponents: number;
  architectureScore: number;
  totalDurationMs: number;
  criticalFindings: ACLFinding[];
}