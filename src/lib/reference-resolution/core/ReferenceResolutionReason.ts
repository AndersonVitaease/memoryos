/**
 * ReferenceResolutionReason.ts — Sprint C-02.3
 * Enum de razoes de resolucao — garante Explainability.
 *
 * Todo ResolutionResult deve conter exatamente uma razao.
 * Isso permite auditoria, debug e futura analise estatistica.
 */

export type ReferenceResolutionReason =
  /** Titulo identico (case-insensitive) */
  | "EXACT_MATCH"
  /** Titulo inicia com a referencia */
  | "PREFIX_MATCH"
  /** Titulo ou campo secundario contem a referencia */
  | "CONTAINS_MATCH"
  /** Recurso mais recente selecionado como fallback */
  | "RECENT_RESOURCE"
  /** Confianca abaixo do limiar — usuario deve confirmar */
  | "USER_CONFIRMATION_REQUIRED"
  /** Nenhum recurso encontrado */
  | "NO_MATCH";

/** Mapa legivel para UI / logs */
export const REASON_LABELS: Readonly<Record<ReferenceResolutionReason, string>> = Object.freeze({
  EXACT_MATCH:               "Correspondencia exata",
  PREFIX_MATCH:              "Titulo inicia com a referencia",
  CONTAINS_MATCH:            "Titulo contem a referencia",
  RECENT_RESOURCE:           "Recurso mais recente (fallback)",
  USER_CONFIRMATION_REQUIRED: "Confianca insuficiente — confirmacao necessaria",
  NO_MATCH:                  "Nenhum recurso encontrado",
});