/**
 * index.ts — EI-07 wiring (RFC-008 / ADR-015)
 *
 * Expoe getExecutionRuntime() — uma ExecutionRuntime wired ao REAL
 * ConversationRuntimeEngine + ConnectorRegistry (de ConnectorRuntimeProvider,
 * o mesmo que o ConversationPipeline usa em producao).
 *
 * Lazy: a primeira chamada aguarda o bootstrap do engine/registry real
 * (que o ConnectorRuntimeProvider ja dispara no module load). Chamadas
 * concorrentes compartilham a mesma Promise.
 *
 * Nenhum caller vivo importa este modulo ainda — a migracao de callers e
 * EI-04 sub-step futuro, apos EI-06/EI-07 darem ao Safety Gate contexto real
 * para decidir irreversiveis sem quebrar automation (Watch Engine / email
 * agendado). Aqui so preparamos o wiring, zero impacto em producao.
 */

import type { ExecutionRuntime } from "./Runtime";

// EI-07: registra investigators de dominio (Travel, Email) no load do wiring.
import "./investigators/registerDefaults";

/**
 * Retorna a ExecutionRuntime wired ao engine + registry reais.
 *
 * FIX: NAO cacheia a instancia — resolve o registry/engine frescos a cada
 * chamada. O registry/engine ja sao singletons globalThis (barato), e criar
 * ExecutionRuntime e leve (stateless Intelligence/SafetyGate). Isso elimina
 * o bug do _runtime cacheado com um registry obsoleto/pos-HMR vazio, que
 * produzia "Unknown connector: 'gmail'" mesmo com o gmail registrado no
 * registry atual do pipeline.
 */
export async function getExecutionRuntime(): Promise<ExecutionRuntime> {
  const [{ getRealRuntimeEngine, getRealConnectorRegistry }, { ExecutionRuntime: Cls }] = await Promise.all([
    import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider"),
    import("./Runtime"),
  ]);
  const [engine, registry] = await Promise.all([
    getRealRuntimeEngine(),
    getRealConnectorRegistry(),
  ]);
  return new Cls(registry, engine);
}

export { ExecutionRuntime } from "./Runtime";
export { SafetyGate } from "./SafetyGate";
export { ExecutionIntelligence } from "./ExecutionIntelligence";
export { investigatorRegistry } from "./investigators/InvestigatorRegistry";
export { GenericFieldValidator } from "./investigators/GenericFieldValidator";
export { DateFormatValidator } from "./investigators/DateFormatValidator";
export { TravelInvestigator } from "./investigators/TravelInvestigator";
export { EmailInvestigator } from "./investigators/EmailInvestigator";
export { registerDefaultInvestigators } from "./investigators/registerDefaults";
export type { Investigator, InvestigationFinding } from "./investigators/InvestigatorTypes";
export type {
  ExecutionRequest,
  PreparedExecution,
  ExecutionGap,
  IntelligenceBudget,
  SafetyDecision,
  ExecutionOutcome,
  ExecutionContext,
  ExecutionStage,
} from "./ExecutionTypes";
export { DEFAULT_BUDGET } from "./ExecutionTypes";