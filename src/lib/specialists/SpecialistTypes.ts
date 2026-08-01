/**
 * SpecialistTypes.ts — Specialist Runtime
 * Tipos oficiais para o Specialist Runtime do MemoryOS.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 */

export type SpecialistDomain =
  | "financial"
  | "legal"
  | "medical"
  | "technical"
  | "government"
  | "general";

export interface ExpertiseTopic {
  readonly topic:       string;
  readonly confidence:  number;
  readonly sources:     readonly string[];
  readonly limitations: readonly string[];
  readonly language:    string;
}

export interface SpecialistManifest {
  readonly specialistId: string;
  readonly name:         string;
  readonly version:      string;
  readonly author:       string;
  readonly domain:       SpecialistDomain;
  readonly subdomain:    string;
  readonly languages:    readonly string[];
  readonly expertise:    readonly ExpertiseTopic[];
}

export interface SpecialistFact {
  readonly claim:      string;
  readonly confidence: number;
  readonly source:     string;
}

export interface SpecialistRequest {
  readonly query:        string;
  readonly context?:     string;
  readonly sessionId?:   string;
  readonly projectId?:   string;
}

export interface SpecialistResponse {
  readonly specialistId:    string;
  readonly facts:           readonly SpecialistFact[];
  readonly reasoning:       readonly string[];
  readonly recommendations: readonly string[];
  readonly confidence:      number;
  readonly sources:         readonly string[];
  readonly limitations:     readonly string[];
  readonly durationMs:      number;
}

export interface SpecialistHealthResult {
  readonly status:      "SUCCESS" | "DEGRADED" | "FAILED";
  readonly specialistId: string;
  readonly executeCount: number;
  readonly successRate:  number;
  readonly avgLatencyMs: number;
  readonly details:      string;
}

export interface SpecialistMetrics {
  readonly specialistId:  string;
  readonly executeCount:  number;
  readonly successCount:  number;
  readonly failureCount:  number;
  readonly avgLatencyMs:  number;
  readonly successRate:   number;
}

export interface SpecialistTestResult {
  readonly scenario:  string;
  readonly passed:    boolean;
  readonly durationMs: number;
  readonly error?:    string;
}

export interface SpecialistTestReport {
  readonly specialistId: string;
  readonly totalScenarios: number;
  readonly passed:        number;
  readonly failed:        number;
  readonly durationMs:    number;
  readonly results:       readonly SpecialistTestResult[];
  readonly certified:     boolean;
}