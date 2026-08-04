/**
 * Runtime.ts — EI-02 (RFC-008 / ADR-015)
 *
 * Facade publica unica para execucao de capabilities.
 *
 * Cadeia (hoje, EI-02 — pass-through):
 *   processCapability(request)
 *     → resolve connector no ConnectorRegistry
 *     → connector.execute(capability, params, context)
 *     → mapeia ConnectorResult → ExecutionOutcome
 *
 * Cadeia futura:
 *   EI-03: insere SafetyGate antes do dispatch (le reversibility).
 *   EI-05: insere ExecutionIntelligence antes do SafetyGate (enriquece).
 *
 * Invariants arquiteturais (ADR-015, nao-negociaveis):
 *   1. Bypass impossivel por construcao — o dispatch (connector.execute) e
 *      interno a processCapability. Nenhum metodo `dispatch` publico e exportado.
 *   2. Nenhum exempt caller — so existe processCapability como entrada.
 *   3. processCapability e puro wiring — hoje 1 chamada (dispatch), zero logica.
 *      Em EI-03/EI-05 vira 3 chamadas (Intelligence → Safety → dispatch), ainda
 *      zero logica (logica vive nos componentes).
 *
 * Hoje (EI-02): NENHUM caller invoca processCapability. A classe existe, compila,
 * e esta pronta para EI-04 (migracao gradual de callers). Zero risco em producao.
 */

import type { ConnectorRegistry } from "@/lib/connector-runtime/ConnectorRegistry";
import type {
  ConnectorMetadata,
  ConnectorResult,
  Reversibility,
} from "@/lib/connector-runtime/ConnectorTypes";
import type { ExecutionRequest, ExecutionOutcome } from "./ExecutionTypes";

export class ExecutionRuntime {
  constructor(private readonly _registry: ConnectorRegistry) {}

  /**
   * Unica entrada publica para execucao de capability.
   *
   * Hoje (EI-02): pass-through puro.
   *   - Resolve o connector no registry.
   *   - Le reversibility do metadata (EI-01) para incluir no outcome.
   *   - Chama connector.execute() e mapeia o resultado.
   *
   * Nenhum Safety Gate, nenhuma Intelligence ainda — vêm em EI-03/EI-05.
   * O dispatch (connector.execute) e interno: bypass impossivel.
   */
  async processCapability(request: ExecutionRequest): Promise<ExecutionOutcome> {
    const { connectorId, capability, params, context } = request;

    const connector = this._registry.get(connectorId);
    if (!connector) {
      return this._buildOutcome(request, "failed", null, `Unknown connector: "${connectorId}"`, "safe");
    }

    // Reversibility do metadata (EI-01). Default "safe" quando nao declarado.
    const meta: ConnectorMetadata = connector.metadata();
    const reversibility: Reversibility = meta.capabilityReversibility?.[capability] ?? "safe";

    try {
      const result: ConnectorResult = await connector.execute(capability, params, context);
      const status: ExecutionOutcome["status"] = result.success ? "success" : "failed";
      return this._buildOutcome(request, status, result, result.error ?? null, reversibility);
    } catch (e) {
      return this._buildOutcome(request, "failed", null, (e as Error).message, reversibility);
    }
  }

  private _buildOutcome(
    request: ExecutionRequest,
    status: ExecutionOutcome["status"],
    result: ConnectorResult | null,
    error: string | null,
    reversibility: Reversibility,
  ): ExecutionOutcome {
    return Object.freeze({
      status,
      connectorId: request.connectorId,
      capability: request.capability,
      result,
      error,
      reversibility,
    });
  }
}