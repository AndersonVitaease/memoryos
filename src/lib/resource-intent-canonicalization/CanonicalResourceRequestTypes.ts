/**
 * CanonicalResourceRequestTypes.ts — RICL Foundation (Phase 1)
 *
 * Scope of this module:
 * - Data contract only (no connector/runtime/planner behavior)
 * - Immutable, versioned shape for canonical resource requests
 * - Backward-compatible foundation for incremental migration
 */

export const CANONICAL_RESOURCE_REQUEST_VERSION = 1 as const;
export const CANONICAL_RESOURCE_REQUEST_SCHEMA = "memoryos.canonical-resource-request" as const;

export type CanonicalResourceRequestVersion = typeof CANONICAL_RESOURCE_REQUEST_VERSION;

export type CanonicalCandidateStrategy =
  | "literal"
  | "quoted_literal"
  | "descriptor_removed"
  | "extension_only"
  | "filename_only"
  | "path_based"
  | "id_based";

export type CanonicalCandidateSource = "rawText" | "goal.parameters" | "derived";

export interface CanonicalCandidateSelectorV1 {
  readonly id: string;
  readonly priority: number;
  readonly value: string;
  readonly source: CanonicalCandidateSource;
  readonly confidence: number;
  readonly strategy: CanonicalCandidateStrategy;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type CanonicalResourceAction =
  | "open"
  | "download"
  | "read"
  | "search"
  | "list"
  | "summarize"
  | "extract"
  | "move"
  | "upload"
  | "delete"
  | "rename"
  | "copy"
  | "unknown";

export interface CanonicalResourceSelectorsV1 {
  readonly literalNameCandidates: readonly string[];
  readonly idCandidates: readonly string[];
  readonly pathCandidates: readonly string[];
  readonly queryCandidates: readonly string[];
}

export interface CanonicalResourceHintsV1 {
  readonly resourceTypes: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];
  readonly locale: string | null;
}

export interface CanonicalResourceAmbiguityV1 {
  readonly isAmbiguous: boolean;
  readonly reason: string | null;
}

export interface CanonicalResourceConfidenceV1 {
  readonly overall: number;
  readonly parser: number | null;
  readonly classifier: number | null;
}

export interface CanonicalResourceMetadataV1 {
  readonly source: string;
  readonly createdAtMs: number;
  readonly traceId: string | null;
  readonly tags: Readonly<Record<string, string>>;
  readonly extras: Readonly<Record<string, unknown>>;
}

export interface CanonicalResourceRequestV1 {
  readonly schema: typeof CANONICAL_RESOURCE_REQUEST_SCHEMA;
  readonly version: CanonicalResourceRequestVersion;
  readonly rawText: string;
  readonly goalType: string;
  readonly action: CanonicalResourceAction;
  readonly selectors: CanonicalResourceSelectorsV1;
  readonly candidateSelectors: readonly CanonicalCandidateSelectorV1[];
  readonly resourceHints: CanonicalResourceHintsV1;
  readonly ambiguity: CanonicalResourceAmbiguityV1;
  readonly confidence: CanonicalResourceConfidenceV1;
  readonly metadata: CanonicalResourceMetadataV1;
}
