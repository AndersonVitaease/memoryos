/**
 * CCETypes.ts — Cognitive Certification Engine Types
 * Phase 5.2 · MemoryOS · 2026-07-13
 *
 * Domain models for the end-to-end cognitive certification.
 * No new architecture — reuses all existing engines.
 */

let _n = 0;
export function makeCCEId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_n).toString(36)}`;
}

// ── Scenario Result ───────────────────────────────────────────────────────────

export type ScenarioStatus = "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED" | "SKIPPED";

export interface EvidenceItem {
  readonly source: string;
  readonly connectorUsed: string | null;
  readonly knowledgeSource: string | null;
  readonly confidence: number;
  readonly timestamp: number;
  readonly executionId: string;
  readonly detail: string;
}

export interface ScenarioResult {
  readonly id: string;
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly executedAt: number;
  readonly durationMs: number;
  readonly status: ScenarioStatus;
  readonly answer: string;
  readonly evidence: EvidenceItem[];
  readonly enginesUsed: string[];
  readonly connectorsUsed: string[];
  readonly warnings: string[];
  readonly recoveryPlan: RecoveryPlan | null;
}

// ── Recovery Plan ─────────────────────────────────────────────────────────────

export interface RecoveryPlan {
  readonly id: string;
  readonly trigger: string;
  readonly strategy: string;
  readonly steps: string[];
  readonly estimatedImpact: "low" | "medium" | "high" | "critical";
  readonly gracefulDegradation: boolean;
}

// ── Operational Metrics ───────────────────────────────────────────────────────

export interface OperationalMetrics {
  readonly executionTimeMs: number;
  readonly connectorLatencyMs: Record<string, number>;
  readonly knowledgeCoverage: number;       // 0–1
  readonly projectCoverage: number;         // 0–1
  readonly confidence: number;              // 0–1
  readonly recoveryCapability: number;      // 0–1
  readonly learningUpdates: number;
  readonly architectureConsistency: number; // 0–1
}

// ── Layer Readiness ───────────────────────────────────────────────────────────

export type ReadinessLevel = "READY" | "PARTIAL" | "NOT_CONFIGURED" | "DEGRADED" | "FAILED";

export interface LayerReadiness {
  readonly layer: string;
  readonly level: ReadinessLevel;
  readonly score: number;        // 0–100
  readonly checks: Array<{ name: string; passed: boolean; detail: string }>;
  readonly summary: string;
}

// ── Certification Report ──────────────────────────────────────────────────────

export type CertificationLevel = "CERTIFIED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";

export interface CoreCertificationReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly certificationLevel: CertificationLevel;
  readonly certified: boolean;
  readonly overallScore: number;             // 0–100

  // Scenarios
  readonly scenarios: ScenarioResult[];
  readonly scenariosPassed: number;
  readonly scenariosTotal: number;

  // Layer readiness
  readonly architecturalReadiness: LayerReadiness;
  readonly operationalReadiness: LayerReadiness;
  readonly connectorReadiness: LayerReadiness;
  readonly knowledgeReadiness: LayerReadiness;
  readonly learningReadiness: LayerReadiness;
  readonly goalIntelligenceReadiness: LayerReadiness;

  // Metrics
  readonly metrics: OperationalMetrics;

  // Report
  readonly executiveSummary: string;
  readonly recommendations: string[];
  readonly technicalDebt: string[];
  readonly remainingRisks: string[];
  readonly summary: string;
}