/**
 * SemanticTypes.ts — Engineering Sprint EF-6.3.x (Revisão Final)
 * Semantic Provider Layer — Shared Contracts
 *
 * SRP: apenas tipos e interfaces. Zero logica. Zero dominio.
 *
 * EF-6.3.x v2:
 *   - SemanticDetection.goalType agora e GoalType | null (opcional)
 *     Permite "domínio reconhecido, intenção indefinida"
 *   - SemanticProvider.detect() retorna SemanticDetection
 *   - 1 provider por domínio — decisão interna de goalType
 *   - LegacySemanticProvider mantido para retrocompatibilidade
 *
 * Plano de migração:
 *   Fase 1 (atual): Modern providers (detect) coexistem com Legacy (score)
 *   Fase 2: Migrar Gmail, Calendar, Memory para detect()
 *   Fase 3: Remover LegacySemanticProvider e adaptador
 */

import type { GoalType } from "@/lib/goals/GoalTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

/**
 * Resultado completo de uma deteccao semantica.
 *
 * goalType e OPCIONAL — permite representar "domínio reconhecido,
 * intenção indefinida" sem forcar o provider a inventar um goalType.
 *
 * Quando goalType=null e confidence>threshold, o detector deve
 * sinalizar domain_detected_no_intent e cair no fallback do GoalRegistry.
 */
export interface SemanticDetection {
  /** Identificador canonico do connector (ex: "drive", "gmail") */
  readonly connector:  string;

  /**
   * GoalType especifico resolvido para esta mensagem.
   * null = domínio reconhecido mas intenção nao determinada.
   */
  readonly goalType:   GoalType | null;

  /** Confianca numerica 0..1 */
  readonly confidence: number;

  /** Evidencias auditaveis — lista de strings descritivas */
  readonly evidences:  readonly string[];

  /**
   * Entidades extraidas da mensagem.
   * Contrato padrao de entidades (EF-6.3.x):
   *   fileName    — nome do arquivo mencionado
   *   folderName  — pasta mencionada
   *   mimeType    — tipo MIME explicito
   *   extension   — extensao (.pdf, .xlsx)
   *   owner       — proprietario mencionado
   *   date        — data/periodo mencionado
   *   rawText     — texto original (sempre presente)
   */
  readonly entities:   Readonly<Record<string, unknown>>;
}

/**
 * Interface que todo SemanticProvider moderno deve implementar.
 *
 * Contrato EF-6.3.x:
 *   - 1 provider por domínio (connectorId unico no registry)
 *   - detect() retorna SemanticDetection (goalType pode ser null)
 *   - decisao de goalType ocorre DENTRO do provider via regras declarativas
 *   - o detector nunca conhece dominios — apenas orquestra providers
 *
 * Para adicionar nova intenção ao Drive: adicionar 1 regra em INTENT_RULES.
 * Nenhum algoritmo do detector muda.
 */
export interface SemanticProvider {
  readonly connectorId: string;

  /**
   * Detecta conector + intencao + confianca para a mensagem.
   * Garantias: puro, deterministico, sem efeitos colaterais, sem rede.
   */
  detect(lower: string, normalized: NormalizationResult): SemanticDetection;
}

/**
 * Interface de retrocompatibilidade para providers legados (Sprint 9.2.2).
 * Gmail, Calendar, Memory ainda utilizam este contrato.
 *
 * Plano de migração Fase 2:
 *   Migrar cada um para SemanticProvider.detect() progressivamente.
 *   Quando todos migrados, remover esta interface e o adaptador no detector.
 */
export interface LegacySemanticProvider {
  readonly connectorId:      string;
  readonly implicitGoalType: GoalType;
  score(lower: string, normalized: NormalizationResult): { score: number; evidences: readonly string[] };
}

/** Type guard: provider moderno (detect) */
export function isModernProvider(p: unknown): p is SemanticProvider {
  return typeof (p as SemanticProvider).detect === "function";
}

/** Type guard: provider legado (score + implicitGoalType) */
export function isLegacyProvider(p: unknown): p is LegacySemanticProvider {
  return typeof (p as LegacySemanticProvider).score === "function"
      && typeof (p as LegacySemanticProvider).implicitGoalType === "string";
}