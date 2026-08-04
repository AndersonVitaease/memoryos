/**
 * index.ts — EI-06 wiring (RFC-008 / ADR-015)
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

let _runtime: ExecutionRuntime | null = null;
let _runtimePromise: Promise<ExecutionRuntime> | null = null;

/**
 * Retorna a ExecutionRuntime single wired ao engine + registry reais.
 * Idempotente: todas as chamadas retornam a mesma instancia apos o bootstrap.
 */
export async function getExecutionRuntime(): Promise<ExecutionRuntime> {
  if (_runtime) return _runtime;
  if (_runtimePromise) return _runtimePromise;

  _runtimePromise = (async () => {
    const [{ getRealRuntimeEngine, getRealConnectorRegistry }, { ExecutionRuntime: Cls }] = await Promise.all([
      import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider"),
      import("./Runtime"),
    ]);
    const [engine, registry] = await Promise.all([
      getRealRuntimeEngine(),
      getRealConnectorRegistry(),
    ]);
    _runtime = new Cls(registry, engine);
    return _runtime;
  })();

  try {
    return await _runtimePromise;
  } catch (e) {
    // Falha no bootstrap: reset p/ proxima chamada tentar de novo.
    _runtimePromise = null;
    throw e;
  }
}

export { ExecutionRuntime } from "./Runtime";
export { SafetyGate } from "./SafetyGate";
export { ExecutionIntelligence } from "./ExecutionIntelligence";
export { investigatorRegistry } from "./investigators/InvestigatorRegistry";
export { GenericFieldValidator } from "./investigators/GenericFieldValidator";
export { DateFormatValidator } from "./investigators/DateFormatValidator";
export type { Investigator, InvestigationFinding } from "./investigators/InvestigatorTypes";
export type {
  ExecutionRequest,
  PreparedExecution,
  ExecutionGap,
  SafetyDecision,
  ExecutionOutcome,
  ExecutionContext,
  ExecutionStage,
} from "./ExecutionTypes";