/**
 * Runtime.ts — EI-03 (RFC-008 / ADR-015)
 *
 * Facade publica unica para execucao de capabilities.
 *
 * Cadeia (EI-03):
 *   processCapability(request)
 *     → resolve connector no ConnectorRegistry
 *     → le reversibility do metadata (EI-01)
 *     → SafetyGate.guard(request, reversibility)          [NOVO EI-03]
 *     → se approved: connector.execute() → ExecutionOutcome
 *     → se needs_confirmation/blocked: retorna SEM despachar
 *
 * Cadeia futura:
 *   EI-05 insere ExecutionIntelligence antes do SafetyGate (enriquece).
 *
 * Invariants arquiteturais (ADR-015, nao-negociaveis):
 *   1. Bypass impossivel por construcao — o dispatch (connector.execute) e
 *      interno a processCapability. Nenhum metodo `dispatch` publico e
 *      exportado. O SafetyGate NUNCA despacha — so decide.
 *   2. Nenhum exempt caller — so existe processCapability como entrada.
 *   3. processCapability e puro wiring — 3 chamadas (resolve+guard+dispatch),
 *      zero logica de negocio (logica vive no SafetyGate e nos connectors).
 *
 * So ativa para quem chama processCapability. Nenhum caller migrou ainda
 * (isso e EI-04) — o caminho antigo (ConnectorRegistry direto) segue 100%
 * intocado.
 */

import type { ConnectorRegistry } from "@/lib/connector-runtime/ConnectorRegistry";
import type {
  ConnectorMetadata,
  ConnectorResult,
  Reversibility,
} from "@/lib/connector-runtime/ConnectorTypes";
import type { ExecutionRequest, ExecutionOutcome, SafetyDecision } from "./ExecutionTypes";
import { SafetyGate } from "./SafetyGate";

export class ExecutionRuntime {
  private readonly _safety: SafetyGate;

  constructor(private readonly _registry: ConnectorRegistry) {
    // SafetyGate e stateless — instanciado internamente, sem DI.
    this._safety = new SafetyGate();
  }

  /**
   * Unica entrada publica para execucao de capability.
   *
   * Hoje (EI-03): resolve connector → le reversibility → SafetyGate →
   * (se approved) dispatch. Se o SafetyGate pedir confirmacao ou bloquear,
   * retorna imediatamente sem despachar (protecao do irreversivel).
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

    // EI-03: Safety Gate antes do dispatch.
    const decision: SafetyDecision = this._safety.guard(request, reversibility);
    if (decision.type !== "approved") {
      const message = decision.type === "needs_confirmation" ? decision.summary : decision.reason;
      return this._buildOutcome(request, decision.type, null, message, reversibility);
    }

    // Approved → dispatch (interno; bypass impossivel).
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
    message: string | null,
    reversibility: Reversibility,
  ): ExecutionOutcome {
    return Object.freeze({
      status,
      connectorId: request.connectorId,
      capability: request.capability,
      result,
      message,
      reversibility,
    });
  }
}