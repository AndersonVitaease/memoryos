/**
 * WatchTypes.ts — Tipos imutáveis do Watch Engine
 *
 * Sprint WE-01 | RFC-005 | ADR-012 | EPIC-017 FEAT-110
 *
 * Regras:
 * - Todos os tipos são readonly (imutáveis)
 * - Nenhum tipo depende de implementação específica
 * - ConditionTree suporta lógica booleana recursiva (AND/OR/NOT)
 * - CompiledWatch não usa eval() — apenas funções JS puras
 */

// ── Enums de domínio ──────────────────────────────────────────────────────────

export type WatchStatus = "active" | "paused" | "error" | "invalid" | "completed";
export type WatchPriority = "critical" | "high" | "normal" | "low";
export type WatchTriggerType = "notify_user" | "run_pipeline" | "emit_event";
export type WatchExecutionStatus = "success" | "failure" | "skipped" | "circuit_open";
export type PendingActionStatus = "pending" | "dispatched" | "failed" | "expired";

export type Comparator =
  | "eq" | "neq"
  | "gt" | "gte" | "lt" | "lte"
  | "contains" | "not_contains"
  | "matches" | "exists" | "not_exists";

// ── ConditionTree — lógica booleana recursiva ─────────────────────────────────

export interface LeafCondition {
  readonly kind: "leaf";
  readonly provider: string;        // ex: "gmail", "drive", "calendar", "web"
  readonly action: string;          // ex: "count_unread", "get_price", "list_files"
  readonly params: Readonly<Record<string, unknown>>;
  readonly result_path: string;     // caminho no resultado do provider (ex: "count", "price")
  readonly comparator: Comparator;
  readonly value: unknown;          // valor de referência para comparação
}

export interface AndCondition {
  readonly kind: "AND";
  readonly conditions: readonly ConditionTree[];
}

export interface OrCondition {
  readonly kind: "OR";
  readonly conditions: readonly ConditionTree[];
}

export interface NotCondition {
  readonly kind: "NOT";
  readonly condition: ConditionTree;
}

export type ConditionTree =
  | LeafCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// ── Passo de execução linearizado (resultado do Compilador) ───────────────────

export interface ExecutionStep {
  readonly stepId: string;
  readonly provider: string;
  readonly action: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly resultKey: string;       // chave no mapa de resultados para este passo
}

// ── Watch compilado (saída do WatchEvaluator.compile) ─────────────────────────

export interface CompiledWatch {
  readonly watchId: string;
  readonly pipeline: readonly ExecutionStep[];
  // Função pura — NUNCA usa eval(). Compilada em createWatch().
  readonly evaluate: (results: Readonly<Record<string, unknown>>) => boolean;
  readonly compiledAt: number;
}

// ── Intent de criação (input do Planner ou usuário) ───────────────────────────

export interface WatchIntent {
  readonly name: string;
  readonly description?: string;
  readonly condition: ConditionTree;
  readonly frequency_minutes: number;
  readonly priority: WatchPriority;
  readonly on_trigger: WatchTriggerAction;
  readonly session_id?: string;
  readonly project_id?: string;
}

export interface WatchTriggerAction {
  readonly type: WatchTriggerType;
  readonly payload?: Record<string, unknown>;
}

// ── Resultado de operações do Registry ───────────────────────────────────────

export interface WatchCreateResult {
  readonly ok: boolean;
  readonly watchId?: string;
  readonly error?: string;
  readonly validationErrors?: readonly string[];
}

export interface WatchListResult {
  readonly watches: readonly WatchRecord[];
  readonly total: number;
}

// ── Registro persistido (mapeamento da entidade Watch do banco) ───────────────

export interface WatchRecord {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly condition_tree: string;        // JSON serializado
  readonly frequency_minutes: number;
  readonly priority: WatchPriority;
  readonly status: WatchStatus;
  readonly on_trigger_type: WatchTriggerType;
  readonly on_trigger_payload?: string;   // JSON serializado
  readonly last_evaluation_result?: boolean;
  readonly last_execution_at?: string;
  readonly next_execution_at?: string;
  readonly consecutive_failures: number;
  readonly error_message?: string;
  readonly session_id?: string;
  readonly project_id?: string;
  readonly compiled_at?: string;
  readonly trigger_count: number;
  readonly created_by_id?: string;
  readonly created_date?: string;
  readonly updated_date?: string;
}

// ── Resultado de validação ─────────────────────────────────────────────────────

export interface WatchValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ── Dry Run Result (verifica se providers estão acessíveis) ───────────────────

export interface DryRunResult {
  readonly passed: boolean;
  readonly providerChecks: readonly ProviderCheck[];
}

export interface ProviderCheck {
  readonly provider: string;
  readonly available: boolean;
  readonly reason?: string;
}

// ── Métricas do Registry ───────────────────────────────────────────────────────

export interface WatchRegistryMetrics {
  readonly totalWatches: number;
  readonly activeWatches: number;
  readonly pausedWatches: number;
  readonly errorWatches: number;
  readonly invalidWatches: number;
  readonly totalTriggers: number;
}