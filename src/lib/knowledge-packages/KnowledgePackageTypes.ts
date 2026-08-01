/**
 * KnowledgePackageTypes.ts — Knowledge Package Runtime
 * Tipos oficiais para o Knowledge Package Runtime do MemoryOS.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 */

export type KnowledgeNodeType = "concept" | "fact" | "rule" | "example" | "definition";
export type KnowledgeEdgeRelation = "related_to" | "depends_on" | "extends" | "contradicts" | "supports";
export type SourceType = "law" | "regulation" | "jurisprudence" | "standard" | "other";

export interface KnowledgeNode {
  readonly id:        string;
  readonly type:      KnowledgeNodeType;
  readonly label:     string;
  readonly content:   string;
  readonly confidence: number;
  readonly sourceIds: readonly string[];
  readonly tags:      readonly string[];
}

export interface KnowledgeEdge {
  readonly id:       string;
  readonly fromId:   string;
  readonly toId:     string;
  readonly relation: KnowledgeEdgeRelation;
  readonly weight:   number;
}

export interface KnowledgeSource {
  readonly name:  string;
  readonly url?:  string;
  readonly date:  string;
  readonly type:  SourceType;
}

export interface KnowledgePackageManifest {
  readonly packageId:   string;
  readonly name:        string;
  readonly version:     string;
  readonly author:      string;
  readonly license:     string;
  readonly domain:      string;
  readonly language:    string;
  readonly sources:     readonly KnowledgeSource[];
  readonly validUntil?: string;
}

export interface KnowledgePackageContent {
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
}

export interface KnowledgeQueryResult {
  readonly nodes:     readonly KnowledgeNode[];
  readonly totalHits: number;
  readonly queryMs:   number;
}

export interface KnowledgePackageHealthResult {
  readonly status:     "SUCCESS" | "DEGRADED" | "FAILED";
  readonly packageId:  string;
  readonly nodeCount:  number;
  readonly edgeCount:  number;
  readonly details:    string;
}

export interface KnowledgePackageMetrics {
  readonly packageId:   string;
  readonly nodeCount:   number;
  readonly edgeCount:   number;
  readonly queryCount:  number;
  readonly avgQueryMs:  number;
}

export interface KnowledgePackageTestResult {
  readonly scenario:   string;
  readonly passed:     boolean;
  readonly durationMs: number;
  readonly error?:     string;
}

export interface KnowledgePackageTestReport {
  readonly packageId:      string;
  readonly totalScenarios: number;
  readonly passed:         number;
  readonly failed:         number;
  readonly durationMs:     number;
  readonly results:        readonly KnowledgePackageTestResult[];
  readonly certified:      boolean;
}