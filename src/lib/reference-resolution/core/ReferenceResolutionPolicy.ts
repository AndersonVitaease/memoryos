/**
 * ReferenceResolutionPolicy.ts — Sprint C-02.3
 * Centraliza todos os pesos e limiares do algoritmo de resolucao.
 *
 * SRP: ser a unica fonte de verdade para scores e thresholds.
 * Nenhum numero magico pode aparecer dentro dos algoritmos.
 *
 * Open/Closed: novos niveis de match sao adicionados aqui,
 * sem alterar os resolvers.
 */

export interface ReferenceResolutionPolicy {
  // ── Scores de matching (recursos) ────────────────────────────────────────────
  /** Titulo identico (case-insensitive) */
  readonly EXACT_MATCH: number;
  /** Titulo inicia com a referencia (case-insensitive) */
  readonly PREFIX_MATCH: number;
  /** Titulo contem a referencia (case-insensitive) */
  readonly CONTAINS_MATCH: number;
  /** Recurso mais recente quando nenhum match foi encontrado */
  readonly RECENT_RESOURCE_FALLBACK: number;

  // ── Scores de matching (mensagens) ───────────────────────────────────────────
  /** Titulo identico (case-insensitive) */
  readonly MESSAGE_TITLE_EXACT: number;
  /** Autor identico (case-insensitive) */
  readonly MESSAGE_AUTHOR_EXACT: number;
  /** Titulo contem a referencia (case-insensitive) */
  readonly MESSAGE_TITLE_CONTAINS: number;
  /** Autor contem a referencia (case-insensitive) */
  readonly MESSAGE_AUTHOR_CONTAINS: number;
  /** Summary contem a referencia (case-insensitive) */
  readonly MESSAGE_SUMMARY_CONTAINS: number;
  /** Mensagem mais recente quando nenhum match foi encontrado */
  readonly RECENT_MESSAGE_FALLBACK: number;

  // ── Limiar de confianca ───────────────────────────────────────────────────────
  /**
   * Confianca minima para selecao automatica.
   * Se confidence < minimumConfidence → confirmationRequired = true.
   * O fallback nunca sera selecionado automaticamente (fallback < minimumConfidence).
   */
  readonly minimumConfidence: number;

  // ── Limites operacionais ─────────────────────────────────────────────────────
  /** Maximo de candidatos retornados (padrao, pode ser sobrescrito por contexto) */
  readonly maxCandidates: number;
}

// ── Policy padrao ─────────────────────────────────────────────────────────────

export const DEFAULT_POLICY: Readonly<ReferenceResolutionPolicy> = Object.freeze({
  EXACT_MATCH:             1.00,
  PREFIX_MATCH:            0.85,
  CONTAINS_MATCH:          0.65,
  RECENT_RESOURCE_FALLBACK: 0.30,

  MESSAGE_TITLE_EXACT:     1.00,
  MESSAGE_AUTHOR_EXACT:    0.95,
  MESSAGE_TITLE_CONTAINS:  0.75,
  MESSAGE_AUTHOR_CONTAINS: 0.60,
  MESSAGE_SUMMARY_CONTAINS: 0.45,
  RECENT_MESSAGE_FALLBACK: 0.20,

  minimumConfidence: 0.50,
  maxCandidates:     10,
});