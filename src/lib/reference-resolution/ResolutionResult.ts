/**
 * ResolutionResult.ts — Sprint C-02.3 (upgrade from C-02.2)
 * Modelo de saida do Reference Resolution.
 *
 * Novos campos (C-02.3):
 *   reason              — Explainability: por que este resultado foi escolhido
 *   evaluation          — Relatorio completo de candidatos (Trust Panel futuro)
 *   confirmationRequired — true quando confidence < minimumConfidence
 */

import type { ReferenceResolutionReason } from "./core/ReferenceResolutionReason";
import type { ReferenceEvaluation, EvaluatedCandidate } from "./core/ReferenceEvaluation";

export interface ResolutionCandidate {
  /** Identificador tecnico do recurso */
  readonly resourceId: string;
  /** Nome legivel */
  readonly displayName: string;
  /** Score de confianca [0, 1] */
  readonly confidence: number;
  /** Razao do score deste candidato */
  readonly reason: ReferenceResolutionReason;
}

export interface ResolutionResult {
  readonly success: boolean;
  readonly connector: string;
  readonly referenceText: string;
  readonly resourceId: string | null;
  readonly displayName: string | null;
  readonly confidence: number;
  /** Razao da resolucao — Explainability */
  readonly reason: ReferenceResolutionReason;
  /** Lista de candidatos avaliados */
  readonly candidates: readonly ResolutionCandidate[];
  /** Relatorio detalhado de avaliacao (Trust Panel) */
  readonly evaluation: Readonly<ReferenceEvaluation>;
  /**
   * true quando confidence < minimumConfidence.
   * O recurso mais provavel e retornado mas NAO deve ser usado automaticamente.
   */
  readonly confirmationRequired: boolean;
  readonly error: string | null;
}

// ── Internal builder helpers ───────────────────────────────────────────────────

function buildEvaluation(
  totalEvaluated: number,
  candidates: ResolutionCandidate[],
  minimumConfidence: number,
): Readonly<ReferenceEvaluation> {
  const topScore = candidates[0]?.score ?? candidates[0]?.confidence ?? 0;
  const evaluated: EvaluatedCandidate[] = candidates.map((c, i) => Object.freeze({
    resourceId:  c.resourceId,
    displayName: c.displayName,
    score:       c.confidence,
    reason:      c.reason,
    selected:    i === 0,
  }));
  return Object.freeze({
    totalEvaluated,
    candidateCount: candidates.length,
    candidates:     Object.freeze(evaluated),
    topScore,
    thresholdMet:   topScore >= minimumConfidence,
  });
}

// ── Public builders ───────────────────────────────────────────────────────────

export function resolvedResult(
  connector: string,
  referenceText: string,
  candidates: ResolutionCandidate[],
  totalEvaluated: number,
  minimumConfidence: number,
): ResolutionResult {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0] ?? null;
  const confirmationRequired = best !== null && best.confidence < minimumConfidence;
  const reason: ReferenceResolutionReason = best === null
    ? "NO_MATCH"
    : confirmationRequired
      ? "USER_CONFIRMATION_REQUIRED"
      : best.reason;

  return Object.freeze({
    success:             best !== null,
    connector,
    referenceText,
    resourceId:          best?.resourceId  ?? null,
    displayName:         best?.displayName ?? null,
    confidence:          best?.confidence  ?? 0,
    reason,
    candidates:          Object.freeze(sorted),
    evaluation:          buildEvaluation(totalEvaluated, sorted, minimumConfidence),
    confirmationRequired,
    error:               best !== null ? null : "No matching resource found",
  });
}

export function failedResult(
  connector: string,
  referenceText: string,
  error: string,
): ResolutionResult {
  const evaluation: Readonly<ReferenceEvaluation> = Object.freeze({
    totalEvaluated: 0,
    candidateCount: 0,
    candidates:     Object.freeze([]),
    topScore:       0,
    thresholdMet:   false,
  });
  return Object.freeze({
    success:             false,
    connector,
    referenceText,
    resourceId:          null,
    displayName:         null,
    confidence:          0,
    reason:              "NO_MATCH" as ReferenceResolutionReason,
    candidates:          Object.freeze([]),
    evaluation,
    confirmationRequired: false,
    error,
  });
}