/**
 * StateViewTypes.ts — Contratos do StateView (Read Model) v1.0
 *
 * O StateView é a projecao materializada das KnowledgeObservations para
 * consumo pelo Planner. Fase 2: leitura passiva — alimenta contexto do LLM
 * como enriquecimento opcional, com feature flag.
 */

import type { ObservationNature, ContextScope, PayloadType } from "./KnowledgeRegistryTypes";

// ── Estado consolidado de um objeto de conhecimento ──────────────────────────

export interface KnowledgeObjectState {
  readonly objectId:    string;
  readonly objectType:  string;
  readonly scope:       ContextScope;
  readonly sessionId:   string | null;
  readonly projectId:   string | null;
  /** Observacoes ativas (nao refutadas) deste objeto, ordenadas por createdAt desc */
  readonly observations: readonly StateObservation[];
  /** Confianca media ponderada das observacoes ativas */
  readonly confidence:   number;
  /** Ultima atualizacao (ms epoch) */
  readonly lastUpdatedAt: number;
  /** true se existir CONFLICT_ALERT nao resolvido para este objeto */
  readonly hasConflict:  boolean;
}

export interface StateObservation {
  readonly id:          string;
  readonly nature:      ObservationNature;
  readonly payloadType: PayloadType;
  readonly data:        Record<string, unknown>;
  readonly confidence:  number;
  readonly producerId:  string;
  readonly executionId: string | null;
  readonly createdAt:   number;
}

// ── Resultado de uma query ao StateView ──────────────────────────────────────

export interface StateViewQueryResult {
  readonly sessionId:     string;
  readonly objects:       readonly KnowledgeObjectState[];
  readonly totalObjects:  number;
  readonly builtAt:       number;
  readonly durationMs:    number;
  /** Contexto formatado pronto para injecao no prompt do LLM */
  readonly llmContext:    string | null;
}

// ── Feature flag ─────────────────────────────────────────────────────────────

export interface StateViewFeatureFlags {
  /** Se true, StateView e construido e logado (mas nao injetado no LLM ainda) */
  readonly readEnabled:   boolean;
  /** Se true, llmContext e injetado no prompt do LLM como contexto adicional */
  readonly injectEnabled: boolean;
}