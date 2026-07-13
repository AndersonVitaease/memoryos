/**
 * CCGTypes.ts — Conversation Cognitive Gateway Types
 * Phase 5.5 · MemoryOS Core · 2026-07-13
 */

let _seq = 0;
export function makeCCGId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_seq).toString(36)}`;
}

// ── Cognitive Intent ──────────────────────────────────────────────────────────

export type CognitiveIntent =
  | "project_status"
  | "repository_analysis"
  | "application_analysis"
  | "knowledge_reconstruction"
  | "architecture_question"
  | "next_sprint"
  | "implementation_status"
  | "connector_diagnostics"
  | "project_history"
  | "technical_debt"
  | "general_conversation";

export interface IntentClassification {
  intent:           CognitiveIntent;
  confidence:       number;
  requiresCognitive: boolean;
  matchedKeywords:  string[];
  reasoning:        string;
}

// ── Gateway Request ───────────────────────────────────────────────────────────

export interface GatewayRequest {
  id:             string;
  userMessage:    string;
  sessionId:      string;
  projectId:      string | null;
  historyLength:  number;
  timestamp:      number;
}

// ── Cognitive Answer ──────────────────────────────────────────────────────────

export type AnswerSource = "live_pipeline" | "conversation_memory" | "degraded_pipeline" | "fallback";

export interface CognitiveAnswer {
  id:                  string;
  requestId:           string;
  executionId:         string | null;
  answer:              string;
  source:              AnswerSource;
  intent:              CognitiveIntent;
  connectorsUsed:      string[];
  stagesExecuted:      string[];
  evidenceSources:     string[];
  confidence:          number;
  durationMs:          number;
  timestamp:           number;
  degraded:            boolean;
  degradationReason:   string | null;
  recoveryInfo:        string | null;
  pipelineStatus:      string | null;
}

// ── Gateway Report ────────────────────────────────────────────────────────────

export interface GatewayDiagnostic {
  requestId:       string;
  userMessage:     string;
  intent:          IntentClassification;
  pipelineInvoked: boolean;
  answer:          CognitiveAnswer;
  timestamp:       number;
}

export interface CCGReport {
  id:                   string;
  generatedAt:          number;
  totalRequests:        number;
  cognitiveRequests:    number;
  fallbackRequests:     number;
  avgConfidence:        number;
  avgDurationMs:        number;
  recentDiagnostics:    GatewayDiagnostic[];
}