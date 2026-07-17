/**
 * ReferenceScoringEngine.ts — Sprint C-02.4
 * Orquestrador central do algoritmo de ranking.
 *
 * Responsabilidade: receber candidatos brutos, calcular scores via Policy,
 * ordenar via Sorter e selecionar via Selector.
 *
 * Nao conhece: Connectors, Drive, Gmail, Telemetria, ResolutionResult.
 * Toda inteligencia de ranking centralizada aqui.
 *
 * Input:  RawScoringInput[]  (resourceId + fields para matching)
 * Output: ReferenceScoringResult
 */

import { ReferenceMatcher }                       from "./ReferenceMatcher";
import { ReferenceSorter }                         from "./ReferenceSorter";
import { ReferenceSelector }                       from "./ReferenceSelector";
import type { ReferenceResolutionPolicy }          from "./ReferenceResolutionPolicy";
import { DEFAULT_POLICY }                          from "./ReferenceResolutionPolicy";
import type { MatchType }                          from "./ReferenceMatcher";
import type { ScoredCandidate, ReferenceScoringResult } from "./ReferenceScoringResult";
import type { ReferenceResolutionReason }          from "./ReferenceResolutionReason";
import type { EvaluatedCandidate }                 from "./ReferenceEvaluation";

// ── Input contract ────────────────────────────────────────────────────────────

/**
 * Campo de matching generico — o adapter fornece os campos relevantes.
 * O Engine nao sabe se sao titulos de arquivos ou assuntos de e-mail.
 */
export interface ScoringField {
  /** Valor do campo a ser comparado */
  readonly value: string;
  /** Score maximo quando este campo for EXACT_MATCH */
  readonly exactScore: number;
  /** Score quando PREFIX_MATCH (0 para campos sem prefix relevante) */
  readonly prefixScore: number;
  /** Score quando CONTAINS_MATCH */
  readonly containsScore: number;
}

export interface RawScoringInput {
  /** Identificador tecnico do recurso */
  readonly resourceId:   string;
  /** Nome legivel do recurso */
  readonly displayName:  string;
  /**
   * Campos a comparar, em ordem de prioridade decrescente.
   * O Engine tenta cada campo e retorna o maior score encontrado.
   */
  readonly fields: readonly ScoringField[];
  /** Chave para ordenacao de fallback por recencia (ISO 8601 ou epoch) */
  readonly recencyKey?: string;
}

// ── ReferenceScoringEngine ────────────────────────────────────────────────────

export class ReferenceScoringEngine {
  private readonly _matcher:  ReferenceMatcher;
  private readonly _sorter:   ReferenceSorter;
  private readonly _selector: ReferenceSelector;
  private readonly _policy:   Readonly<ReferenceResolutionPolicy>;

  constructor(policy?: Readonly<ReferenceResolutionPolicy>) {
    this._policy   = policy ?? DEFAULT_POLICY;
    this._matcher  = new ReferenceMatcher();
    this._sorter   = new ReferenceSorter();
    this._selector = new ReferenceSelector();
  }

  /**
   * Executa o pipeline completo de scoring para uma query.
   * Nunca lanca excecao. Retorna ScoringResult vazio se sem candidatos.
   */
  score(
    inputs: readonly RawScoringInput[],
    query:  string,
    maxCandidates?: number,
  ): ReferenceScoringResult {
    const max = maxCandidates ?? this._policy.maxCandidates;
    const q   = query.trim();

    // ── Step 1: score each input ──────────────────────────────────────────────
    const scored: ScoredCandidate[] = [];
    let   fallback: RawScoringInput | null = null;
    let   latestRecency = "";

    for (const input of inputs) {
      // Track recency fallback
      const rk = input.recencyKey ?? "";
      if (rk > latestRecency) { latestRecency = rk; fallback = input; }

      if (!q) continue;

      const { score, reason } = this._scoreInput(input, q);
      if (score > 0) {
        scored.push(Object.freeze({ resourceId: input.resourceId, displayName: input.displayName, confidence: score, reason }));
      }
    }

    // ── Step 2: fallback when no match found ──────────────────────────────────
    if (scored.length === 0 && fallback) {
      scored.push(Object.freeze({
        resourceId:  fallback.resourceId,
        displayName: fallback.displayName,
        confidence:  this._policy.RECENT_RESOURCE_FALLBACK,
        reason:      "RECENT_RESOURCE" as ReferenceResolutionReason,
      }));
    }

    // ── Step 3: sort ──────────────────────────────────────────────────────────
    const sorted  = this._sorter.sort(scored).slice(0, max);

    // ── Step 4: select ────────────────────────────────────────────────────────
    const selection = this._selector.select(sorted, this._policy.minimumConfidence);

    // ── Step 5: build evaluation report ──────────────────────────────────────
    const topScore = sorted[0]?.confidence ?? 0;
    const evaluated: EvaluatedCandidate[] = sorted.map((c, i) => Object.freeze({
      resourceId:  c.resourceId,
      displayName: c.displayName,
      score:       c.confidence,
      reason:      c.reason,
      selected:    i === 0,
    }));

    const evaluation = Object.freeze({
      totalEvaluated: inputs.length,
      candidateCount: sorted.length,
      candidates:     Object.freeze(evaluated),
      topScore,
      thresholdMet:   topScore >= this._policy.minimumConfidence,
    });

    return Object.freeze({
      selected:            selection.winner,
      candidates:          Object.freeze(sorted),
      evaluation,
      reason:              selection.reason,
      confidence:          selection.winner?.confidence ?? 0,
      confirmationRequired: selection.confirmationRequired,
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _scoreInput(
    input: RawScoringInput,
    query: string,
  ): { score: number; reason: ReferenceResolutionReason } {
    let bestScore  = 0;
    let bestReason: ReferenceResolutionReason = "NO_MATCH";

    for (const field of input.fields) {
      const matchType: MatchType = this._matcher.match(field.value, query);
      let score = 0;
      if      (matchType === "EXACT")    score = field.exactScore;
      else if (matchType === "PREFIX")   score = field.prefixScore;
      else if (matchType === "CONTAINS") score = field.containsScore;

      if (score > bestScore) {
        bestScore = score;
        bestReason = matchType === "NONE" ? "NO_MATCH"
          : matchType === "EXACT"   ? "EXACT_MATCH"
          : matchType === "PREFIX"  ? "PREFIX_MATCH"
          : "CONTAINS_MATCH";
      }
    }

    return { score: bestScore, reason: bestReason };
  }
}