/**
 * ResolutionResult.ts — Sprint C-02.2
 * Modelo de saida do Reference Resolution MVP.
 *
 * SRP: representar o resultado de uma resolucao — identificador tecnico + metadados.
 * Imutavel. Sem logica de negocio.
 */

export interface ResolutionCandidate {
  /** Identificador tecnico do recurso (fileId ou messageId) */
  readonly resourceId: string;
  /** Nome legivel do recurso */
  readonly displayName: string;
  /** Score de confianca determinístico [0, 1] */
  readonly confidence: number;
}

export interface ResolutionResult {
  readonly success: boolean;
  /** Connector onde a resolucao ocorreu */
  readonly connector: string;
  /** Referencia humana original */
  readonly referenceText: string;
  /** Identificador tecnico do recurso com maior confianca (null se nao resolvido) */
  readonly resourceId: string | null;
  /** Nome legivel do recurso principal (null se nao resolvido) */
  readonly displayName: string | null;
  /** Confianca do resultado principal [0, 1] (0 se nao resolvido) */
  readonly confidence: number;
  /** Lista completa de candidatos — util para tratamento de ambiguidade */
  readonly candidates: readonly ResolutionCandidate[];
  /** Razao de falha quando success=false */
  readonly error: string | null;
}

// ── Builders ───────────────────────────────────────────────────────────────────

export function resolvedResult(
  connector: string,
  referenceText: string,
  candidates: ResolutionCandidate[],
): ResolutionResult {
  // Sort by confidence descending — deterministic
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0] ?? null;
  return Object.freeze({
    success:       best !== null,
    connector,
    referenceText,
    resourceId:    best?.resourceId  ?? null,
    displayName:   best?.displayName ?? null,
    confidence:    best?.confidence  ?? 0,
    candidates:    Object.freeze(sorted),
    error:         best !== null ? null : "No matching resource found",
  });
}

export function failedResult(
  connector: string,
  referenceText: string,
  error: string,
): ResolutionResult {
  return Object.freeze({
    success:       false,
    connector,
    referenceText,
    resourceId:    null,
    displayName:   null,
    confidence:    0,
    candidates:    Object.freeze([]),
    error,
  });
}