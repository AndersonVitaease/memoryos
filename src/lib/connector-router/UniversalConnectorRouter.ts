/**
 * UniversalConnectorRouter.ts — Engineering Sprint E-02.4
 * The single routing layer between the Runtime and every Connector.
 *
 * SRP: receber ExecutionStep → localizar Connector → localizar Capability →
 *      executar → retornar RouterResult.
 *
 * Dependency Inversion: depende de ConnectorRegistry (interface de lookup),
 * não de nenhuma implementação concreta de connector.
 *
 * Open/Closed: novos connectors são adicionados via registry.register()
 * sem modificar este arquivo.
 *
 * Este é o ÚNICO arquivo do sistema que conhece a existência de connectors.
 * Runtime, Dispatcher e Pipeline continuam sem conhecer connectors.
 *
 * Nenhuma rede. Nenhum OAuth.
 */

import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { RouterResult }  from "./UCRTypes";
import { ConnectorRegistry }  from "./ConnectorRegistry";

// ── UniversalConnectorRouter ──────────────────────────────────────────────────

export class UniversalConnectorRouter {
  constructor(private readonly _registry: ConnectorRegistry) {}

  /**
   * Routes an ExecutionStep to the correct connector and executes it.
   * Never throws — always returns a RouterResult.
   */
  async route(executionId: string, step: ExecutionStep): Promise<RouterResult> {
    const connector = this._registry.lookup(step.connector);

    // [RUNTIME-PROBE][UCR-01] UniversalConnectorRouter lookup result — THE DECISIVE PROBE
    console.log("[RUNTIME-PROBE][UCR-01]", {
      probe:           "router:lookup",
      t:               performance.now(),
      ts:              Date.now(),
      executionId,
      connector:       step.connector,
      capability:      step.capability,
      lookupResult:    connector === null ? "NULL — NOT FOUND" : `FOUND: ${(connector as any).connectorId?.() ?? (connector as any).id ?? "?"}`,
      regSize:         this._registry.size(),
      regContents:     this._registry.list(),
      note:            "CRITICAL: regSize===0 + lookupResult=NULL is the definitive race condition signature.",
    });

    if (!connector) {
      return Object.freeze({
        found:             false,
        connectorId:       step.connector,
        capability:        step.capability,
        result:            null,
        // C-05: connector_not_registered is semantically distinct from a runtime failure
        notFoundReason:    "connector_not_registered" as const,
        error:             `Connector not found: "${step.connector}"`,
      });
    }

    // Verify the connector advertises this capability
    const hasCapability = connector
      .capabilities()
      .some((c) => c.id === step.capability);

    if (!hasCapability) {
      return Object.freeze({
        found:          false,
        connectorId:    step.connector,
        capability:     step.capability,
        result:         null,
        // C-05: capability_not_declared is semantically distinct from connector_not_registered
        notFoundReason: "capability_not_declared" as const,
        error:          `Capability "${step.capability}" not found on connector "${step.connector}"`,
      });
    }

    const result = await connector.execute({
      executionId,
      capability:  step.capability,
      parameters:  step.parameters,
    });

    // [UCR-PROBE-02] Result returned by connector.execute() (UCRTypes.ConnectorResult)
    console.log("[UCR-PROBE-02]", {
      probe:          "router:connectorExecuteResult",
      t:              performance.now(),
      executionId,
      connectorId:    step.connector,
      capability:     step.capability,
      resultStatus:   result.status,
      resultOutputPresent: (result as any).output !== undefined,
      resultOutputIsNull:  (result as any).output === null,
      resultDataPresent:   (result as any).data !== undefined,
      resultKeys:     Object.keys(result as object),
      constructorName: (result as any)?.constructor?.name ?? "Object",
    });

    return Object.freeze({
      found:       true,
      connectorId: step.connector,
      capability:  step.capability,
      result,
      error:       result.status !== "success" ? result.error : null,
    });
  }

  /** Returns the registry (for inspection/testing). */
  registry(): ConnectorRegistry {
    return this._registry;
  }
}