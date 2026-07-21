/**
 * ExecutionOutcome.ts — Execution Outcome Foundation
 *
 * Re-exporta o tipo ExecutionOutcome e os tipos relacionados como
 * ponto de entrada publico da camada.
 *
 * A criacao de instancias e responsabilidade exclusiva do ExecutionOutcomeFactory.
 *
 * Sem logica. Sem rede. Sem dependencias externas alem de ExecutionOutcomeTypes.
 */

export type {
  ExecutionOutcome,
  ExecutionOutcomeInput,
  ExecutionCost,
  ExecutionConfidence,
  ExecutionProducer,
  ExecutionDomain,
  ErrorType,
  OutcomeValidationError,
} from "./ExecutionOutcomeTypes";