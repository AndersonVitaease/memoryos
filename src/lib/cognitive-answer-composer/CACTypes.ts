/**
 * CACTypes.ts — Cognitive Answer Composer Types
 * Phase 5.6.3 · MemoryOS Core · 2026-07-13
 *
 * Presentation-only types. No engine or connector references.
 */

let _seq = 0;
export function makeCACId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_seq).toString(36)}`;
}

// ── Answer Templates ──────────────────────────────────────────────────────────

export type AnswerTemplate =
  | "PROJECT_STATUS"
  | "NEXT_SPRINT"
  | "PROJECT_HISTORY"
  | "ARCHITECTURE"
  | "CONNECTOR_STATUS"
  | "PIPELINE_STATUS"
  | "TECHNICAL_DEBT"
  | "CURRENT_RISKS"
  | "IMPLEMENTATION_PROGRESS"
  | "GENERAL_SUMMARY"
  | "GITHUB_LIVE";

// ── Composer Input ────────────────────────────────────────────────────────────

export interface ComposerInput {
  userMessage:    string;
  intent:         string;
  snapshot:       Record<string, unknown>;
  pipelineReport: Record<string, unknown>;
  evidence:       string[];
  confidence:     number;
  executionId:    string | null;
  durationMs:     number;
}

// ── Evidence Block ────────────────────────────────────────────────────────────

export interface EvidenceBlock {
  sources:       string[];
  executionId:   string | null;
  confidence:    number;
  pipelineStatus: string | null;
  connectors:    string[];
  stagesUsed:    string[];
  snapshotSections: string[];
}

// ── Composed Answer ───────────────────────────────────────────────────────────

export interface ComposedAnswer {
  id:             string;
  template:       AnswerTemplate;
  narrative:      string;
  sections:       AnswerSection[];
  evidence:       EvidenceBlock;
  confidence:     number;
  degraded:       boolean;
  degradationNote: string | null;
  composedAt:     number;
  compositionMs:  number;
}

export interface AnswerSection {
  heading:  string;
  body:     string;
  relevant: boolean;
}

// ── Composer Diagnostic ───────────────────────────────────────────────────────

export interface ComposerDiagnostic {
  id:            string;
  userMessage:   string;
  detectedIntent: string;
  selectedTemplate: AnswerTemplate;
  snapshotSectionsUsed: string[];
  evidenceCount: number;
  confidence:    number;
  compositionMs: number;
  answer:        ComposedAnswer;
  timestamp:     number;
}

// ── Validation Test ───────────────────────────────────────────────────────────

export interface CACTestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail:     string;
  error:      string | null;
}

export interface CACTestSuite {
  passed:     number;
  total:      number;
  durationMs: number;
  status:     "PASS" | "PARTIAL" | "FAIL";
  results:    CACTestResult[];
  diagnostics: ComposerDiagnostic[];
}