/**
 * SemanticTypes.ts — Engineering Sprint 9.2.2
 * Semantic Provider Layer — Shared Contracts
 *
 * SRP: apenas tipos e interfaces. Zero logica. Zero dominio.
 */

import type { GoalType } from "@/lib/goals/GoalTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

/** Score produzido por um SemanticProvider para uma mensagem. */
export interface SemanticScore {
  readonly score:     number;              // 0..1
  readonly evidences: readonly string[];   // explicacao auditavel
}

/**
 * Interface que todo SemanticProvider deve implementar.
 * O provider conhece seu dominio; o detector nunca conhece.
 */
export interface SemanticProvider {
  /** Identificador canonico do connector (ex: "gmail", "slack") */
  readonly connectorId: string;

  /**
   * GoalType implicito a usar quando este provider vence.
   * Ex: "gmail.searchMessages", "calendar.listToday"
   */
  readonly implicitGoalType: GoalType;

  /**
   * Calcula o score semantico para a mensagem.
   * Garantias: puro, determinístico, sem efeitos colaterais, sem rede.
   *
   * @param lower      — mensagem ja em lowercase
   * @param normalized — resultado do NaturalLanguageGoalNormalizer
   */
  score(lower: string, normalized: NormalizationResult): SemanticScore;
}