/**
 * QualificationTypes.ts
 * Sprint 6.4.2A — Google Workspace Qualification & Platform Validation
 *
 * Shared types for all qualification engines.
 */

export type QualStatus = 'pass' | 'fail' | 'warn' | 'skip';
export type CertDomain = 'identity' | 'runtime' | 'workflow' | 'audit' | 'metrics' | 'health' | 'security' | 'performance' | 'observability';

export interface QualResult {
  id:        string;
  name:      string;
  category:  string;
  status:    QualStatus;
  error?:    string;
  durationMs: number;
  metadata?:  Record<string, unknown>;
}

export interface QualSuite {
  name:     string;
  results:  QualResult[];
  passed:   number;
  failed:   number;
  warned:   number;
  total:    number;
  durationMs: number;
}

export interface PerfMetrics {
  label:        string;
  latencyMs:    number;
  throughput:   number;   // ops/sec
  p95LatencyMs: number;
  p99LatencyMs: number;
  errors:       number;
  total:        number;
}

export interface CertDomainScore {
  domain:   CertDomain;
  score:    number;   // 0–100
  maxScore: number;
  passed:   number;
  total:    number;
  status:   QualStatus;
  notes:    string[];
}

export interface CertificationReport {
  connectorId:   string;
  connectorName: string;
  version:       string;
  generatedAt:   string;
  overall:       number;    // 0–100
  certified:     boolean;
  domains:       CertDomainScore[];
  summary:       string;
  badge:         string;
  auditTrail:    QualResult[];
}