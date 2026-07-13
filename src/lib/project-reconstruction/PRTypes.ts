/**
 * PRTypes.ts — Project Reconstruction Engine Types
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { IRVerificationStatus } from "../identity-resolution/IRTypes";

// ── Pipeline stage ─────────────────────────────────────────────────────────────

export type PipelineStage =
  | "idle"
  | "collecting_providers"
  | "reconstructing_knowledge"
  | "fusing_knowledge"
  | "resolving_identities"
  | "building_graph"
  | "building_timeline"
  | "calculating_coverage"
  | "detecting_missing"
  | "validating_architecture"
  | "generating_snapshot"
  | "complete"
  | "error";

export interface PipelineStageDiagnostic {
  readonly stage: PipelineStage;
  readonly status: "pending" | "running" | "complete" | "skipped" | "error";
  readonly durationMs: number;
  readonly itemsProcessed: number;
  readonly errors: readonly string[];
}

// ── Coverage ───────────────────────────────────────────────────────────────────

export interface CoverageReport {
  readonly byProvider: Readonly<Record<string, number>>;
  readonly byDocumentType: Readonly<Record<string, number>>;
  readonly byTimeline: number;        // 0–1 ratio of timeline events with known sources
  readonly byArchitecture: number;    // ratio of arch items with multi-source confirmation
  readonly byImplementation: number;
  readonly byDecisions: number;
  readonly byRelationships: number;
  readonly overall: number;
}

// ── Missing knowledge ──────────────────────────────────────────────────────────

export type MissingKind =
  | "missing_adr"
  | "missing_rfc"
  | "broken_reference"
  | "missing_implementation"
  | "missing_relationship"
  | "unknown_entity";

export interface MissingKnowledgeItem {
  readonly kind: MissingKind;
  readonly description: string;
  readonly relatedEntityId: string | null;
  readonly severity: "low" | "medium" | "high";
}

export interface MissingKnowledgeReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly items: readonly MissingKnowledgeItem[];
  readonly totalMissing: number;
  readonly bySeverity: Readonly<Record<"low" | "medium" | "high", number>>;
  readonly byKind: Readonly<Record<MissingKind, number>>;
}

// ── Architecture consistency ───────────────────────────────────────────────────

export interface ArchConsistencyCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ArchitectureConsistencyReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly checks: readonly ArchConsistencyCheck[];
  readonly passed: number;
  readonly total: number;
  readonly consistent: boolean;
}

// ── Reconstructed Project ─────────────────────────────────────────────────────

export interface ReconstructedProject {
  readonly id: string;
  readonly name: string;
  readonly reconstructedAt: number;
  // Knowledge dimensions
  readonly documents: readonly string[];
  readonly rfcs: readonly string[];
  readonly adrs: readonly string[];
  readonly sprints: readonly string[];
  readonly goals: readonly string[];
  readonly connectors: readonly string[];
  readonly components: readonly string[];
  readonly decisions: readonly string[];
  readonly implementations: readonly string[];
  // Graph
  readonly totalEntities: number;
  readonly totalRelationships: number;
  readonly timelineEventCount: number;
  readonly snapshotCount: number;
  // Quality
  readonly risks: readonly string[];
  readonly dependencies: readonly string[];
  readonly confidence: number;
  readonly coverage: CoverageReport;
  readonly verificationBreakdown: Readonly<Record<IRVerificationStatus, number>>;
  // Reports
  readonly missingKnowledge: MissingKnowledgeReport;
  readonly architectureConsistency: ArchitectureConsistencyReport;
  // Providers
  readonly providersUsed: readonly string[];
}

// ── Reconstruction Report ─────────────────────────────────────────────────────

export interface ProjectReconstructionReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly pipelineStages: readonly PipelineStageDiagnostic[];
  readonly project: ReconstructedProject;
  readonly fusionReport: unknown;
  readonly identityReport: unknown;
  readonly errors: readonly string[];
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _prSeq = 0;
export function makePRId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_prSeq).toString(36)}`;
}