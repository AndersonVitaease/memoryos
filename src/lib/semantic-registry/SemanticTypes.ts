/**
 * SemanticTypes.ts — Engineering Sprint EF-6.3.x
 * Semantic Provider Layer — Shared Contracts
 *
 * SRP: apenas tipos e interfaces. Zero logica. Zero dominio.
 *
 * EF-6.3.x: SemanticProvider agora retorna SemanticDetection em vez de
 * SemanticScore + implicitGoalType fixo. Cada provider determina
 * internamente qual goalType vence — 1 provider por dominio.
 */

import type { GoalType } from "@/lib/goals/GoalTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

/**
 * Resultado completo de uma deteccao semantica.
 * Substitui SemanticScore + implicitGoalType como campos separados.
 *
 * O provider decide internamente:
 *   - qual connector
 *   - qual goalType (intenção especifica)
 *   - com que confianca
 *   - quais entidades extraidas
 */
export interface SemanticDetection {
  /** Identificador canonico do connector (ex: "drive", "gmail") */
  readonly connector:  string;

  /** GoalType especifico resolvido para esta mensagem (ex: "drive.downloadFile") */
  readonly goalType:   GoalType;

  /** Confianca numerica 0..1 */
  readonly confidence: number;

  /** Evidencias auditaveis — lista de strings descritivas */
  readonly evidences:  readonly string[];

  /** Entidades extraidas da mensagem (ex: { fileName: "orcamento" }) */
  readonly entities:   Readonly<Record<string, unknown>>;
}

/**
 * Interface que todo SemanticProvider deve implementar.
 *
 * Contrato EF-6.3.x:
 *   - 1 provider por dominio (connectorId unico no registry)
 *   - detect() retorna SemanticDetection com goalType especifico
 *   - o provider conhece todos os goalTypes do seu dominio
 *   - o detector nunca conhece dominios — apenas orquestra
 *
 * Compatibilidade retroativa: providers legados (Gmail, Calendar)
 * que ainda expõem `implicitGoalType` continuam funcionando via
 * adaptador interno no detector.
 */
export interface SemanticProvider {
  /** Identificador canonico do connector (ex: "gmail", "drive") */
  readonly connectorId: string;

  /**
   * Detecta conector + intencao + confianca para a mensagem.
   *
   * Garantias: puro, deterministico, sem efeitos colaterais, sem rede.
   *
   * @param lower      - mensagem ja em lowercase
   * @param normalized - resultado do NaturalLanguageGoalNormalizer
   */
  detect(lower: string, normalized: NormalizationResult): SemanticDetection;
}

// ── Backward-compatibility alias ─────────────────────────────────────────────
// Providers legados (Sprint 9.2.2) expõem `score()` + `implicitGoalType`.
// O adaptador no ImplicitConnectorIntentDetector os trata via esta interface.
export interface LegacySemanticProvider {
  readonly connectorId:      string;
  readonly implicitGoalType: GoalType;
  score(lower: string, normalized: NormalizationResult): { score: number; evidences: readonly string[] };
}

/** Type guard: verifica se o provider e novo (detect) ou legado (score) */
export function isModernProvider(p: unknown): p is SemanticProvider {
  return typeof (p as SemanticProvider).detect === "function";
}

export function isLegacyProvider(p: unknown): p is LegacySemanticProvider {
  return typeof (p as LegacySemanticProvider).score === "function"
      && typeof (p as LegacySemanticProvider).implicitGoalType === "string";
}