/**
 * KnowledgeRegistryTypes.ts — Contratos do Knowledge Registry v1.0
 *
 * Tipos imutaveis. Sem dependencias de runtime.
 * Todos os campos sao readonly para garantir imutabilidade em compilacao.
 */

// ── Natureza Epistemica ───────────────────────────────────────────────────────

export type ObservationNature = "Evidence" | "Inference" | "Hypothesis";

// ── Scopes registrados ────────────────────────────────────────────────────────

export type ContextScope =
  | "session"
  | "project"
  | "global"
  | "github"
  | "drive"
  | "gmail"
  | "calendar"
  | "memory";

export const REGISTERED_SCOPES: ReadonlySet<ContextScope> = new Set([
  "session", "project", "global", "github", "drive", "gmail", "calendar", "memory",
]);

// ── Payload types registrados ─────────────────────────────────────────────────

export type PayloadType =
  | "conversation_turn"
  | "entity_mention"
  | "topic_signal"
  | "decision_signal"
  | "task_signal"
  | "connector_result"
  | "goal_execution"
  | "conflict_alert"
  | "resolution";

export const REGISTERED_PAYLOAD_TYPES: ReadonlySet<PayloadType> = new Set([
  "conversation_turn",
  "entity_mention",
  "topic_signal",
  "decision_signal",
  "task_signal",
  "connector_result",
  "goal_execution",
  "conflict_alert",
  "resolution",
]);

// ── Observation Input (o que o produtor fornece) ──────────────────────────────

export interface ObservationInput {
  readonly targetObjectId:   string;
  readonly targetObjectType: string;
  readonly nature:           ObservationNature;
  readonly payloadType:      PayloadType;
  readonly data:             Record<string, unknown>;
  readonly dependencyIds?:   readonly string[];
  readonly contextScope:     ContextScope;
  readonly sessionId?:       string;
  readonly projectId?:       string;
  readonly confidence:       number;
  readonly producerId:       string;
  readonly executionId?:     string;
}

// ── Observation Record (o que o Registry persiste e devolve) ─────────────────

export interface ObservationRecord extends ObservationInput {
  readonly id:          string;
  readonly isRefuted:   boolean;
  readonly refutedById: string | null;
  readonly createdAt:   number;
}

// ── Resultado do commit ───────────────────────────────────────────────────────

export type CommitErrorType =
  | "unknown_scope"
  | "unknown_payload_type"
  | "circular_dependency"
  | "invalid_confidence"
  | "missing_required_field"
  | "persist_failed";

export interface CommitResult {
  readonly ok:          boolean;
  readonly observationId: string | null;
  readonly errorType:   CommitErrorType | null;
  readonly errorMessage: string | null;
  readonly durationMs:  number;
}

// ── Metricas do Registry ──────────────────────────────────────────────────────

export interface RegistryMetrics {
  readonly totalCommitted:  number;
  readonly totalRefuted:    number;
  readonly totalFailed:     number;
  readonly byNature:        Record<ObservationNature, number>;
  readonly byScope:         Record<string, number>;
  readonly lastCommitAt:    number | null;
}