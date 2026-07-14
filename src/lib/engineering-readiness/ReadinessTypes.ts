/**
 * ReadinessTypes.ts — Sprint 6.3.5
 * Engineering Readiness Certification (ERC) — Type Definitions
 */

export type CertificationLevel =
  | "NOT_READY"
  | "PARTIALLY_READY"
  | "READY_FOR_CONNECTORS"
  | "READY_FOR_AUTOMATION"
  | "ENTERPRISE_READY";

export type ValidatorStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export type ReadinessDomain =
  | "Infrastructure"
  | "Security"
  | "Recovery"
  | "Persistence"
  | "Acceptance"
  | "Regression"
  | "Performance"
  | "Governance"
  | "Architecture"
  | "ConnectorPlatform"
  | "EngineeringMemory"
  | "KnowledgeGraph";

export interface ValidatorResult {
  id: string;
  name: string;
  domain: ReadinessDomain;
  status: ValidatorStatus;
  score: number;        // 0–100
  detail: string;
  checks: CheckResult[];
  durationMs: number;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

export interface CheckResult {
  name: string;
  status: ValidatorStatus;
  detail: string;
  critical: boolean;
}

export interface DomainScore {
  domain: ReadinessDomain;
  score: number;
  status: ValidatorStatus;
  blockers: string[];
  warnings: string[];
}

export interface ReadinessScorecard {
  infrastructure:      number;
  security:            number;
  recovery:            number;
  persistence:         number;
  acceptance:          number;
  regression:          number;
  performance:         number;
  governance:          number;
  architecture:        number;
  connectorPlatform:   number;
  engineeringMemory:   number;
  knowledgeGraph:      number;
  overall:             number;
}

export interface PerformanceBaseline {
  startupMs:         number;
  warmupMs:          number;
  restoreMs:         number;
  recoveryMs:        number;
  acceptanceMs:      number;
  regressionMs:      number;
  fullLoopMs:        number;
  capturedAt:        number;
}

export interface ReadinessReportData {
  id:                string;
  generatedAt:       number;
  durationMs:        number;
  certification:     CertificationLevel;
  scorecard:         ReadinessScorecard;
  domainScores:      DomainScore[];
  validatorResults:  ValidatorResult[];
  executiveSummary:  string;
  checklist:         ChecklistItem[];
  metrics:           Record<string, number | string>;
  pendingItems:      string[];
  risks:             RiskItem[];
  blockers:          string[];
  recommendations:   string[];
  performanceBaseline: PerformanceBaseline;
}

export interface ChecklistItem {
  id:       string;
  label:    string;
  status:   "PASS" | "FAIL" | "WARN";
  domain:   ReadinessDomain;
  critical: boolean;
}

export interface RiskItem {
  id:       string;
  level:    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  area:     string;
  description: string;
  mitigation: string;
}

export interface ReadinessAuditEntry {
  id:         string;
  timestamp:  number;
  actor:      string;
  action:     string;
  domain:     ReadinessDomain | "SYSTEM";
  result:     ValidatorStatus | "INFO";
  detail:     string;
}

export interface ReadinessMetricSnapshot {
  totalRuns:       number;
  passRuns:        number;
  failRuns:        number;
  avgOverallScore: number;
  bestScore:       number;
  worstScore:      number;
  lastCertification: CertificationLevel | null;
  avgDurationMs:   number;
}