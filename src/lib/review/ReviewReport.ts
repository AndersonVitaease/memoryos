// ─── ReviewReport — Contrato Universal de Revisão de Sprint ──────────────────
// Foundation v1.0 · Reutilizável por Sprint 1..N

export type ReviewStatus = "APPROVED" | "FAILED" | "CERTIFIED" | "CRITICAL_DRIFT" | "PENDING";
export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingType = "coupling" | "solid" | "hidden_dep" | "duplicate" | "todo" | "security" | "performance" | "other";
export type ComplianceStatus = "ok" | "warn" | "fail";

// ── MRI ───────────────────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface MRIResult {
  passed: number;
  total: number;
  passRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
  tests: TestResult[];
  status: ReviewStatus;
}

// ── MQCCS ─────────────────────────────────────────────────────────────────────

export type CertificationLevel = "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | "NONE";

export interface MQCCSResult {
  coverage: number;
  level: CertificationLevel;
  status: ReviewStatus;
}

// ── MERS ──────────────────────────────────────────────────────────────────────

export interface MERSResult {
  architectureScore: number;
  securityScore: number;
  performanceScore: number;
  overallScore: number;
  status: ReviewStatus;
}

// ── MADS ──────────────────────────────────────────────────────────────────────

export interface MADSResult {
  criticalDrift: number;
  highDrift: number;
  technicalDebt: number;
  status: ReviewStatus;
}

// ── Compliance ────────────────────────────────────────────────────────────────

export interface ComplianceItem {
  item: string;
  status: ComplianceStatus;
  note?: string;
}

export interface ComplianceSection {
  title: string;
  items: ComplianceItem[];
}

// ── Findings ──────────────────────────────────────────────────────────────────

export interface Finding {
  type: FindingType;
  severity: FindingSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

// ── Technical Debt ────────────────────────────────────────────────────────────

export interface TechDebtItem {
  description: string;
  targetSprint?: string;
  impact?: string;
}

export interface Placeholder {
  item: string;
  why: string;
  targetSprint: string;
  impact: string;
}

export interface AbstractionRecommendation {
  name: string;
  interface: string;
  recommended: boolean;
  targetSprint: string;
  reason: string;
}

// ── Quality ───────────────────────────────────────────────────────────────────

export interface RiskItem {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

export interface QualityDimension {
  label: string;
  value: string;
  color: "green" | "yellow" | "red" | "blue" | "zinc";
  sub: string;
}

export interface QualitySection {
  strengths: string[];
  concerns: string[];
  risks: RiskItem[];
  techDebt: string[];
  dimensions: QualityDimension[];
}

// ── Verdict ───────────────────────────────────────────────────────────────────

export interface VerdictItem {
  item: string;
  passed: boolean;
  note: string;
}

export interface Verdict {
  approved: boolean;
  blockers: string[];
  items: VerdictItem[];
  summary: string;
}

// ── ReviewReport ──────────────────────────────────────────────────────────────

export interface ReviewReport {
  reviewId: string;
  timestamp: number;
  sprint: string;
  sprintLabel: string;
  foundation: string;

  // Pipeline results
  mri: MRIResult;
  mqccs: MQCCSResult;
  mers: MERSResult;
  mads: MADSResult;

  // Analysis
  compliance: ComplianceSection[];
  findings: Finding[];
  placeholders: Placeholder[];
  abstractions: AbstractionRecommendation[];
  quality: QualitySection;

  // Final verdict
  verdict: Verdict;

  // Meta
  status: ReviewStatus;
  gates: { name: string; status: ReviewStatus }[];
}