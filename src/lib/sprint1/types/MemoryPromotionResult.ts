/**
 * MemoryPromotionResult — Resultado de promoção para LTM
 * Foundation: MRS Cap.3, MREM Etapa 10
 * Sprint: 1
 */

/** Resultado da promoção de Working Memory para Long Term Memory */
export interface MemoryPromotionResult {
  readonly success: boolean;
  readonly itemId: string;
  readonly key: string;
  readonly reason: PromotionReason;
  readonly promotedAt: number;
}

export type PromotionReason =
  | "manual"
  | "access_threshold"
  | "auto_promote_flag"
  | "not_eligible"
  | "already_promoted"
  | "item_not_found";